#!/usr/bin/env node
// Lançador do vault: resolução do motor, ambiente do filho, allowlist e avisos.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const LAUNCHER = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'templates', 'vault', '.cerebro', 'bin', 'cerebro.mjs');
const temp = realpathSync(mkdtempSync(join(tmpdir(), 'cerebro-launcher-')));
const STUB = `console.log(JSON.stringify({ file: new URL(import.meta.url).pathname, argv: process.argv.slice(2), cwd: process.cwd(), installRoot: process.env.CEREBRO_INSTALL_ROOT }));
process.exit(Number(process.env.STUB_EXIT || 0));\n`;

function write(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function makeMotor(name, version = '1.0.0', { installed = true } = {}) {
  const motor = join(temp, name);
  if (installed) write(join(motor, '.cerebro', 'motor-install.json'), '{}\n');
  for (const file of [
    'scripts/system-run.mjs', 'scripts/update.mjs', 'scripts/install.mjs', 'scripts/console.mjs', 'scripts/vault-sync.mjs',
    '.agents/scripts/ping.mjs', '.claude/skills/arquiteto/scripts/render-map.mjs',
  ]) write(join(motor, file), STUB);
  write(join(motor, 'VERSION'), `${version}\n`);
  return motor;
}

function makeVault(name, pointer) {
  const vault = join(temp, name);
  mkdirSync(join(vault, '.cerebro', 'bin'), { recursive: true });
  copyFileSync(LAUNCHER, join(vault, '.cerebro', 'bin', 'cerebro.mjs'));
  if (pointer) write(join(vault, '.cerebro', 'motor'), pointer);
  return vault;
}

function launch(vault, args, env = {}) {
  const clean = { ...process.env };
  for (const key of ['CEREBRO_MOTOR_DIR', 'CEREBRO_CONSOLE_DIR', 'CEREBRO_INSTALL_ROOT']) delete clean[key];
  return spawnSync(process.execPath, [join(vault, '.cerebro', 'bin', 'cerebro.mjs'), ...args], {
    cwd: temp, env: { ...clean, ...env }, encoding: 'utf8', timeout: 15000,
  });
}

try {
  const motor = makeMotor('motor');
  const vault = makeVault('notas', `MOTOR_DIR=${motor}\nMOTOR_VERSION=1.0.0\n`);

  // Ponteiro, ambiente do filho e passagem de argumentos.
  const run = launch(vault, ['system-run', 'meu-sistema', 'start', '--eval=pass']);
  assert.equal(run.status, 0, run.stderr);
  const seen = JSON.parse(run.stdout);
  assert.equal(seen.file, join(motor, 'scripts', 'system-run.mjs'));
  assert.deepEqual(seen.argv, ['meu-sistema', 'start', '--eval=pass']);
  assert.equal(seen.cwd, vault, 'cwd no vault, mesmo chamado de fora');
  assert.equal(seen.installRoot, vault);
  assert.equal(run.stderr, '', 'sem aviso quando as versões batem');

  // update faz parte da allowlist (o /atualizar roda a partir do vault); install não: instalação
  // nova nunca roda de dentro de um vault.
  const upd = launch(vault, ['update', '--tag', 'v1.0.0']);
  assert.equal(upd.status, 0, upd.stderr);
  assert.equal(JSON.parse(upd.stdout).file, join(motor, 'scripts', 'update.mjs'));
  const inst = launch(vault, ['install', '--tag', 'v1.0.0']);
  assert.equal(inst.status, 1);
  assert.match(inst.stderr, /comando desconhecido: install/);

  // motor-path, ping e render-map têm destinos próprios; console recebe a raiz do vault.
  assert.equal(launch(vault, ['motor-path']).stdout.trim(), motor);
  assert.equal(JSON.parse(launch(vault, ['ping', 'sessao']).stdout).file, join(motor, '.agents', 'scripts', 'ping.mjs'));
  assert.equal(JSON.parse(launch(vault, ['render-map', 'a.json']).stdout).file, join(motor, '.claude', 'skills', 'arquiteto', 'scripts', 'render-map.mjs'));
  assert.deepEqual(JSON.parse(launch(vault, ['console', '--port=4999']).stdout).argv, [`--root=${vault}`, '--port=4999']);
  assert.equal(JSON.parse(launch(vault, ['vault-sync', '--confirm']).stdout).file, join(motor, 'scripts', 'vault-sync.mjs'));

  // Código de saída do filho é preservado.
  assert.equal(launch(vault, ['system-run', 'x'], { STUB_EXIT: '3' }).status, 3);

  // Precedência: CEREBRO_MOTOR_DIR, depois CEREBRO_CONSOLE_DIR, depois o ponteiro.
  const motorEnv = makeMotor('motor-env', '1.0.0');
  const motorConsole = makeMotor('motor-console', '1.0.0');
  assert.equal(launch(vault, ['motor-path'], { CEREBRO_MOTOR_DIR: motorEnv, CEREBRO_CONSOLE_DIR: motorConsole }).stdout.trim(), motorEnv);
  assert.equal(launch(vault, ['motor-path'], { CEREBRO_CONSOLE_DIR: motorConsole }).stdout.trim(), motorConsole);

  // Vault sem ponteiro usa a variável de ambiente; sem nada, erro legível e sem chute.
  const semPonteiro = makeVault('sem-ponteiro');
  assert.equal(launch(semPonteiro, ['motor-path'], { CEREBRO_CONSOLE_DIR: motorConsole }).stdout.trim(), motorConsole);
  const nada = launch(semPonteiro, ['system-run', 'x']);
  assert.equal(nada.status, 1);
  assert.match(nada.stderr, /motor não encontrado/);
  assert.match(nada.stderr, /update\.mjs --vault .* --motor .* --link/, 'a mensagem traz o comando concreto de religar');
  assert.equal(nada.stderr.includes('/atualizar'), false);
  assert.equal(nada.stdout, '');

  // N4: pelo ponteiro, só serve uma pasta que é motor de instalação (motor-install.json), como no update.
  const bruto = makeMotor('motor-bruto', '1.0.0', { installed: false });
  const apontaBruto = makeVault('aponta-bruto', `MOTOR_DIR=${bruto}\nMOTOR_VERSION=1.0.0\n`);
  const recusado = launch(apontaBruto, ['system-run', 'x']);
  assert.equal(recusado.status, 1);
  assert.match(recusado.stderr, /não é o motor de uma instalação/);
  assert.equal(recusado.stdout, '');
  assert.equal(launch(apontaBruto, ['motor-path']).status, 1);
  // Variável de ambiente explícita continua valendo para qualquer pasta com scripts/.
  assert.equal(launch(apontaBruto, ['motor-path'], { CEREBRO_MOTOR_DIR: bruto }).stdout.trim(), bruto);

  // Pasta única (ou o repositório do motor): com scripts/ e VERSION a pasta serve a si mesma.
  const unica = makeMotor('pasta-unica', '1.0.0', { installed: false });
  mkdirSync(join(unica, '.cerebro', 'bin'), { recursive: true });
  copyFileSync(LAUNCHER, join(unica, '.cerebro', 'bin', 'cerebro.mjs'));
  assert.equal(launch(unica, ['motor-path']).stdout.trim(), unica);
  const proprio = launch(unica, ['system-run', 'x']);
  assert.equal(JSON.parse(proprio.stdout).file, join(unica, 'scripts', 'system-run.mjs'));
  assert.equal(JSON.parse(proprio.stdout).cwd, unica);
  assert.equal(proprio.stderr, '');

  // Ponteiro com caminho de Windows passa da checagem de caminho absoluto.
  const win = makeVault('win', 'MOTOR_DIR=C:\\Cerebro\\motor\n');
  assert.match(launch(win, ['motor-path']).stderr, /motor inválido/);

  // SIGTERM no lançador chega ao filho.
  const marker = join(temp, 'sinal-recebido');
  const motorSinal = makeMotor('motor-sinal');
  write(join(motorSinal, 'scripts', 'system-run.mjs'), `import { writeFileSync } from 'node:fs';
process.on('SIGTERM', () => { writeFileSync(${JSON.stringify(marker)}, 'ok'); process.exit(0); });
console.log('pronto'); setInterval(() => {}, 1000);\n`);
  const vaultSinal = makeVault('v-sinal', `MOTOR_DIR=${motorSinal}\nMOTOR_VERSION=1.0.0\n`);
  const child = spawn(process.execPath, [join(vaultSinal, '.cerebro', 'bin', 'cerebro.mjs'), 'system-run', 'x'], { cwd: temp, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((done) => child.stdout.once('data', done));
  const closed = new Promise((done) => child.once('close', done));
  child.kill('SIGTERM');
  assert.equal(await closed, 0);
  assert.equal(existsSync(marker), true, 'o filho recebeu SIGTERM');

  // Ponteiro quebrado: relativo, inexistente ou sem scripts.
  const relativo = makeVault('relativo', 'MOTOR_DIR=../motor\n');
  assert.match(launch(relativo, ['motor-path']).stderr, /absoluto/);
  const inexistente = makeVault('inexistente', `MOTOR_DIR=${join(temp, 'nao-existe')}\n`);
  assert.match(launch(inexistente, ['motor-path']).stderr, /motor inválido/);

  // Allowlist e formato: nada de caminho, maiúscula, vazio ou comando fora da lista.
  for (const bad of ['../x', '../../etc/passwd', 'a/b', 'System-Run', 'rm', 'update-all', 'system-run;ls', '']) {
    const refused = launch(vault, [bad]);
    assert.notEqual(refused.status, 0, `recusou ${JSON.stringify(bad)}`);
    assert.equal(refused.stdout.includes('"file"'), false, `não executou ${JSON.stringify(bad)}`);
  }
  assert.match(launch(vault, ['../x']).stderr, /comando desconhecido/);

  // Comando permitido que o motor não tem.
  const motorSemComando = makeMotor('motor-incompleto');
  rmSync(join(motorSemComando, 'scripts', 'system-run.mjs'));
  const semComando = launch(makeVault('v-incompleto', `MOTOR_DIR=${motorSemComando}\nMOTOR_VERSION=1.0.0\n`), ['system-run', 'x']);
  assert.equal(semComando.status, 1);
  assert.match(semComando.stderr, /não tem o comando/);

  // Aviso de versão: o vault foi projetado para outro motor, o comando ainda roda.
  const velho = makeVault('velho', `MOTOR_DIR=${motor}\nMOTOR_VERSION=0.9.0\n`);
  const aviso = launch(velho, ['system-run', 'x']);
  assert.equal(aviso.status, 0);
  assert.match(aviso.stderr, /0\.9\.0.*1\.0\.0.*\/atualizar/);

  console.log('✓ lançador do vault: ponteiro, ambiente, allowlist, caminhos recusados e aviso de versão');
} finally {
  rmSync(temp, { recursive: true, force: true });
}
