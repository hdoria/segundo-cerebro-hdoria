#!/usr/bin/env node
// Guardas do update.mjs: --root em subpasta de instalação, --link só em vault do Cérebro e troca de motor.
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
const temp = realpathSync(mkdtempSync(join(tmpdir(), 'cerebro-update-guards-')));
const env = { ...process.env, CEREBRO_TELEMETRY: 'off', CEREBRO_INSTALL_SOURCE_DIR: PRODUCT, CEREBRO_UPDATE_SOURCE_DIR: PRODUCT };
delete env.CEREBRO_INSTALL_ROOT;
const node = (script, args) => execFileSync(process.execPath, [script, ...args], { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const run = (script, args, cwd = temp) => spawnSync(process.execPath, [script, ...args], { env, cwd, encoding: 'utf8' });

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
function write(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

try {
  const vault = join(temp, 'Cerebro', 'notas');
  const motor = join(temp, 'Cerebro', 'motor');
  node(join(PRODUCT, 'scripts/install.mjs'), ['--tag', tag, '--vault', vault, '--motor', motor, '--apply']);
  const updater = join(motor, 'scripts/update.mjs');

  // N1: --root em subpasta do motor ou do vault, ou em pasta que não é um Cérebro, não grava nada.
  const loose = join(temp, 'solta');
  mkdirSync(loose);
  const frozen = () => [treeHash(motor), treeHash(vault), treeHash(loose)];
  const before = frozen();
  for (const sub of [join(motor, 'scripts'), join(motor, 'docs'), join(vault, 'meu-negocio'), join(vault, '.cerebro'), loose]) {
    const refused = run(updater, ['--tag', tag, '--root', sub, '--apply']);
    assert.notEqual(refused.status, 0, `deveria recusar --root ${sub}`);
    assert.match(refused.stderr, /instalação|Cérebro/, refused.stderr);
    assert.deepEqual(frozen(), before, `--root ${sub} não grava em nenhuma pasta`);
  }

  // N2: --link só religa vault que já é do Cérebro; um vault do dono nunca vira vault do Cérebro.
  const owner = join(temp, 'dono');
  write(join(owner, 'AGENTS.md'), 'instruções do dono\n');
  write(join(owner, '.claude/skills/daily/SKILL.md'), 'skill do dono\n');
  write(join(owner, 'type/nota.md'), 'tipo do dono\n');
  const ownerHash = treeHash(owner);
  const oargs = ['--tag', tag, '--vault', owner, '--motor', motor];
  for (const extra of [[], ['--link'], ['--link', '--apply'], ['--link', '--apply', '--approve-plan', 'x']]) {
    const refused = run(updater, [...oargs, ...extra]);
    assert.notEqual(refused.status, 0, `deveria recusar ${extra.join(' ')}`);
    assert.match(refused.stderr, /não é um vault do Cérebro/);
    if (!extra.length) assert.equal(refused.stderr.includes('--link'), false, 'não sugere --link para vault de outro dono');
    assert.equal(treeHash(owner), ownerHash, 'vault do dono intacto');
  }

  // Religar vault do Cérebro: só ponteiro e reprojeção, nenhum seed novo.
  const pointerText = readFileSync(join(vault, '.cerebro/motor'), 'utf8');
  rmSync(join(vault, '.cerebro/motor'));
  rmSync(join(vault, 'meu-negocio/mapa.md'));
  const unlinked = run(updater, ['--tag', tag, '--vault', vault, '--motor', motor]);
  assert.notEqual(unlinked.status, 0);
  assert.match(unlinked.stderr, /--link/, 'vault do Cérebro sem ponteiro sugere --link');
  const preview = JSON.parse(node(updater, ['--tag', tag, '--vault', vault, '--motor', motor, '--link']));
  assert.equal(preview.files.filter((entry) => entry.root === 'vault' && entry.kind === 'seed' && entry.action !== 'unchanged').length, 0, 'religar não planta seeds');
  node(updater, ['--tag', tag, '--vault', vault, '--motor', motor, '--link', '--apply', '--approve-plan', preview.plan_hash]);
  assert.equal(readFileSync(join(vault, '.cerebro/motor'), 'utf8'), pointerText);
  assert.equal(existsSync(join(vault, 'meu-negocio/mapa.md')), false, 'seed apagado pelo dono não volta ao religar');

  // As outras duas marcas de vault do Cérebro também bastam (só prévia).
  const byManifest = join(temp, 'por-manifesto');
  write(join(byManifest, '.cerebro/manifest.json'), JSON.stringify({ protocol: 'company-brain' }));
  const byState = join(temp, 'por-recibo');
  write(join(byState, '.cerebro/projection-state.json'), JSON.stringify({ schema: 1, files: {} }));
  for (const other of [byManifest, byState]) {
    const ok = run(updater, ['--tag', tag, '--vault', other, '--motor', motor, '--link']);
    assert.equal(ok.status, 0, ok.stderr);
    assert.equal(JSON.parse(ok.stdout).link, true);
  }

  // N3: --motor diferente do ponteiro exige --link; nada é religado em silêncio.
  const motor2 = join(temp, 'Cerebro', 'motor-2');
  cpSync(motor, motor2, { recursive: true });
  const linked = readFileSync(join(vault, '.cerebro/motor'), 'utf8');
  const vaultHash = treeHash(vault);
  const silent = run(updater, ['--tag', tag, '--vault', vault, '--motor', motor2, '--apply', '--approve-plan', 'x']);
  assert.notEqual(silent.status, 0);
  assert.match(silent.stderr, /--link/);
  const silentPreview = run(updater, ['--tag', tag, '--vault', vault, '--motor', motor2]);
  assert.notEqual(silentPreview.status, 0);
  assert.equal(readFileSync(join(vault, '.cerebro/motor'), 'utf8'), linked);
  assert.equal(treeHash(vault), vaultHash);
  // O mesmo motor, escrito de outro jeito, não conta como troca.
  const same = run(updater, ['--tag', tag, '--vault', vault, '--motor', join(motor, 'scripts', '..')]);
  assert.equal(same.status, 0, same.stderr);
  const swapped = run(updater, ['--tag', tag, '--vault', vault, '--motor', motor2, '--link']);
  assert.equal(swapped.status, 0, swapped.stderr);
  assert.equal(JSON.parse(swapped.stdout).link, true);

  console.log('update-guards: ok');
} finally {
  rmSync(temp, { recursive: true, force: true });
}
