#!/usr/bin/env node
// Prévia por padrão. Aplicação limitada aos arquivos concretos do pacote, sem remoções.
import {
  existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  renameSync, rmSync, writeFileSync, chmodSync, realpathSync,
} from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const BEGIN = '<!-- CEREBRO:MANAGED:BEGIN -->';
export const END = '<!-- CEREBRO:MANAGED:END -->';
export const TAG_RE = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/;
const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const LEGACY_CONTRACT = 'templates/vault/AGENTS.md';
const LAUNCHER_TEMPLATE = 'templates/vault/.cerebro/bin/cerebro.mjs';
const STATE = '.cerebro/update-state.json';
const BACKUPS = '.cerebro/update-backups';
const LOCK = '.cerebro/update.lock';
const POINTER_FILE = '.cerebro/motor';
const MOTOR_ROLE_FILE = '.cerebro/motor-install.json';
const MOTOR_MANIFEST_FILE = '.cerebro/motor.manifest';
const DO_DONO = [
  /^(?:meu-negocio|capturas|privado|operacao|type|views)(?:\/|$)/,
  /^sistemas\/[^/]+\/feedback\.md$/, /^sistemas\/outros-instalados(?:\/|$)/,
  /^conexoes\/configuradas(?:\/|$)/, /^comunidade\/minhas-contribuicoes(?:\/|$)/,
  /^\.cerebro\/(?:contracts|ledger|learning|sistemas|runtime|concierge-runs|update-backups)(?:\/|$)/,
  /^\.cerebro\/(?:id|member-id|install-credential|install-activation-outbox\.json|acesso-email|acesso-dispensado|sem-telemetria|operator-runtime|update-state\.json|update\.lock)$/,
];
const ehDoDono = item => DO_DONO.some(re => re.test(item));
export const hash = bytes => createHash('sha256').update(bytes).digest('hex');

export function stat(path) {
  try { return lstatSync(path); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

export function safePath(root, item) {
  if (typeof item !== 'string' || !item || /[\\:\x00-\x1f]/.test(item)
      || item.startsWith('/') || item.split('/').some(part => !part || part === '..' || part === '.' || part.toLowerCase() === '.git')) {
    throw new Error('unsafe-package-path');
  }
  let path = resolve(root);
  if (stat(path)?.isSymbolicLink()) throw new Error('symlink-root');
  const parts = item.split('/');
  for (const [index, part] of parts.entries()) {
    path = join(path, part);
    const info = stat(path);
    if (info?.isSymbolicLink()) throw new Error(`symlink-blocked: ${item}`);
    if (info && index < parts.length - 1 && !info.isDirectory()) throw new Error(`parent-not-directory: ${item}`);
  }
  return path;
}

export function bytesAt(root, item) {
  const path = safePath(root, item);
  const info = stat(path);
  if (!info) return null;
  if (!info.isFile()) throw new Error(`not-regular-file: ${item}`);
  return readFileSync(path);
}

// Expande linhas de manifesto (arquivos e diretórios) nos arquivos presentes no pacote.
export function expandEntries(source, lines) {
  const files = new Set();
  function visit(item) {
    const path = safePath(source, item);
    const info = stat(path);
    if (!info) return; // manifests antigos podem conter entradas retiradas do pacote
    if (info.isDirectory()) for (const child of readdirSync(path).sort()) visit(`${item}/${child}`);
    else if (info.isFile()) files.add(item);
    else throw new Error('package-entry-unsupported');
  }
  for (const line of lines) {
    const item = line.trim().replace(/\/$/, '');
    if (item && !item.startsWith('#')) visit(item);
  }
  return [...files].sort();
}

function manifestFiles(source, name, required = false) {
  const bytes = bytesAt(source, `.cerebro/${name}`);
  if (!bytes && required) throw new Error('motor-manifest-missing');
  return expandEntries(source, (bytes?.toString('utf8') || '').split('\n'));
}

function managedBlock(text) {
  const starts = text.split(BEGIN).length - 1;
  const ends = text.split(END).length - 1;
  if (!starts && !ends) return null;
  const start = text.indexOf(BEGIN), end = text.indexOf(END) + END.length;
  if (starts !== 1 || ends !== 1 || end <= start) throw new Error('claude-markers-invalid');
  return { start, end, text: text.slice(start, end) };
}

export function mergeClaude(local, incoming) {
  const incomingText = incoming.toString('utf8');
  const supplied = managedBlock(incomingText);
  const block = supplied?.text || `${BEGIN}\n${incomingText.trimEnd()}\n${END}`;
  const text = local?.toString('utf8') || '';
  // Arquivo novo recebe o modelo inteiro, inclusive o que vem antes do bloco (frontmatter).
  if (!text && supplied) return Buffer.from(incomingText.trimEnd() + '\n');
  const current = managedBlock(text);
  // Sem marcador, TODO o arquivo legado pertence ao membro, incluindo regras antigas.
  return Buffer.from(current
    ? text.slice(0, current.start) + block + text.slice(current.end)
    : text + (text && !text.endsWith('\n') ? '\n' : '') + (text ? '\n' : '') + block + '\n');
}

// Pasta única só serve para instalação de pasta única: motor e vault de uma instalação dividida
// se atualizam juntos pelo vault (--vault), nunca como se fossem uma pasta só.
export function assertSingleFolder(root) {
  if (stat(safePath(root, MOTOR_ROLE_FILE))) {
    throw new Error('split-install-motor: esta pasta é o motor de uma instalação dividida. Atualize pelo vault: update.mjs --vault <pasta do vault> --tag vX.Y.Z');
  }
  if (stat(safePath(root, POINTER_FILE))) {
    throw new Error('split-install-vault: esta pasta é um vault ligado a um motor separado. Atualize com: update.mjs --vault <esta pasta> --tag vX.Y.Z');
  }
}

/**
 * Primeira pasta, de `start` para cima, que é vault ou motor de uma instalação (ponteiro, papel de motor
 * ou motor.manifest). `start` pode não existir ainda: parte do ancestral mais próximo que existe.
 * Vive aqui, e não em lib/, porque este arquivo roda sozinho em árvores de versões antigas.
 */
export function enclosingInstallation(start) {
  let base = resolve(start);
  while (!existsSync(base) && dirname(base) !== base) base = dirname(base);
  for (let dir = realpathSync(base); ; dir = dirname(dir)) {
    if ([POINTER_FILE, MOTOR_ROLE_FILE, MOTOR_MANIFEST_FILE].some(marker => existsSync(join(dir, marker)))) return dir;
    if (dirname(dir) === dir) return '';
  }
}

// Raiz de pasta única: manifesto company-brain ou o formato legado (VERSION mais COMECE-AQUI, START-HERE ou .cerebro).
// Mesma regra de isBrainRoot em lib/installation.mjs, repetida porque este arquivo roda sem a lib.
function isSingleFolderBrain(root) {
  try {
    if (JSON.parse(readFileSync(join(root, '.cerebro/manifest.json'), 'utf8'))?.protocol === 'company-brain') return true;
  } catch { /* sem manifesto legível, vale o formato legado */ }
  return existsSync(join(root, 'VERSION'))
    && ['COMECE-AQUI.md', 'START-HERE.md', '.cerebro'].some(item => existsSync(join(root, item)));
}

// `role`: 'full' = pasta única legada (motor + dados do dono); 'motor' = só o código do produto,
// sem seeds nem regras de .gitignore (isso pertence ao vault, ver lib/projection.mjs).
export function planUpdate(root, source, tag, { baseline = null, role = 'full' } = {}) {
  if (!TAG_RE.test(tag || '')) throw new Error('explicit-tag-required: use --tag vX.Y.Z');
  if (resolve(root) === resolve(source)) throw new Error('source-is-destination');
  if (role === 'full') assertSingleFolder(root);
  if (bytesAt(source, 'VERSION')?.toString('utf8').trim() !== tag.slice(1)) throw new Error('package-version-mismatch');
  const stateBytes = bytesAt(root, STATE);
  const state = stateBytes ? JSON.parse(stateBytes) : { files: {} };
  if (stateBytes && (state.schema !== 1 || !state.files || typeof state.files !== 'object')) throw new Error('update-state-invalid');
  if (baseline && bytesAt(baseline, 'VERSION')?.toString('utf8').trim()
      !== bytesAt(root, 'VERSION')?.toString('utf8').trim()) throw new Error('baseline-version-mismatch');
  const changes = new Map();
  const owned = {};
  function add(item, incoming, kind) {
    const before = bytesAt(root, item);
    const after = item === 'CLAUDE.md' ? mergeClaude(before, incoming) : incoming;
    const beforeHash = before === null ? null : hash(before);
    const afterHash = hash(after);
    const baselineBytes = baseline ? bytesAt(baseline, item) : null;
    const previousHash = state.files[item] ?? (baselineBytes === null ? null : hash(baselineBytes));
    const action = beforeHash === afterHash ? 'unchanged' : before === null ? 'create' : 'replace';
    const conflict = action === 'replace' && kind === 'motor' && item !== 'CLAUDE.md'
      && previousHash !== beforeHash;
    changes.set(item, { path: item, kind, action, conflict, beforeHash, afterHash, before, after,
      mode: stat(safePath(root, item))?.mode & 0o777 || 0o644 });
    if (kind === 'motor') owned[item] = afterHash;
  }
  // Na pasta única, o que o seed.manifest declara é do dono depois da primeira cópia e vence o motor.manifest.
  const seeds = new Set(role === 'full' ? manifestFiles(source, 'seed.manifest') : []);
  const motor = manifestFiles(source, 'motor.manifest', true).filter(item => !ehDoDono(item) && !seeds.has(item));
  if (!motor.includes('VERSION')) throw new Error('version-not-in-manifest');
  for (const item of motor) add(item, bytesAt(source, item), 'motor');
  if (role === 'motor') {
    // Marca a pasta como motor de instalação dividida: scripts recusam usá-la como vault.
    add('.cerebro/motor-install.json', Buffer.from('{"role":"motor"}\n'), 'receipt');
  }
  if (role === 'full') {
    const launcher = bytesAt(source, LAUNCHER_TEMPLATE);
    if (launcher) add('.cerebro/bin/cerebro.mjs', launcher, 'motor');
    // O contrato do produto mora em templates/vault/AGENTS.md; o CLAUDE.md da raiz do pacote é
    // instrução de desenvolvimento. Na pasta única legada, o contrato segue chegando ao CLAUDE.md.
    const contract = bytesAt(source, LEGACY_CONTRACT);
    if (contract && !changes.has('CLAUDE.md')) add('CLAUDE.md', contract, 'motor');
    for (const item of manifestFiles(source, 'seed.manifest')) {
      // Seeds nunca sobrescrevem nem adotam arquivo existente, mesmo dentro de diretório.
      if (!changes.has(item) && bytesAt(root, item) === null) add(item, bytesAt(source, item), 'seed');
    }
    // Regras locais preservadas; backups privados não podem entrar no Git.
    const ignore = bytesAt(root, '.gitignore')?.toString('utf8') || '';
    const rules = ['.gitignore', '.cerebro/private-ignore.manifest']
      .flatMap(item => (bytesAt(source, item)?.toString('utf8') || '').split(/\r?\n/))
      .filter(line => line && !line.startsWith('#'));
    rules.push(`${BACKUPS}/`, STATE, LOCK);
    const missing = [...new Set(rules)].filter(rule => !ignore.split(/\r?\n/).includes(rule));
    if (missing.length) add('.gitignore', Buffer.from(ignore + (ignore && !ignore.endsWith('\n') ? '\n' : '') + missing.join('\n') + '\n'), 'privacy');
  }
  add(STATE, Buffer.from(JSON.stringify({ schema: 1, tag, files: owned }, null, 2) + '\n'), 'receipt');
  safePath(root, LOCK);
  safePath(root, BACKUPS);
  const entries = [...changes.values()].sort((a, b) => a.path.localeCompare(b.path));
  const summary = entries.map(({ before, after, ...entry }) => entry);
  const digest = hash(JSON.stringify({ root: resolve(root), tag, entries: summary }));
  return { tag, digest, conflicts: summary.filter(entry => entry.conflict).map(entry => entry.path), entries, summary };
}

export function applyPlan(root, plan, { approvePlan, write = atomicWrite } = {}) {
  if (plan.conflicts.length) throw new Error(`update-conflicts: ${plan.conflicts.join(', ')}`);
  if (approvePlan && approvePlan !== plan.digest) throw new Error('plan-changed: preview again');
  const mutations = plan.entries.filter(entry => entry.action !== 'unchanged');
  // Um plano de projeção marca `installed` pelo recibo do vault; os demais, pelo VERSION.
  const installed = plan.installed ?? bytesAt(root, 'VERSION') !== null;
  if (mutations.length && installed && approvePlan !== plan.digest) {
    throw new Error('preview-approval-required: use --approve-plan <plan-hash>');
  }
  const lock = safePath(root, LOCK);
  mkdirSync(dirname(lock), { recursive: true });
  try {
    writeFileSync(lock, String(process.pid), { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if (error.code === 'EEXIST') {
      throw new Error('update-in-progress: há outra atualização em andamento ou uma anterior parou no meio. Se nenhuma estiver rodando, apague o arquivo .cerebro/update.lock da pasta afetada e gere a prévia de novo.');
    }
    throw error;
  }
  let backup;
  const applied = [];
  try {
    for (const entry of plan.entries) {
      const current = bytesAt(root, entry.path);
      if ((current === null ? null : hash(current)) !== entry.beforeHash) throw new Error('destination-changed: preview again');
    }
    if (!mutations.length) return null;
    backup = safePath(root, `${BACKUPS}/${randomUUID()}`);
    mkdirSync(backup, { recursive: true, mode: 0o700 });
    for (const entry of mutations) {
      if (entry.before !== null) {
        const path = join(backup, 'files', entry.path);
        mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
        writeFileSync(path, entry.before, { mode: 0o600 });
      }
    }
    writeFileSync(join(backup, 'receipt.json'), JSON.stringify({ tag: plan.tag, digest: plan.digest, files: plan.summary }, null, 2), { mode: 0o600 });
    // VERSION é a última escrita: uma instalação parcial não anuncia versão nova.
    mutations.sort((a, b) => Number(a.path === 'VERSION') - Number(b.path === 'VERSION'));
    for (const entry of mutations) {
      applied.push(entry);
      write(safePath(root, entry.path), entry.after, entry.mode);
    }
    return backup;
  } catch (error) {
    for (const entry of applied.reverse()) {
      const path = safePath(root, entry.path);
      if (entry.before === null) rmSync(path, { force: true });
      else atomicWrite(path, entry.before, entry.mode);
    }
    throw error;
  } finally {
    rmSync(lock, { force: true });
  }
}

// Desfaz um plano já aplicado com sucesso (usado quando a segunda pasta de uma atualização falha).
export function revertPlan(root, plan) {
  for (const entry of plan.entries.filter(item => item.action !== 'unchanged').reverse()) {
    const path = safePath(root, entry.path);
    if (entry.before === null) rmSync(path, { force: true });
    else atomicWrite(path, entry.before, entry.mode);
  }
}

function atomicWrite(path, bytes, mode) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.update-${randomUUID()}`;
  try {
    writeFileSync(temporary, bytes, { flag: 'wx', mode });
    chmodSync(temporary, mode);
    renameSync(temporary, path);
  } finally { rmSync(temporary, { force: true }); }
}

// ── leitor de tar (ustar/pax), stdlib pura ────────────────────────────────
export function extrairTarGz(buffer, destino) {
  const tar = gunzipSync(buffer);
  let offset = 0;
  let nomeLongoPendente = null;

  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((b) => b === 0)) break; // fim do arquivo

    const bruto = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '');
    const prefixo = header.subarray(345, 500).toString('utf8').replace(/\0.*$/, '');
    const tipo = String.fromCharCode(header[156] || 48);
    const tamanho = parseInt(header.subarray(124, 136).toString('utf8').replace(/\0.*$/, '').trim() || '0', 8) || 0;
    if (offset + 512 + tamanho > tar.length) throw new Error('archive-truncated');
    const dados = tar.subarray(offset + 512, offset + 512 + tamanho);
    offset += 512 + Math.ceil(tamanho / 512) * 512;

    if (tipo === 'L') { // GNU long name
      nomeLongoPendente = dados.toString('utf8').replace(/\0.*$/, '');
      continue;
    }
    if (tipo === 'x' || tipo === 'g') continue; // headers pax: ignorados

    const nome = nomeLongoPendente ?? (prefixo ? `${prefixo}/${bruto}` : bruto);
    nomeLongoPendente = null;
    if (!nome) continue;

    // trava anti path traversal: nada sai do destino
    const alvo = resolve(destino, nome);
    if (!alvo.startsWith(resolve(destino) + sep) || nome.includes('\\')) throw new Error('archive-path-invalid');

    if (tipo === '5') {
      mkdirSync(alvo, { recursive: true });
    } else if (tipo === '0' || tipo === '\0' || header[156] === 0) {
      mkdirSync(dirname(alvo), { recursive: true });
      writeFileSync(alvo, dados);
    } else {
      throw new Error('archive-entry-unsupported');
    }
  }
}


export function releaseUrl(repo, tag) {
  if (!REPO_RE.test(repo || '')) throw new Error('update-source-invalid');
  if (!TAG_RE.test(tag || '')) throw new Error('explicit-tag-required: use --tag vX.Y.Z');
  return `https://github.com/${repo}/archive/refs/tags/${tag}.tar.gz`;
}

export async function downloadPackage(repo, tag, destination) {
  const response = await fetch(releaseUrl(repo, tag), {
    headers: { 'User-Agent': 'cerebro-updater' }, signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`package-download-failed: HTTP ${response.status}`);
  extrairTarGz(Buffer.from(await response.arrayBuffer()), destination);
  const roots = readdirSync(destination);
  if (roots.length !== 1) throw new Error('package-root-invalid');
  return join(destination, roots[0]);
}

function args(argv) {
  const options = { apply: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--apply') options.apply = true;
    else if (argv[i] === '--link') options.link = true;
    else if (['--tag', '--root', '--motor', '--vault', '--approve-plan', '--baseline-dir'].includes(argv[i]) && argv[i + 1] && !argv[i + 1].startsWith('--')) {
      options[argv[i].slice(2)] = argv[++i];
    } else throw new Error('usage: update.mjs --tag vX.Y.Z [--vault path [--motor path [--link]] | --root path] [--baseline-dir path] [--apply] [--approve-plan hash]');
  }
  if (!TAG_RE.test(options.tag || '')) throw new Error('explicit-tag-required: use --tag vX.Y.Z');
  return options;
}

function sameFolder(a, b) {
  const real = path => { try { return realpathSync(path); } catch { return resolve(path); } };
  return real(a) === real(b);
}

// Procura o ponteiro `.cerebro/motor` do cwd para cima, como o git faz com `.git`.
function findVaultUp(start) {
  for (let dir = resolve(start); ; dir = dirname(dir)) {
    if (stat(join(dir, POINTER_FILE))) return dir;
    if (dirname(dir) === dir) return '';
  }
}

// Instalação dividida: atualiza o motor e reprojeta o vault com um único plan_hash.
// `link`: religa um vault sem ponteiro (clone em outra máquina, motor movido) a um motor existente.
async function mainSplit(options, vault, motor, { link = false } = {}) {
  const { planSplit, applySplit } = await import('./lib/projection.mjs');
  if (!stat(join(motor, MOTOR_ROLE_FILE))) {
    throw new Error('motor-not-found: a pasta do motor não existe ou não é o motor de uma instalação dividida. Para apontar o vault para outro motor: update.mjs --vault <vault> --motor <pasta do motor> --tag vX.Y.Z --link');
  }
  const temp = mkdtempSync(join(tmpdir(), 'cerebro-update-'));
  try {
    const config = bytesAt(motor, '.cerebro/source')?.toString('utf8') || '';
    const repo = config.match(/^REPO=(.+)$/m)?.[1]?.trim();
    const source = process.env.CEREBRO_UPDATE_SOURCE_DIR
      ? resolve(process.env.CEREBRO_UPDATE_SOURCE_DIR)
      : await downloadPackage(repo, options.tag, temp);
    const plan = planSplit({ motor, vault, source, tag: options.tag, link,
      baseline: options['baseline-dir'] && resolve(options['baseline-dir']) });
    console.log(JSON.stringify({ mode: 'preview', layout: 'split', link, tag: plan.tag, plan_hash: plan.digest,
      motor, vault, warnings: plan.warnings, conflicts: plan.conflicts, files: plan.summary }, null, 2));
    if (!options.apply) return;
    const { motorBackup, vaultBackup } = applySplit({ motor, vault }, plan, { approvePlan: options['approve-plan'] });
    console.log(`✓ Motor e vault atualizados para ${options.tag}. Backups locais: motor ${motorBackup || 'sem alterações'}, vault ${vaultBackup || 'sem alterações'}`);
  } finally { rmSync(temp, { recursive: true, force: true }); }
}

async function main() {
  const options = args(process.argv.slice(2));
  const ambient = process.env.CEREBRO_INSTALL_ROOT ? resolve(process.env.CEREBRO_INSTALL_ROOT) : '';
  const splitRequested = Boolean(options.vault || options.motor || options.link);
  if (options.root && splitRequested) throw new Error('usage: --root não combina com --vault/--motor/--link');
  let vault = '';
  if (!options.root) {
    if (options.vault) vault = resolve(options.vault);
    else if (ambient && (splitRequested || stat(join(ambient, POINTER_FILE)))) vault = ambient;
    else vault = findVaultUp(process.cwd());
    if (!vault && splitRequested) throw new Error('usage: informe --vault');
  }
  if (vault) {
    const { isProjectedVault, readMotorPointer } = await import('./lib/installation.mjs');
    const pointed = readMotorPointer(vault)?.motorDir;
    if (options.link && !options.motor) throw new Error('usage: --link exige --motor <pasta do motor>');
    if (!pointed) {
      const { NOT_BRAIN_VAULT } = await import('./lib/projection.mjs');
      if (!isProjectedVault(vault)) throw new Error(NOT_BRAIN_VAULT);
      if (!options.link) {
        throw new Error(`vault-without-motor-pointer: este vault não tem o ponteiro do motor. Para religar a um motor existente, confira a prévia e aprove: update.mjs --vault "${vault}" --motor <pasta do motor> --tag ${options.tag} --link`);
      }
    } else if (options.motor && !options.link && !sameFolder(options.motor, pointed)) {
      throw new Error(`motor-differs-from-pointer: o vault aponta para ${pointed}, mas --motor é ${resolve(options.motor)}. Para trocar o motor do vault, confira a prévia e aprove com --link.`);
    }
    return mainSplit(options, vault, resolve(options.motor || pointed), { link: Boolean(options.link) });
  }
  const root = resolve(options.root || ROOT);
  // Pasta única legada: só atualiza um Cérebro existente na sua própria raiz, nunca uma subpasta de
  // vault ou de motor, nem uma pasta qualquer (a instalação nova de pasta única não existe mais).
  const enclosing = enclosingInstallation(dirname(root));
  if (enclosing) {
    throw new Error(`root-inside-installation: ${root} está dentro da instalação do Cérebro em ${enclosing}. Atualize pelo vault: update.mjs --vault <pasta do vault> --tag ${options.tag}`);
  }
  if (!isSingleFolderBrain(root)) {
    throw new Error(`not-a-brain-root: ${root} não é a raiz de uma instalação de pasta única do Cérebro. Para instalar, use install.mjs; para atualizar uma instalação dividida, use --vault.`);
  }
  const temp = mkdtempSync(join(tmpdir(), 'cerebro-update-'));
  try {
    const config = bytesAt(root, '.cerebro/source')?.toString('utf8') || '';
    const repo = config.match(/^REPO=(.+)$/m)?.[1]?.trim();
    // Recusa antes de baixar qualquer coisa: motor ou vault de instalação dividida não são pasta única.
    assertSingleFolder(root);
    const source = process.env.CEREBRO_UPDATE_SOURCE_DIR
      ? resolve(process.env.CEREBRO_UPDATE_SOURCE_DIR)
      : await downloadPackage(repo, options.tag, temp);
    const plan = planUpdate(root, source, options.tag, { baseline: options['baseline-dir'] && resolve(options['baseline-dir']) });
    console.log(JSON.stringify({ mode: 'preview', tag: plan.tag, plan_hash: plan.digest,
      conflicts: plan.conflicts, files: plan.summary }, null, 2));
    if (!options.apply) return;
    const backup = applyPlan(root, plan, { approvePlan: options['approve-plan'] });
    console.log(`✓ Motor atualizado para ${options.tag}. Backup local: ${backup || 'sem alterações'}`);
    // O pós-update legado migra armazenamento privado; é uma ação separada e visível.
    // Não executar código baixado fora do plano de arquivos nem telemetria durante update.
    if (stat(safePath(root, '.cerebro/runtime'))?.isFile()) {
      console.log('RUNTIME_LEGADO: revise scripts/post-update.mjs e aprove a migração de armazenamento separadamente.');
    }
  } finally { rmSync(temp, { recursive: true, force: true }); }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(`✗ ${error.message}`); process.exitCode = 1; });
}
