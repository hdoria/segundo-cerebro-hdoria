#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { buildConsoleReadModel, LEGACY_IDENTIFIERS_COMMAND } from './lib/console-read-model.mjs';

const root = mkdtempSync(join(tmpdir(), 'console-legacy-identifiers-'));
const write = (ref, text) => {
  mkdirSync(dirname(join(root, ref)), { recursive: true });
  writeFileSync(join(root, ref), text);
};

try {
  const receipts = '.cerebro/runtime/receipts/routines';
  for (const id of ['a', 'b', 'c']) {
    write(`${receipts}/routine-receipt-legado-${id}.json`, JSON.stringify({ privacy: { content_shared_with_inevita: false } }));
  }
  write(`${receipts}/routine-receipt-quebrado.json`, '{ nao e json');

  const issues = buildConsoleReadModel(root).issues;
  const legacy = issues.filter((issue) => issue.reason_code === 'legacy-identifiers');
  assert.equal(legacy.length, 1, 'recibos no formato antigo viram um aviso só');
  assert.equal(legacy[0].count, 3);
  assert.ok(legacy[0].ref.includes(LEGACY_IDENTIFIERS_COMMAND), 'o aviso traz o comando da migração');
  assert.equal(issues.filter((issue) => issue.ref?.includes('routine-receipt-legado')).length, 0,
    'recibo antigo não aparece também como ilegível');
  assert.ok(issues.some((issue) => issue.reason_code === 'routine-receipt-invalid' && issue.ref.endsWith('routine-receipt-quebrado.json')),
    'recibo ilegível por outro motivo continua listado');
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log('✓ Saúde agrupa dados no formato antigo num aviso com o comando da migração');
