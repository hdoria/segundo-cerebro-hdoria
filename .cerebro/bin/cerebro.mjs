#!/usr/bin/env node
// Lançador do Cérebro: roda um comando do motor sobre este vault.
// Uso: node .cerebro/bin/cerebro.mjs <comando> [argumentos]
// O arquivo é projetado pelo motor e não importa nada dele. Não edite: o /atualizar o reescreve.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join, posix, resolve, win32 } from 'node:path';
import { fileURLToPath } from 'node:url';

const VAULT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const COMMAND_RE = /^[a-z0-9-]+$/;
const ALLOWED = new Set([
  'activate', 'concierge-run', 'commission-system', 'community', 'compatibility-diagnostic',
  'console', 'discover-context', 'entity', 'eval-calls', 'generate-operating-brief',
  'install-system', 'installation-compatibility', 'motor-path', 'ping', 'register-source',
  'render-map', 'routine-runtime', 'runtime-access', 'runtime-secret', 'source-contract',
  'system-contract', 'system-experiment', 'system-learn', 'system-run', 'system-source-binding',
  'system-state', 'update', 'vault-compile', 'vault-import-history', 'vault-import-journal', 'vault-sync',
]);
const SKILL_SCRIPTS = { 'render-map': ['.claude', 'skills', 'arquiteto', 'scripts', 'render-map.mjs'] };
const AGENT_SCRIPTS = new Set(['activate', 'ping']);

function die(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function readPointer() {
  let text;
  try {
    text = readFileSync(join(VAULT, '.cerebro', 'motor'), 'utf8');
  } catch {
    return null;
  }
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) values[match[1]] = match[2];
  }
  return values;
}

// Ordem: CEREBRO_MOTOR_DIR, CEREBRO_CONSOLE_DIR, ponteiro do vault. Sem nenhum deles, só uma pasta
// que é o próprio motor (tem scripts/ e VERSION: instalação de pasta única ou o repositório do motor
// em desenvolvimento) serve a si mesma. Fora disso, nunca adivinha. O que vem do ponteiro precisa ser
// o motor de uma instalação (.cerebro/motor-install.json), como no update; as variáveis de ambiente
// são escolha explícita de quem roda e valem para qualquer pasta com scripts/.
function resolveMotor(pointer) {
  const fromEnv = process.env.CEREBRO_MOTOR_DIR || process.env.CEREBRO_CONSOLE_DIR || '';
  let candidate = fromEnv || pointer?.MOTOR_DIR || '';
  if (!candidate && existsSync(join(VAULT, 'scripts')) && existsSync(join(VAULT, 'VERSION'))) candidate = VAULT;
  if (!candidate) {
    die(`motor não encontrado: este vault não tem o ponteiro .cerebro/motor e CEREBRO_MOTOR_DIR não está definido. Para religar o vault ao motor, rode (troque pela pasta do motor e pela versão instalada): node <pasta do motor>/scripts/update.mjs --vault "${VAULT}" --motor <pasta do motor> --tag vX.Y.Z --link. Ele mostra a prévia e só grava com o hash aprovado.`);
  }
  if (!posix.isAbsolute(candidate) && !win32.isAbsolute(candidate)) die('o caminho do motor precisa ser absoluto');
  const motor = resolve(candidate);
  if (!existsSync(join(motor, 'scripts'))) die(`motor inválido em ${motor}: pasta scripts ausente. Confira .cerebro/motor ou CEREBRO_MOTOR_DIR.`);
  if (!fromEnv && pointer?.MOTOR_DIR && !existsSync(join(motor, '.cerebro', 'motor-install.json'))) {
    die(`motor inválido em ${motor}: a pasta do ponteiro .cerebro/motor não é o motor de uma instalação do Cérebro. Para apontar para o motor certo: node <pasta do motor>/scripts/update.mjs --vault "${VAULT}" --motor <pasta do motor> --tag vX.Y.Z --link.`);
  }
  return realpathSync(motor);
}

function targetFor(motor, command) {
  if (SKILL_SCRIPTS[command]) return join(motor, ...SKILL_SCRIPTS[command]);
  if (AGENT_SCRIPTS.has(command)) return join(motor, '.agents', 'scripts', `${command}.mjs`);
  return join(motor, 'scripts', `${command}.mjs`);
}

const [command = '', ...args] = process.argv.slice(2);
if (!command || command === '--help' || command === '-h') {
  console.log(`uso: node .cerebro/bin/cerebro.mjs <comando> [argumentos]\ncomandos: ${[...ALLOWED].sort().join(', ')}`);
  process.exit(command ? 0 : 1);
}
if (!COMMAND_RE.test(command) || !ALLOWED.has(command)) {
  die(`comando desconhecido: ${command.slice(0, 40)}. Rode sem argumentos para ver a lista.`);
}

const pointer = readPointer();
const motor = resolveMotor(pointer);

if (command === 'motor-path') {
  console.log(motor);
  process.exit(0);
}

let motorVersion = '';
try {
  motorVersion = readFileSync(join(motor, 'VERSION'), 'utf8').trim();
} catch {
  motorVersion = '';
}
if (pointer?.MOTOR_VERSION && motorVersion && pointer.MOTOR_VERSION !== motorVersion) {
  console.error(`aviso: este vault foi projetado para o motor ${pointer.MOTOR_VERSION}, mas o motor em uso é ${motorVersion}. Rode /atualizar.`);
}

const script = targetFor(motor, command);
if (!existsSync(script)) die(`o motor em ${motor} não tem o comando ${command}`);

const childArgs = command === 'console' ? [script, `--root=${VAULT}`, ...args] : [script, ...args];
const child = spawn(process.execPath, childArgs, {
  cwd: VAULT,
  env: { ...process.env, CEREBRO_INSTALL_ROOT: VAULT },
  stdio: 'inherit',
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', (error) => die(`não foi possível executar ${command}: ${error.message}`));
child.on('close', (code, signal) => process.exit(signal ? 1 : (code ?? 1)));
