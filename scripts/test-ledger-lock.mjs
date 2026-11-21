#!/usr/bin/env node
// Trava do ledger de runs: reescrita (importador) e append não podem perder linhas um do
// outro. Prova com processos de verdade; fixture sintética em diretório temporário.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withLedgerLock } from './lib/ledger-lock.mjs';
import { appendRunRecord, ledgerPath } from './lib/system-protocol.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SELF = fileURLToPath(import.meta.url);
const APPENDS = 120;

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// Papéis dos processos filhos.
const [, , role, root, doneFlag] = process.argv;

if (role === 'rewriter') {
  // Mesmo desenho do importador: lê o ledger inteiro, monta de novo e troca por rename,
  // tudo sob a trava. A pausa alarga a janela entre a leitura e o rename.
  const path = ledgerPath(root);
  const rewrite = () => {
    const content = existsSync(path) ? readFileSync(path, 'utf8') : '';
    sleep(3);
    const temporary = `${path}.${process.pid}.tmp`;
    writeFileSync(temporary, content, { mode: 0o600 });
    renameSync(temporary, path);
  };
  while (!existsSync(doneFlag)) withLedgerLock(path, rewrite);
  withLedgerLock(path, rewrite);
  process.exit(0);
}

if (role === 'appender') {
  const template = JSON.parse(readFileSync(join(ROOT, 'protocol', 'examples', 'run-record.v2.json'), 'utf8'));
  for (let index = 0; index < APPENDS; index += 1) {
    appendRunRecord(root, { ...template, run_id: `run-lock-test-${String(index).padStart(4, '0')}` });
    sleep(1);
  }
  writeFileSync(doneFlag, 'ok');
  process.exit(0);
}

function exited(child) {
  return new Promise((done) => child.on('exit', (code) => done(code)));
}

const temp = mkdtempSync(join(tmpdir(), 'cerebro-ledger-lock-'));
try {
  // 1. Reescrita e append concorrentes: todas as linhas sobrevivem.
  const vault = join(temp, 'vault');
  mkdirSync(join(vault, '.cerebro'), { recursive: true });
  writeFileSync(join(vault, '.cerebro', 'layout.json'), JSON.stringify({ runLedger: '.cerebro/runtime/ledger/runs.jsonl' }));
  const flag = join(temp, 'appender-done');
  const rewriter = spawn(process.execPath, [SELF, 'rewriter', vault, flag], { stdio: 'inherit' });
  const appender = spawn(process.execPath, [SELF, 'appender', vault, flag], { stdio: 'inherit' });
  const [rewriterCode, appenderCode] = await Promise.all([exited(rewriter), exited(appender)]);
  assert.equal(appenderCode, 0, 'appender terminou com erro');
  assert.equal(rewriterCode, 0, 'rewriter terminou com erro');
  const ids = readFileSync(ledgerPath(vault), 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line).run_id);
  const missing = Array.from({ length: APPENDS }, (_, index) => `run-lock-test-${String(index).padStart(4, '0')}`)
    .filter((id) => !ids.includes(id));
  assert.deepEqual(missing, [], `linhas perdidas: ${missing.length} de ${APPENDS}`);
  assert.equal(ids.length, APPENDS, 'linhas duplicadas ou a mais');
  assert.equal(existsSync(`${ledgerPath(vault)}.lock`), false, 'trava ficou para trás');

  // 2. Liberação em finally: erro dentro do trabalho solta a trava e propaga.
  const ledger = join(temp, 'direct', 'runs.jsonl');
  assert.throws(() => withLedgerLock(ledger, () => { throw new Error('falha-do-trabalho'); }), /falha-do-trabalho/);
  assert.equal(existsSync(`${ledger}.lock`), false);
  assert.equal(withLedgerLock(ledger, () => 'valor'), 'valor');

  // 3. Trava velha com dono morto é recuperada.
  const dead = spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8' });
  const deadPid = Number(dead.stdout);
  writeFileSync(`${ledger}.lock`, JSON.stringify({ pid: deadPid, at: Date.now() }));
  assert.equal(withLedgerLock(ledger, () => 'recuperada', { timeoutMs: 500 }), 'recuperada');
  assert.equal(existsSync(`${ledger}.lock`), false);

  // 4. Trava velha por idade (dono vivo, mas acima do limite) é recuperada.
  writeFileSync(`${ledger}.lock`, JSON.stringify({ pid: process.pid, at: Date.now() - 5_000 }));
  assert.equal(withLedgerLock(ledger, () => 'velha', { timeoutMs: 500, staleMs: 1_000 }), 'velha');

  // 5. Trava viva e recente: espera e estoura com código kebab-case, sem remover a trava.
  writeFileSync(`${ledger}.lock`, JSON.stringify({ pid: process.pid, at: Date.now() }));
  const started = Date.now();
  let failure = null;
  try {
    withLedgerLock(ledger, () => 'nunca', { timeoutMs: 300, staleMs: 60_000 });
  } catch (error) {
    failure = error;
  }
  assert.equal(failure?.code, 'ledger-lock-timeout');
  assert.equal(failure?.message, 'ledger-lock-timeout');
  assert.ok(Date.now() - started >= 250, 'não esperou o tempo limite');
  assert.equal(existsSync(`${ledger}.lock`), true, 'trava viva foi removida');
} finally {
  rmSync(temp, { recursive: true, force: true });
}

console.log('ledger lock ok');
