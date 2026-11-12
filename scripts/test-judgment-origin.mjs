#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { judgmentOrigin, isImportedJudgment } from './lib/judgment-origin.mjs';
import { buildConsoleReadModel } from './lib/console-read-model.mjs';
import { writeRoutineRunReceipt } from './lib/routine-protocol.mjs';
import { validateJudgmentReceipt } from './lib/judgment-protocol.mjs';

const suffix = 'a'.repeat(24);
for (const receipt of [
  { reason_code: 'journal-history-imported' },
  { receipt_id: `routine-receipt-journal-${suffix}` },
  { run_id: `routine-run-journal-${suffix}` },
  { output_ref: `.cerebro/runtime/outputs/routines/routine-run-journal-${suffix}.pointer.md` },
]) {
  assert.equal(judgmentOrigin(receipt), 'journal-import');
  assert.equal(isImportedJudgment(receipt), true);
}
for (const receipt of [
  { reason_code: 'legacy-history-imported' },
  { receipt_id: `routine-receipt-legacy-${suffix}` },
  { run_id: `routine-run-legacy-${suffix}` },
  { output_ref: `.cerebro/runtime/outputs/routines/routine-run-legacy-${suffix}.legacy.json` },
]) assert.equal(judgmentOrigin(receipt), 'legacy-import');
for (const receipt of [
  null, {}, { receipt_id: 'routine-receipt-journal-fictional' },
  { run_id: 'routine-run-legacy-fictional' },
  { output_ref: 'fictional.pointer.md' }, { output_ref: 'fictional.legacy.json' },
  { output_ref: `routine-run-journal-${suffix}.pointer.md.backup` },
]) {
  assert.equal(judgmentOrigin(receipt), 'native');
  assert.equal(isImportedJudgment(receipt), false);
}

const root = mkdtempSync(join(tmpdir(), 'fictional-judgment-origin-'));
const write = (ref, value) => {
  const path = join(root, ref);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, typeof value === 'string' ? value : JSON.stringify(value));
};
try {
  write('VERSION', 'fictional-fixture\n');
  write('COMECE-AQUI.md', '# Fictional test fixture\n');
  write('.cerebro/layout.json', { version: 3 });
  const base = {
    protocol_version: 1,
    receipt_id: 'routine-receipt-fictional-native-pending',
    run_id: 'routine-run-fictional-native-pending',
    routine_ref: 'routine:fictional-review:1.0.0', routine_id: 'fictional-review',
    routine_version: '1.0.0', system_ref: 'fictional-workshop',
    binding_ref: 'fictional-executor', adapter: 'codex-cli', requested_model: 'fictional-model',
    model_observation: 'requested-not-verified', trigger: 'manual',
    slot_key: 'slot-fictional-native-pending', scheduled_for: null,
    attempts: 1, status: 'completed', reason_code: 'executor-completed',
    started_at: '2026-10-01T12:00:00.000Z', completed_at: '2026-10-01T12:01:00.000Z',
    input_refs: [], output_ref: '.cerebro/runtime/outputs/routines/fictional-native.md',
    access_receipt_refs: [], content_shared_with_provider: false,
    privacy: { content_shared_with_community: false, prompt_recorded: false, output_recorded: false, raw_error_recorded: false },
  };
  const receipts = [base,
    { ...base, receipt_id: 'routine-receipt-fictional-native-decided', run_id: 'routine-run-fictional-native-decided', slot_key: 'slot-fictional-native-decided' },
    { ...base, receipt_id: `routine-receipt-journal-${suffix}`, run_id: `routine-run-journal-${suffix}`, slot_key: 'slot-fictional-journal', reason_code: 'executor-completed' },
    { ...base, receipt_id: `routine-receipt-legacy-${suffix}`, run_id: `routine-run-legacy-${suffix}`, slot_key: 'slot-fictional-legacy' },
  ];
  for (const receipt of receipts) writeRoutineRunReceipt(root, receipt);
  const decided = receipts[1];
  const historicalDecision = {
    protocol_version: 1, judgment_id: 'judgment-fictional-native',
    routine_receipt_ref: `routine-receipt:${decided.receipt_id}`,
    receipt_id: decided.receipt_id, routine_id: decided.routine_id, run_id: decided.run_id,
    verdict: 'approved', action_intent: 'none', note: '', actor_ref: 'fictional-owner',
    decided_at: '2026-10-01T12:02:00.000Z',
    privacy: { content_shared_with_community: false, output_recorded: false, note_private: true, external_action_executed: false },
  };
  assert.deepEqual(validateJudgmentReceipt(historicalDecision), []);
  const decisionRef = `.cerebro/runtime/judgments/${decided.receipt_id}/${historicalDecision.judgment_id}.json`;
  write(decisionRef, historicalDecision);
  const before = readFileSync(join(root, decisionRef), 'utf8');
  const model = buildConsoleReadModel(root);
  assert.equal(model.judgments.length, 4, 'all receipts survive the projection');
  assert.equal(model.counts.judgments, 1, 'only native pending output enters the active count');
  assert.equal(model.counts.imported_judgments, 2);
  assert.deepEqual(model.today.pending_judgments, [base.receipt_id]);
  assert.equal(model.judgments.find((item) => item.receipt_id === decided.receipt_id).judgment.verdict, 'approved',
    'existing native human decision is preserved');
  for (const item of model.judgments.filter((item) => item.imported)) {
    assert.equal(item.judgment.status, 'pending');
    assert.equal(item.judgment.verdict, null, 'historical imports never acquire an invented approval');
    assert.equal(item.judgment.history_count, 0);
  }
  assert.equal(readdirSync(join(root, '.cerebro/runtime/receipts/routines')).length, 4);
  assert.equal(readFileSync(join(root, decisionRef), 'utf8'), before, 'read projection does not rewrite historical decisions');
  console.log('✓ judgment origins preserve imported history and native decisions outside active pending counts');
} finally {
  rmSync(root, { recursive: true, force: true });
}
