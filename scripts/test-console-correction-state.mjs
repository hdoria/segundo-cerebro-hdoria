#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { correctionView } from './lib/correction-loop.mjs';

const app = readFileSync(new URL('../console/app.js', import.meta.url), 'utf8');
const render = runInNewContext(`${app.slice(app.indexOf('function correctionSection('), app.indexOf('function verdictGuide('))}; correctionSection`, {
  escapeHtml: (value) => String(value ?? ''),
  label: (value) => ({ rejected: 'Rejeitado', 'changes-requested': 'Pedir ajuste' })[value] || value,
  tone: (value) => value,
  badge: (_value, _tone, text) => text,
});
const root = mkdtempSync(join(tmpdir(), 'correction-state-'));
const correction = JSON.parse(readFileSync(new URL('../protocol/examples/correction-run-receipt.v1.json', import.meta.url)));
const judgment = JSON.parse(readFileSync(new URL('../protocol/examples/judgment-receipt.v1.json', import.meta.url)));
const baseline = 'routine-receipt-funnel-001';
const result = 'routine-receipt-funnel-002';
function writeJudgment(receiptId, verdict) {
  const directory = join(root, '.cerebro/runtime/judgments', receiptId);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'judgment.json'), JSON.stringify({
    ...judgment, receipt_id: receiptId, routine_receipt_ref: `routine-receipt:${receiptId}`, verdict,
  }));
}
try {
  mkdirSync(join(root, '.cerebro/runtime/corrections'), { recursive: true });
  writeFileSync(join(root, '.cerebro/runtime/corrections/correction.json'), JSON.stringify(correction));
  writeJudgment(baseline, 'changes-requested');
  assert.equal(correctionView(root, baseline).resulting_judgment, null);
  for (const [verdict, expected] of [
    ['approved', 'Resultado aprovado'], ['rejected', 'Rejeitado'], ['changes-requested', 'Pedir ajuste'],
  ]) {
    writeJudgment(result, verdict);
    for (const receiptId of [baseline, result]) {
      const view = correctionView(root, receiptId);
      assert.equal(view.resulting_judgment.verdict, verdict, 'o julgamento é do novo Run, inclusive ao abrir o baseline');
      assert.equal('note' in view.resulting_judgment, false, 'o resumo não expõe a correção privada');
      const markup = render({ correction: view, judgment: { summary: { verdict: 'changes-requested' } } });
      assert(markup.includes(expected), `estado do resultado deve mostrar ${expected}`);
      assert(!markup.includes('Aguardando julgamento'), 'resultado julgado não pode parecer pendente');
    }
  }
  console.log('✓ correção mostra o julgamento do novo Run sem expor a nota, pelo baseline ou candidato');
} finally {
  rmSync(root, { recursive: true, force: true });
}
