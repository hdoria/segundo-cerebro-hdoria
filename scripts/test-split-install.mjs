#!/usr/bin/env node
// Instalação e atualização em duas pastas com o pacote real do produto.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PRODUCT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const version = readFileSync(join(PRODUCT, 'VERSION'), 'utf8').trim();
const tag = `v${version}`;
const temp = realpathSync(mkdtempSync(join(tmpdir(), 'cerebro-split-install-')));
const env = { ...process.env, CEREBRO_TELEMETRY: 'off', CEREBRO_INSTALL_SOURCE_DIR: PRODUCT, CEREBRO_UPDATE_SOURCE_DIR: PRODUCT };
delete env.CEREBRO_INSTALL_ROOT;
const node = (script, args, extra = {}) => execFileSync(process.execPath, [script, ...args], { env: { ...env, ...extra }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

function files(root, base = root) {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? files(path, base) : [path.slice(base.length + 1)];
  }).sort();
}
function treeHash(root) {
  const h = createHash('sha256');
  for (const file of files(root)) h.update(file).update(readFileSync(join(root, file)));
  return h.digest('hex');
}

// Visível = tudo que não está dentro de uma pasta oculta (o que Tolaria/Obsidian mostram).
const VISIBLE_ALLOW = [
  /^AGENTS\.md$/, /^CLAUDE\.md$/, /^GEMINI\.md$/,
  /^meu-negocio\//, /^capturas\//, /^privado\//, /^type\//, /^views\//,
  /^operacao\//, /^conexoes\/configuradas\//, /^comunidade\/minhas-contribuicoes\//,
  /^sistemas\/(?:cerebro-base|calls)\/feedback\.md$/, /^sistemas\/outros-instalados\//,
];

try {
  const vault = join(temp, 'Cerebro', 'notas');
  const motor = join(temp, 'Cerebro', 'motor');
  const args = ['--tag', tag, '--vault', vault, '--motor', motor];
  const preview = JSON.parse(node(join(PRODUCT, 'scripts/install.mjs'), args));
  assert.equal(preview.status, 'preview');
  assert.equal(existsSync(join(temp, 'Cerebro')), false, 'prévia não cria nada');
  const done = JSON.parse(node(join(PRODUCT, 'scripts/install.mjs'), [...args, '--apply']));
  assert.equal(done.status, 'installed');

  const visible = files(vault).filter((file) => !file.split('/').some((part) => part.startsWith('.')));
  const stray = visible.filter((file) => !VISIBLE_ALLOW.some((re) => re.test(file)));
  assert.deepEqual(stray, [], `arquivos visíveis fora da allowlist: ${stray.join(', ')}`);
  assert.ok(visible.includes('AGENTS.md') && visible.includes('meu-negocio/mapa.md'));
  assert.equal(existsSync(join(motor, 'meu-negocio')), false, 'motor sem dado do dono');
  assert.equal(existsSync(join(motor, 'operacao')), false);
  assert.equal(existsSync(join(vault, 'scripts')), false);
  assert.equal(existsSync(join(vault, 'COMECE-AQUI.md')), false);
  for (const hidden of ['.cerebro/bin/cerebro.mjs', '.cerebro/motor', '.cerebro/projection-state.json', '.cerebro/manifest.json', '.cerebro/layout.json', '.claude/skills/comecar/SKILL.md', '.agents/skills/comecar/SKILL.md']) {
    assert.ok(existsSync(join(vault, hidden)), hidden);
  }

  // O lançador do vault chega ao motor instalado.
  const launcher = join(vault, '.cerebro/bin/cerebro.mjs');
  assert.equal(execFileSync(process.execPath, [launcher, 'motor-path'], { cwd: vault, encoding: 'utf8', env }).trim(), motor);

  // Atualização: um plan_hash para as duas pastas.
  const updater = join(motor, 'scripts/update.mjs');
  const uargs = ['--tag', tag, '--vault', vault, '--motor', motor];
  const replay = JSON.parse(node(updater, uargs));
  assert.deepEqual(replay.conflicts, []);
  assert.ok(replay.files.every((entry) => entry.action === 'unchanged'));

  // Atualização via lançador, sem flags, a partir do vault.
  const viaLauncher = JSON.parse(execFileSync(process.execPath, [launcher, 'update', '--tag', tag], { cwd: vault, encoding: 'utf8', env }));
  assert.equal(viaLauncher.layout, 'split');

  // Pacote novo com mudança no motor e no vault; vault com falha restaura o motor.
  const next = join(temp, 'next');
  cpSync(PRODUCT, next, { recursive: true, filter: (src) => !/[\\/](\.git|node_modules|\.claude\/worktrees)([\\/]|$)/.test(src) });
  writeFileSync(join(next, 'VERSION'), '99.0.0\n');
  writeFileSync(join(next, 'scripts/lib/marcador-motor.mjs'), '// novo\n');
  writeFileSync(join(next, '.claude/skills/comecar/SKILL.md'), `${readFileSync(join(next, '.claude/skills/comecar/SKILL.md'), 'utf8')}\nlinha nova\n`);
  const nextEnv = { CEREBRO_UPDATE_SOURCE_DIR: next };
  const nargs = ['--tag', 'v99.0.0', '--vault', vault, '--motor', motor];
  const p1 = JSON.parse(node(updater, nargs, nextEnv));
  assert.ok(p1.files.some((entry) => entry.root === 'motor' && entry.path === 'VERSION' && entry.action === 'replace'));
  assert.ok(p1.files.some((entry) => entry.root === 'vault' && entry.path === '.claude/skills/comecar/SKILL.md' && entry.action === 'replace'));

  const motorBefore = treeHash(motor);
  const vaultBefore = treeHash(vault);
  // Sem aprovação ou com hash errado: nada muda.
  assert.notEqual(spawnSync(process.execPath, [updater, ...nargs, '--apply'], { env: { ...env, ...nextEnv } }).status, 0);
  assert.notEqual(spawnSync(process.execPath, [updater, ...nargs, '--apply', '--approve-plan', 'errado'], { env: { ...env, ...nextEnv } }).status, 0);
  assert.equal(treeHash(motor), motorBefore);
  assert.equal(treeHash(vault), vaultBefore);

  // Falha no vault depois do motor (lock já existente no vault): o motor volta ao estado anterior.
  writeFileSync(join(vault, '.cerebro/update.lock'), 'outro processo');
  const failed = spawnSync(process.execPath, [updater, ...nargs, '--apply', '--approve-plan', p1.plan_hash], { env: { ...env, ...nextEnv }, encoding: 'utf8' });
  assert.notEqual(failed.status, 0, 'falha do vault deve falhar o update');
  rmSync(join(vault, '.cerebro/update.lock'));
  assert.equal(readFileSync(join(motor, 'VERSION'), 'utf8').trim(), version, 'motor restaurado');
  assert.equal(existsSync(join(motor, 'scripts/lib/marcador-motor.mjs')), false, 'arquivo novo do motor removido');
  assert.equal(readFileSync(join(vault, '.cerebro/version'), 'utf8').trim(), version);

  // Aplicação aprovada atualiza os dois.
  node(updater, [...nargs, '--apply', '--approve-plan', p1.plan_hash], nextEnv);
  assert.equal(readFileSync(join(motor, 'VERSION'), 'utf8').trim(), '99.0.0');
  assert.equal(readFileSync(join(vault, '.cerebro/version'), 'utf8').trim(), '99.0.0');
  assert.match(readFileSync(join(vault, '.claude/skills/comecar/SKILL.md'), 'utf8'), /linha nova/);
  assert.match(readFileSync(join(vault, '.cerebro/motor'), 'utf8'), /MOTOR_VERSION=99\.0\.0/);

  // A prévia dividida mostra os dois caminhos absolutos.
  const again = JSON.parse(node(updater, nargs, nextEnv));
  assert.equal(again.motor, motor);
  assert.equal(again.vault, vault);

  // M2: o ramo legado (sem --vault) nunca trata o motor dividido como pasta única.
  const frozen = [treeHash(motor), treeHash(vault)];
  const legacyRuns = [
    { args: ['--tag', 'v99.0.0'], extra: {}, cwd: temp },
    { args: ['--tag', 'v99.0.0'], extra: { CEREBRO_MOTOR_DIR: motor }, cwd: temp },
    { args: ['--tag', 'v99.0.0', '--root', motor], extra: {}, cwd: temp },
    { args: ['--tag', 'v99.0.0', '--root', vault], extra: {}, cwd: temp },
  ];
  for (const run of legacyRuns) {
    const refusedLegacy = spawnSync(process.execPath, [updater, ...run.args, '--apply'], { cwd: run.cwd, env: { ...env, ...nextEnv, ...run.extra }, encoding: 'utf8' });
    assert.notEqual(refusedLegacy.status, 0, `deveria recusar: ${run.args.join(' ')}`);
    assert.match(refusedLegacy.stderr, /--vault/);
  }
  assert.deepEqual([treeHash(motor), treeHash(vault)], frozen, 'recusa legada não grava em nenhuma pasta');
  // De dentro do vault (ou de uma subpasta) o script do motor acha o vault sozinho.
  for (const cwd of [vault, join(vault, 'meu-negocio')]) {
    const inside = JSON.parse(execFileSync(process.execPath, [updater, '--tag', 'v99.0.0'], { cwd, env: { ...env, ...nextEnv }, encoding: 'utf8' }));
    assert.equal(inside.layout, 'split');
    assert.equal(inside.vault, vault);
  }

  // M2: vault sem ponteiro (clone em outra máquina) só é religado com --link, prévia e hash.
  const pointerText = readFileSync(join(vault, '.cerebro/motor'), 'utf8');
  rmSync(join(vault, '.cerebro/motor'));
  rmSync(join(vault, '.cerebro/projection-state.json'));
  for (const extra of [[], ['--motor', motor]]) {
    const unlinked = spawnSync(process.execPath, [updater, '--tag', 'v99.0.0', '--vault', vault, ...extra], { env: { ...env, ...nextEnv }, encoding: 'utf8' });
    assert.notEqual(unlinked.status, 0);
    assert.match(unlinked.stderr, /--link/);
  }
  assert.equal(existsSync(join(vault, '.cerebro/motor')), false);
  const lpreview = JSON.parse(node(updater, [...nargs, '--link'], nextEnv));
  assert.equal(lpreview.link, true);
  assert.ok(lpreview.files.some((entry) => entry.root === 'vault' && entry.path === '.cerebro/motor' && entry.action === 'create'));
  assert.equal(existsSync(join(vault, '.cerebro/motor')), false, 'prévia não grava o ponteiro');
  assert.notEqual(spawnSync(process.execPath, [updater, ...nargs, '--link', '--apply'], { env: { ...env, ...nextEnv } }).status, 0);
  assert.notEqual(spawnSync(process.execPath, [updater, ...nargs, '--link', '--apply', '--approve-plan', 'errado'], { env: { ...env, ...nextEnv } }).status, 0);
  assert.equal(existsSync(join(vault, '.cerebro/motor')), false);
  node(updater, [...nargs, '--link', '--apply', '--approve-plan', lpreview.plan_hash], nextEnv);
  assert.equal(readFileSync(join(vault, '.cerebro/motor'), 'utf8'), pointerText);
  assert.equal(execFileSync(process.execPath, [launcher, 'motor-path'], { cwd: vault, encoding: 'utf8', env }).trim(), motor);
  // --link não aceita uma pasta que não é motor de instalação dividida.
  const notMotor = join(temp, 'nao-motor'); mkdirSync(notMotor);
  assert.notEqual(spawnSync(process.execPath, [updater, '--tag', 'v99.0.0', '--vault', vault, '--motor', notMotor, '--link'], { env: { ...env, ...nextEnv } }).status, 0);
  assert.equal(existsSync(join(notMotor, 'VERSION')), false);

  // M4: instalação nova não cabe dentro do vault nem do motor existentes.
  const sizes = [treeHash(motor), treeHash(vault)];
  for (const [v, m] of [[join(vault, 'sub'), join(temp, 'outro-motor')], [join(temp, 'outro-vault'), join(motor, 'sub')]]) {
    const nested = spawnSync(process.execPath, [join(PRODUCT, 'scripts/install.mjs'), '--tag', tag, '--vault', v, '--motor', m, '--apply'], { env, encoding: 'utf8' });
    assert.notEqual(nested.status, 0);
    assert.match(nested.stderr, /destination-inside-installation/);
  }
  assert.deepEqual([treeHash(motor), treeHash(vault)], sizes);
  assert.equal(existsSync(join(temp, 'outro-motor')) || existsSync(join(temp, 'outro-vault')), false);

  // Skill editada no vault bloqueia a atualização inteira, motor incluído.
  writeFileSync(join(vault, '.claude/skills/comecar/SKILL.md'), 'edição do dono');
  const motorHash = treeHash(motor);
  writeFileSync(join(next, '.claude/skills/comecar/SKILL.md'), 'outra versão oficial');
  writeFileSync(join(next, 'VERSION'), '99.0.1\n');
  const blocked = JSON.parse(node(updater, ['--tag', 'v99.0.1', '--vault', vault, '--motor', motor], nextEnv));
  assert.ok(blocked.conflicts.includes('vault:.claude/skills/comecar/SKILL.md'));
  const refused = spawnSync(process.execPath, [updater, '--tag', 'v99.0.1', '--vault', vault, '--motor', motor, '--apply', '--approve-plan', blocked.plan_hash], { env: { ...env, ...nextEnv }, encoding: 'utf8' });
  assert.notEqual(refused.status, 0);
  assert.equal(treeHash(motor), motorHash, 'conflito no vault não toca o motor');

  // Vault do dono sem ponteiro nunca é projetado.
  const owner = join(temp, 'owner'); mkdirSync(owner); writeFileSync(join(owner, 'AGENTS.md'), 'meu\n');
  const ownerHash = treeHash(owner);
  assert.notEqual(spawnSync(process.execPath, [updater, '--tag', 'v99.0.1', '--vault', owner, '--motor', motor], { env: { ...env, ...nextEnv } }).status, 0);
  assert.equal(treeHash(owner), ownerHash);
  console.log('split-install: ok');
} finally {
  rmSync(temp, { recursive: true, force: true });
}
