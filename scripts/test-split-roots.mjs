#!/usr/bin/env node
// Instalação em duas pastas: os scripts gravam só no vault e nunca no motor.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertNotMotor,
  brainVersion,
  isBrainRoot,
  readMotorPointer,
  resolveRoots,
} from './lib/installation.mjs';

const PRODUCT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = new Set(['node_modules', '.git', 'dist']);
const temp = realpathSync(mkdtempSync(join(tmpdir(), 'cerebro-split-')));
// O motor do teste é uma cópia congelada do produto (sem node_modules), marcada como motor
// de instalação dividida; o hash é calculado sobre ela, nunca sobre a árvore viva.
const MOTOR = join(temp, 'motor');
for (const item of ['scripts', '.agents', '.claude', 'protocol', 'templates', 'sistemas', '.cerebro', 'VERSION', 'COMECE-AQUI.md']) {
  cpSync(join(PRODUCT, item), join(MOTOR, item), { recursive: true });
}
writeFileSync(join(MOTOR, '.cerebro', 'motor-install.json'), '{"role":"motor"}\n');

function write(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function treeHash(root) {
  const hash = createHash('sha256');
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (SKIP.has(entry.name)) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile()) hash.update(`${path}\0`).update(readFileSync(path));
    }
  };
  walk(root);
  return hash.digest('hex');
}

function makeVault(name, { motor = MOTOR, manifest = true } = {}) {
  const vault = join(temp, name);
  write(join(vault, '.cerebro', 'motor'), `MOTOR_DIR=${motor}\nMOTOR_VERSION=9.9.9\n`);
  if (manifest) write(join(vault, '.cerebro', 'manifest.json'), `${JSON.stringify({ protocol: 'company-brain', manifest_version: 1 })}\n`);
  return vault;
}

function run(script, args, { cwd, env = {} } = {}) {
  const clean = { ...process.env };
  delete clean.CEREBRO_INSTALL_ROOT;
  delete clean.CEREBRO_MOTOR_DIR;
  return spawnSync(process.execPath, [join(MOTOR, 'scripts', script), ...args], {
    cwd, env: { ...clean, CEREBRO_TELEMETRY: 'off', ...env }, encoding: 'utf8', timeout: 20000,
  });
}

try {
  // Ponteiro: KEY=VALUE, caminho absoluto obrigatório.
  const vault = makeVault('vault-a');
  assert.deepEqual(readMotorPointer(vault), { motorDir: MOTOR, motorVersion: '9.9.9' });
  const relative = join(temp, 'vault-relativo');
  write(join(relative, '.cerebro', 'motor'), 'MOTOR_DIR=../motor\n');
  assert.equal(readMotorPointer(relative), null);
  assert.equal(readMotorPointer(join(temp, 'inexistente')), null);

  // Reconhecimento: manifesto company-brain ou formato legado.
  assert.equal(isBrainRoot(vault), true);
  assert.equal(isBrainRoot(makeVault('sem-manifesto', { manifest: false })), false);
  const legacy = join(temp, 'legado');
  mkdirSync(legacy);
  write(join(legacy, 'VERSION'), '1.2.3\n');
  assert.equal(isBrainRoot(legacy), false);
  write(join(legacy, 'COMECE-AQUI.md'), 'x\n');
  assert.equal(isBrainRoot(legacy), true);
  assert.equal(isBrainRoot(join(temp, 'so-cerebro')), false);
  assert.equal(isBrainRoot(MOTOR), true);

  // Versão: própria, senão a do motor apontado.
  assert.equal(brainVersion(legacy), '1.2.3');
  assert.equal(brainVersion(vault), readFileSync(join(MOTOR, 'VERSION'), 'utf8').trim());
  const motorSemVersion = join(temp, 'motor-sem-version');
  mkdirSync(motorSemVersion);
  assert.equal(brainVersion(makeVault('vault-b', { motor: motorSemVersion })), '9.9.9');
  assert.equal(brainVersion(join(temp, 'vazio')), null);

  // Resolução: explícita > env > cwd com ponteiro > padrão de cada script.
  const scriptRoot = MOTOR;
  assert.deepEqual(resolveRoots({ env: {}, cwd: vault, scriptRoot }), { vault, motor: MOTOR, mode: 'split' });
  assert.deepEqual(resolveRoots({ env: { CEREBRO_INSTALL_ROOT: vault }, cwd: temp, scriptRoot }), { vault, motor: MOTOR, mode: 'split' });
  assert.equal(resolveRoots({ explicit: vault, env: {}, cwd: temp, scriptRoot }).mode, 'split');
  assert.deepEqual(resolveRoots({ env: {}, cwd: legacy, scriptRoot, fallback: 'cwd' }), { vault: legacy, motor: MOTOR, mode: 'legacy' });
  // Sem vault em lugar nenhum, o padrão legado do script seria o próprio motor: num motor dividido isso é recusado.
  assert.throws(() => resolveRoots({ env: {}, cwd: legacy, scriptRoot, fallback: 'script' }), /motor/);
  assert.deepEqual(resolveRoots({ env: {}, cwd: legacy, scriptRoot: legacy, fallback: 'script' }), { vault: legacy, motor: legacy, mode: 'legacy' });
  const semScript = resolveRoots({ env: { CEREBRO_MOTOR_DIR: motorSemVersion }, cwd: vault });
  assert.equal(semScript.motor, motorSemVersion);

  // O motor nunca recebe dado do dono quando o vault é outra pasta.
  assert.throws(() => resolveRoots({ explicit: MOTOR, env: { CEREBRO_INSTALL_ROOT: vault }, cwd: temp, scriptRoot }), /motor/);
  assert.throws(() => assertNotMotor(MOTOR, { vault, motor: MOTOR, mode: 'split' }), /motor/);
  assert.doesNotThrow(() => assertNotMotor(vault, { vault, motor: MOTOR, mode: 'split' }));
  assert.doesNotThrow(() => assertNotMotor(MOTOR, { vault: MOTOR, motor: MOTOR, mode: 'legacy' }));
  assert.doesNotThrow(() => assertNotMotor(MOTOR));

  // Scripts reais: vault descoberto pelo cwd, sem VERSION nem COMECE-AQUI nele.
  const before = treeHash(MOTOR);
  const source = join(temp, 'fonte');
  mkdirSync(source);
  const registered = run('register-source.mjs', ['--path', source, '--type', 'local-folder', '--label', 'Fonte de teste', '--confirm'], { cwd: vault });
  assert.equal(registered.status, 0, registered.stderr);
  assert.equal(JSON.parse(registered.stdout).registered, true);
  assert.equal(existsSync(join(vault, 'operacao', '_HOJE.md')), true, 'brief gravado no vault');

  const started = run('concierge-run.mjs', ['start', '--run-id', 'teste-split'], { cwd: vault });
  assert.equal(started.status, 0, started.stderr);
  const record = JSON.parse(readFileSync(join(vault, '.cerebro', 'concierge-runs', 'teste-split.json'), 'utf8'));
  assert.equal(record.productVersion, readFileSync(join(MOTOR, 'VERSION'), 'utf8').trim(), 'versão vem do motor');

  const access = run('runtime-access.mjs', ['status'], { cwd: vault });
  assert.equal(access.status, 0, access.stderr);

  const contract = run('source-contract.mjs', ['show', 'inexistente'], { cwd: vault, env: { CEREBRO_INSTALL_ROOT: vault } });
  assert.match(contract.stderr, /Source Contract não encontrado/, 'vault aceito como Cérebro sem VERSION');

  const binding = run('system-source-binding.mjs', ['list'], { cwd: vault });
  assert.equal(binding.status, 0, binding.stderr);

  const compiled = run('vault-compile.mjs', [], { cwd: vault });
  assert.doesNotMatch(compiled.stderr, /Cérebro reconhecido/);

  const discovered = run('discover-context.mjs', ['--root', vault, '--max-depth', '0', '--json'], { cwd: temp });
  assert.equal(JSON.parse(discovered.stdout).candidates[0].kind, 'cerebro-brain');

  // Ponteiro com caminho de Windows vale, como no lançador; relativo não.
  const winVault = join(temp, 'vault-win');
  write(join(winVault, '.cerebro', 'motor'), 'MOTOR_DIR=C:\\Cerebro\\motor\nMOTOR_VERSION=1.0.0\n');
  assert.deepEqual(readMotorPointer(winVault), { motorDir: 'C:\\Cerebro\\motor', motorVersion: '1.0.0' });

  // Chamada direta com cwd numa subpasta do vault: sobe até o ponteiro e grava no vault.
  const nested = join(vault, 'meu-negocio', 'fios');
  mkdirSync(nested, { recursive: true });
  assert.deepEqual(resolveRoots({ env: {}, cwd: nested, scriptRoot: MOTOR }), { vault, motor: MOTOR, mode: 'split' });
  const hojeAntes = existsSync(join(MOTOR, 'operacao', '_HOJE.md'));
  const brief = run('generate-operating-brief.mjs', [], { cwd: nested });
  assert.equal(brief.status, 0, brief.stderr);
  assert.equal(existsSync(join(vault, 'operacao', '_HOJE.md')), true);
  assert.equal(existsSync(join(MOTOR, 'operacao', '_HOJE.md')), hojeAntes, 'o motor não ganha _HOJE.md');

  // Motor como cwd, sem env: recusa legível (sem stack trace) e nada é gravado nele.
  assert.throws(() => resolveRoots({ env: {}, cwd: MOTOR, scriptRoot: MOTOR }), /motor/);
  assert.throws(() => resolveRoots({ explicit: join(MOTOR, 'sub'), env: {}, cwd: temp, scriptRoot: MOTOR }), /motor/);
  assert.throws(() => assertNotMotor(join(MOTOR, 'sub'), { vault, motor: MOTOR, mode: 'split' }), /motor/);
  const refusedBrief = run('generate-operating-brief.mjs', [], { cwd: MOTOR });
  assert.equal(refusedBrief.status, 1);
  assert.match(refusedBrief.stderr, /^✗ a pasta é o motor/);
  assert.doesNotMatch(refusedBrief.stderr, /\n\s+at /);
  assert.equal(existsSync(join(MOTOR, 'operacao')), false);

  // CLIs de ativação e ping sem raiz explícita.
  const quiet = { CEREBRO_API_URL: 'http://127.0.0.1:9' };
  const ping = (cwd) => spawnSync(process.execPath, [join(MOTOR, '.agents', 'scripts', 'ping.mjs'), 'sessao'], {
    cwd, env: { ...process.env, ...quiet, CEREBRO_INSTALL_ROOT: '', CEREBRO_MOTOR_DIR: '' }, encoding: 'utf8', timeout: 20000,
  });
  const pingNested = ping(nested);
  assert.equal(pingNested.status, 0, pingNested.stderr);
  assert.equal(existsSync(join(vault, '.cerebro', 'id')), true, 'identidade criada no vault');
  const pingMotor = ping(MOTOR);
  assert.equal(pingMotor.status, 1);
  assert.match(pingMotor.stderr, /^✗ a pasta é o motor/);
  assert.equal(existsSync(join(MOTOR, '.cerebro', 'id')), false, 'ping não cria identidade no motor');
  const activate = (cwd) => spawnSync(process.execPath, [join(MOTOR, '.agents', 'scripts', 'activate.mjs'),
    `--claim=${'a'.repeat(43)}`, '--runtime=codex'], {
    cwd, env: { ...process.env, CEREBRO_TELEMETRY: 'off', ...quiet, CEREBRO_INSTALL_ROOT: '', CEREBRO_MOTOR_DIR: '' }, encoding: 'utf8', timeout: 20000,
  });
  const activateMotor = activate(MOTOR);
  assert.equal(activateMotor.status, 1);
  assert.match(activateMotor.stderr, /motor/);
  assert.doesNotMatch(activateMotor.stderr, /\n\s+at /);
  assert.equal(existsSync(join(MOTOR, '.cerebro', 'operator-runtime')), false);
  assert.equal(activate(nested).status, 0);
  assert.equal(readFileSync(join(vault, '.cerebro', 'operator-runtime'), 'utf8').trim(), 'codex');

  // Sem ponteiro e sem manifesto o mesmo script recusa a pasta.
  const stranger = join(temp, 'pasta-qualquer');
  mkdirSync(join(stranger, '.cerebro'), { recursive: true });
  const refused = run('source-contract.mjs', ['show', 'x'], { cwd: stranger, env: { CEREBRO_INSTALL_ROOT: stranger } });
  assert.match(refused.stderr, /não é um Cérebro reconhecido/);

  assert.equal(treeHash(MOTOR), before, 'o motor não pode mudar');

  console.log('✓ raízes em duas pastas: scripts gravam só no vault e o motor fica intacto');
} finally {
  rmSync(temp, { recursive: true, force: true });
}
