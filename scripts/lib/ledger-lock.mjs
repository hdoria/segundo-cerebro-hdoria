// Trava de arquivo do ledger de runs. Todo escritor do ledger (append e reescrita) passa
// por `withLedgerLock`, para uma reescrita (leitura + montagem + rename) nunca perder a
// linha de um append que caiu no meio. API síncrona, como os escritores.
import { closeSync, mkdirSync, openSync, readFileSync, rmSync, writeSync } from 'node:fs';
import { dirname } from 'node:path';

export const LOCK_TIMEOUT_MS = 10_000;
export const LOCK_STALE_MS = 60_000;
const RETRY_MS = 10;

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

// Trava velha: dono morto, ou idade acima do limite. Arquivo ilegível conta pela idade
// gravada (ou, sem ela, é tratado como recém-criado por outro processo e fica).
function isStale(lockPath, staleMs) {
  let info;
  try {
    info = JSON.parse(readFileSync(lockPath, 'utf8'));
  } catch {
    return false;
  }
  if (Number.isInteger(info.pid) && !pidAlive(info.pid)) return true;
  return Number.isFinite(info.at) && Date.now() - info.at > staleMs;
}

export function withLedgerLock(ledgerPath, work, options = {}) {
  const timeoutMs = options.timeoutMs ?? LOCK_TIMEOUT_MS;
  const staleMs = options.staleMs ?? LOCK_STALE_MS;
  const lockPath = `${ledgerPath}.lock`;
  mkdirSync(dirname(ledgerPath), { recursive: true });
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    let fd;
    try {
      fd = openSync(lockPath, 'wx', 0o600);
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (isStale(lockPath, staleMs)) {
        rmSync(lockPath, { force: true });
        continue;
      }
      if (Date.now() >= deadline) {
        const timeout = new Error('ledger-lock-timeout');
        timeout.code = 'ledger-lock-timeout';
        throw timeout;
      }
      sleep(RETRY_MS);
      continue;
    }
    try {
      writeSync(fd, JSON.stringify({ pid: process.pid, at: Date.now() }));
    } finally {
      closeSync(fd);
    }
    try {
      return work();
    } finally {
      rmSync(lockPath, { force: true });
    }
  }
}
