#!/usr/bin/env node
// Instala vault e motor somente em pastas inexistentes. Instalação encontrada exige escolha humana.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, rmdirSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { downloadPackage, enclosingInstallation, safePath, TAG_RE } from './update.mjs';
import { isBrainRoot } from './lib/installation.mjs';
import { applySplit, planSplit } from './lib/projection.mjs';

export function installationChoices(destination) {
  if (!existsSync(destination)) return { status: 'new-folder', destination };
  const brain = isBrainRoot(destination)
    || ['COMECE-AQUI.md', 'VERSION', '.cerebro'].every(item => existsSync(join(destination, item)))
    || existsSync(join(destination, '.cerebro/motor'));
  return {
    status: brain ? 'existing-brain' : 'existing-folder', destination,
    choices: [
      { action: 'use-existing', label: 'Usar o existente', next: 'auditar-cerebro, depois comecar se necessário' },
      { action: 'new-folder', label: 'Instalar novo em pasta nova', next: 'Escolha outro destino inexistente' },
      { action: 'migrate', label: 'Migrar', next: 'migrar-cerebro: primeiro planejar e pedir aprovação' },
    ],
    written: false,
  };
}

/** Padrão: irmãs `<pai>/notas` e `<pai>/motor` (D1); `--motor` ausente deriva do vault. */
export function defaultFolders({ vault, motor } = {}) {
  const base = join(homedir(), 'Cerebro');
  const v = resolve(vault || join(base, 'notas'));
  return { vault: v, motor: resolve(motor || join(dirname(v), 'motor')) };
}

/** Instalação nova nunca nasce dentro de um vault ou de um motor existentes (nenhum ancestral com marcador). */
function assertOutsideInstallations(destinations) {
  for (const destination of destinations) {
    if (enclosingInstallation(resolve(destination, '..'))) {
      throw new Error('destination-inside-installation: o destino está dentro de uma instalação existente do Cérebro. Escolha uma pasta fora dela.');
    }
  }
}

/** Primeiros ancestrais que ainda não existem, do mais alto ao mais baixo (os que o mkdir recursivo vai criar). */
function missingParents(folder) {
  const missing = [];
  for (let dir = resolve(folder, '..'); !existsSync(dir) && dirname(dir) !== dir; dir = dirname(dir)) missing.unshift(dir);
  return missing;
}

function nested(a, b) {
  return a === b || a.startsWith(b + sep) || b.startsWith(a + sep);
}

/** Cria vault e motor, ambos exclusivos. Existindo qualquer um, devolve as escolhas sem escrever. */
export function installPackage({ vault, motor }, source, tag, { apply = false, write } = {}) {
  const folders = defaultFolders({ vault, motor });
  if (nested(folders.vault, folders.motor)) throw new Error('vault-and-motor-must-be-separate');
  assertOutsideInstallations([folders.vault, folders.motor]);
  for (const destination of [folders.vault, folders.motor]) {
    const choice = installationChoices(destination);
    if (choice.status !== 'new-folder') return choice;
  }
  // Verificar ancestrais; não seguir symlinks de destino nem copiar credenciais.
  for (const destination of [folders.vault, folders.motor]) {
    let base = resolve(destination, '..');
    while (!existsSync(base) && dirname(base) !== base) base = dirname(base);
    safePath(base, destination.slice(base.length + 1) || '.');
  }
  if (!TAG_RE.test(tag || '')) throw new Error('explicit-tag-required');
  for (const required of ['COMECE-AQUI.md', '.cerebro/motor.manifest', 'templates/vault/AGENTS.md', 'templates/vault/.cerebro/bin/cerebro.mjs']) {
    if (!existsSync(safePath(source, required))) throw new Error('installation-package-incomplete');
  }
  const plan = planSplit({ motor: folders.motor, vault: folders.vault, source, tag, fresh: true });
  if (!apply) return { status: 'preview', tag, vault: folders.vault, motor: folders.motor, written: false, files: plan.summary };
  // Exclusivas: não reutiliza pasta criada entre prévia e aplicação.
  const createdParents = [...new Set([...missingParents(folders.motor), ...missingParents(folders.vault)])];
  // As pastas e os pais que esta execução criou voltam a não existir se a instalação falhar.
  const made = { vault: false, motor: false };
  const rollback = () => {
    if (made.vault) rmSync(folders.vault, { recursive: true, force: true });
    if (made.motor) rmSync(folders.motor, { recursive: true, force: true });
    for (const parent of createdParents.sort((a, b) => b.length - a.length)) {
      try { rmdirSync(parent); } catch { /* não vazio: algo mais vive ali, fica */ }
    }
  };
  try {
    mkdirSync(dirname(folders.motor), { recursive: true });
    mkdirSync(dirname(folders.vault), { recursive: true });
    mkdirSync(folders.motor);
    made.motor = true;
    mkdirSync(folders.vault);
    made.vault = true;
    applySplit(folders, plan, { write });
    return { status: 'installed', tag, version: readFileSync(join(folders.motor, 'VERSION'), 'utf8').trim(),
      vault: folders.vault, motor: folders.motor, written: true };
  } catch (error) {
    rollback();
    throw new Error(`installation-failed: ${error.message}`);
  }
}

async function main() {
  const options = { apply: false };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--apply') options.apply = true;
    else if (['--tag', '--vault', '--motor'].includes(argv[i]) && argv[i + 1] && !argv[i + 1].startsWith('--')) options[argv[i].slice(2)] = argv[++i];
    else throw new Error('usage: install.mjs --tag vX.Y.Z [--vault path] [--motor path] [--apply]');
  }
  if (!TAG_RE.test(options.tag || '')) throw new Error('explicit-tag-required');
  const folders = defaultFolders(options);
  const temp = mkdtempSync(join(tmpdir(), 'cerebro-install-'));
  try {
    const exists = [folders.vault, folders.motor].map(installationChoices).find(choice => choice.status !== 'new-folder');
    if (exists) { console.log(JSON.stringify(exists, null, 2)); return; }
    const source = process.env.CEREBRO_INSTALL_SOURCE_DIR
      ? resolve(process.env.CEREBRO_INSTALL_SOURCE_DIR)
      : await downloadPackage('hdoria/segundo-cerebro-hdoria', options.tag, temp);
    console.log(JSON.stringify(installPackage(folders, source, options.tag, { apply: options.apply }), null, 2));
  } finally { rmSync(temp, { recursive: true, force: true }); }
}
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(`✗ ${error.message}`); process.exitCode = 1; });
}
