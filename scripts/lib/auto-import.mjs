// Mantém os recibos de sessões, dailies e weekly reviews em dia sem ninguém rodar comando.
// O Console chama os dois importadores do vault logo depois de subir e em intervalo. Ambos são
// idempotentes e gravam só no runtime e no ledger de runs declarados pelo layout; o estado desta
// rotina mora em `.cerebro/runtime/`.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { importVaultSessionHistory } from './vault-history.mjs';
import { importVaultJournalRuns } from './vault-journal-runs.mjs';

export const AUTO_IMPORT_STEPS = Object.freeze([
  ['history', (root) => importVaultSessionHistory(root, { confirm: true })],
  ['journal', (root) => importVaultJournalRuns(root, { confirm: true })],
]);
const DEFAULT_MINUTES = 30;
const CODE = /^[a-z0-9][a-z0-9-]{0,63}$/;

export const autoImportStatusPath = (root) => join(root, '.cerebro', 'runtime', 'auto-import.json');

// Mensagem de erro pode trazer caminho interno; só código curto vai para o estado e para a tela.
const errorCode = (error) => (CODE.test(error?.message || '') ? error.message : 'import-failed');

export function readAutoImportStatus(root) {
  try {
    const value = JSON.parse(readFileSync(autoImportStatusPath(root), 'utf8'));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function writeStatus(root, status) {
  const path = autoImportStatusPath(root);
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify(status, null, 2)}\n`, { mode: 0o600 });
  renameSync(temp, path);
}

/** Intervalo em minutos de CEREBRO_AUTO_IMPORT_MINUTES (padrão 30, `0` desliga). */
export function autoImportMinutes(env = process.env) {
  const raw = env.CEREBRO_AUTO_IMPORT_MINUTES;
  if (raw === undefined || raw === '') return DEFAULT_MINUTES;
  const minutes = Number(raw);
  return Number.isInteger(minutes) && minutes >= 0 && minutes <= 1440 ? minutes : DEFAULT_MINUTES;
}

export function createAutoImporter({ root, minutes = autoImportMinutes(), steps = AUTO_IMPORT_STEPS, clock = () => new Date() }) {
  let running = null;
  let timer = null;
  let first = null;

  // Uma execução por vez: quem chama durante uma execução recebe a mesma promessa.
  const runOnce = () => {
    if (running) return running;
    running = (async () => {
      const started_at = clock().toISOString();
      const results = {};
      for (const [id, step] of steps) {
        try {
          const report = await step(root);
          results[id] = { ok: true, mode: typeof report?.mode === 'string' ? report.mode : null };
        } catch (error) {
          results[id] = { ok: false, error_code: errorCode(error) };
        }
      }
      const status = { started_at, completed_at: clock().toISOString(), interval_minutes: minutes, steps: results };
      try { writeStatus(root, status); } catch { /* sem runtime gravável, a próxima rodada tenta de novo */ }
      return status;
    })().finally(() => { running = null; });
    return running;
  };

  return {
    runOnce,
    start() {
      if (!minutes || timer) return;
      // Os importadores são síncronos: espera a primeira carga da página antes de rodar.
      first = setTimeout(() => { void runOnce(); }, 3_000);
      first.unref?.();
      timer = setInterval(() => { void runOnce(); }, minutes * 60_000);
      timer.unref?.();
    },
    stop() {
      if (first) clearTimeout(first);
      if (timer) clearInterval(timer);
      first = null;
      timer = null;
    },
  };
}
