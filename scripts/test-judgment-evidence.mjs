#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { readPrivateRoutineOutput, writeJudgmentReceipt, validateJudgmentReceipt, MAX_PRIVATE_OUTPUT_BYTES } from './lib/judgment-protocol.mjs';
import { writeRoutineRunReceipt } from './lib/routine-protocol.mjs';
import { createExecutionTracer } from './lib/execution-trace-runtime.mjs';
import { createConsoleServer } from './console-server.mjs';
const root = mkdtempSync(join(tmpdir(), 'judgment-evidence-'));
const fixture = JSON.parse(readFileSync(new URL('../protocol/examples/routine-run-receipt.v1.json', import.meta.url)));
const sha = (text) => createHash('sha256').update(text).digest('hex');
function write(ref, value) { mkdirSync(dirname(join(root, ref)), { recursive: true }); writeFileSync(join(root, ref), value); }
function receipt(id, reason = 'executor-completed', input = []) {
  const value = { ...fixture, receipt_id: `receipt-${id}`, run_id: `routine-run-${id}`, slot_key: `slot-${id}`,
    reason_code: reason, input_refs: input, output_ref: `.cerebro/runtime/outputs/routines/${id}.md` };
  writeRoutineRunReceipt(root, value); return value;
}
function journal(id, note, body, expected = sha(body)) {
  const value = receipt(id, 'journal-history-imported', [note.includes('../') ? 'journal/outside.md' : note]);
  write(note, body);
  write(value.output_ref, `# Ponteiro de saída · ${note}\n- Nota no vault: ${note}\n- Hash da nota: sha256:${expected}\n`);
  const tracer = createExecutionTracer(root, { runId: value.run_id, systemRef: value.system_ref, routineRef: value.routine_ref });
  tracer.emit({ stepId: 'output', stepType: 'output', state: 'completed', outputRefs: [value.output_ref],
    evidenceRef: note.includes('../') ? 'journal/outside.md' : note,
    extensions: { import_source: note.includes('../') ? 'journal/outside.md' : note, note_hash: `sha256:${expected}` } });
  return value;
}
const judgment = { verdict: 'approved', actorRef: 'role-owner' };
try {
  write('.cerebro/layout.json', JSON.stringify({ version: 3, vault: { daily: 'journal' } }));
  const native = receipt('native');
  write(native.output_ref, 'PRIVATE ACTUAL DELIVERY\n');
  const before = readPrivateRoutineOutput(root, native.receipt_id);
  assert.equal(before.review?.can_judge, true, 'a real delivery exposes an approvable reviewed byte version');
  assert.equal(before.review.content_sha256, sha('PRIVATE ACTUAL DELIVERY\n'));
  assert.equal(before.review.origin, 'native');
  assert.throws(() => writeJudgmentReceipt(root, native.receipt_id, judgment), /judgment-reviewed-hash-required/);
  assert.throws(() => writeJudgmentReceipt(root, native.receipt_id, { ...judgment, reviewedSha256: '0'.repeat(64) }), /judgment-reviewed-version-stale/);
  write(native.output_ref, 'CHANGED AFTER VIEW\n');
  assert.throws(() => writeJudgmentReceipt(root, native.receipt_id, { ...judgment, reviewedSha256: before.review.content_sha256 }), /judgment-reviewed-version-stale/);
  const current = readPrivateRoutineOutput(root, native.receipt_id);
  const saved = writeJudgmentReceipt(root, native.receipt_id, { ...judgment, reviewedSha256: current.review.content_sha256 });
  assert.deepEqual(saved.value.reviewed_version, { source_ref: native.output_ref, sha256: sha('CHANGED AFTER VIEW\n'), scope: 'delivery-quality' });
  assert.deepEqual(validateJudgmentReceipt(saved.value), []);
  assert.equal(JSON.stringify(saved.value).includes('CHANGED AFTER VIEW'), false);

  for (const [id, content] of [['empty', ''], ['whitespace', ' \n\t\r\n']]) {
    const emptyReceipt = receipt(id);
    write(emptyReceipt.output_ref, content);
    const emptyOutput = readPrivateRoutineOutput(root, emptyReceipt.receipt_id);
    assert.equal(emptyOutput.review.can_judge, false, `${id} is not an actual delivery`);
    assert.equal(emptyOutput.review.reason_code, 'output-content-empty');
    assert.throws(() => writeJudgmentReceipt(root, emptyReceipt.receipt_id, { ...judgment, reviewedSha256: sha(content) }), /judgment-evidence-unavailable/);
    assert.equal(existsSync(join(root, '.cerebro/runtime/judgments', emptyReceipt.receipt_id)), false);
  }

  const imported = journal('journal', 'journal/2026-10-20.md', '# SOURCE NOTE CONTENT\n');
  const detail = readPrivateRoutineOutput(root, imported.receipt_id);
  assert.equal(detail.output.content, '# SOURCE NOTE CONTENT\n', 'the note itself is reviewed, never its pointer');
  assert.deepEqual(detail.review, { origin: 'journal-import', source_ref: 'journal/2026-10-20.md', version_state: 'original',
    content_sha256: sha('# SOURCE NOTE CONTENT\n'), expected_sha256: sha('# SOURCE NOTE CONTENT\n'), can_judge: true, reason_code: null, approval_scope: 'delivery-quality' });
  const result = writeJudgmentReceipt(root, imported.receipt_id, { ...judgment, reviewedSha256: detail.review.content_sha256 });
  assert.equal(result.value.reviewed_version.source_ref, 'journal/2026-10-20.md');
  assert.equal(JSON.stringify(result.value).includes('SOURCE NOTE CONTENT'), false);
  write('journal/2026-10-20.md', '# CHANGED NOTE\n');
  const changed = readPrivateRoutineOutput(root, imported.receipt_id);
  assert.equal(changed.output.content, '# CHANGED NOTE\n');
  assert.equal(changed.review.version_state, 'changed');
  assert.equal(changed.review.expected_sha256, detail.review.content_sha256);
  assert.equal(changed.review.can_judge, false);
  assert.throws(() => writeJudgmentReceipt(root, imported.receipt_id, { ...judgment, reviewedSha256: changed.review.content_sha256 }), /judgment-evidence-changed/);

  const unsafe = [
    ['private', 'journal/2026-10-19.md', '---\nvisibility: private\n---\nSECRET PRIVATE NOTE\n', 'journal-source-private'],
    ['private-alias', 'journal/2026-10-12.md', '---\nvisibility: &flag public\n---\nPRIVATE ALIAS\n', 'journal-source-private'],
    ['invalid-utf8', 'journal/2026-10-11.md', Buffer.from([0xc3, 0x28]), 'journal-source-encoding-invalid'],
    ['binary', 'journal/2026-10-18.md', Buffer.from([65, 0, 66]), 'journal-source-binary-blocked'],
    ['oversize', 'journal/2026-10-17.md', 'x'.repeat(MAX_PRIVATE_OUTPUT_BYTES + 1), 'journal-source-too-large'],
    ['traversal', 'journal/../outside.md', 'SECRET OUTSIDE NOTE\n', 'journal-provenance-invalid'],
    ['hidden', 'journal/.hidden/2026-10-16.md', 'SECRET HIDDEN NOTE\n', 'journal-source-ref-invalid'],
  ];
  for (const [id, note, body, reason] of unsafe) {
    const item = journal(id, note, body);
    const out = readPrivateRoutineOutput(root, item.receipt_id);
    assert.equal(out.review.version_state, 'unavailable', id);
    assert.equal(out.review.reason_code, reason, id);
    assert.equal(out.review.can_judge, false, id);
    assert.equal(out.output.content, '', id);
    assert.throws(() => writeJudgmentReceipt(root, item.receipt_id, { ...judgment, reviewedSha256: sha(body) }), /judgment-evidence-unavailable/, id);
  }
  // A refreshed pointer must not replace the original imported expectation.
  const frozen = journal('frozen', 'journal/2026-10-13.md', '# ORIGINAL IMPORT\n');
  const originalHash = sha('# ORIGINAL IMPORT\n');
  const updatedNote = '# NOTE REVISED AFTER IMPORT\n';
  write('journal/2026-10-13.md', updatedNote);
  write(frozen.output_ref, `- Nota no vault: journal/2026-10-13.md\n- Hash da nota: sha256:${sha(updatedNote)}\n`);
  const frozenBefore = readFileSync(join(root, frozen.output_ref));
  const stillChanged = readPrivateRoutineOutput(root, frozen.receipt_id);
  assert.equal(stillChanged.review.expected_sha256, originalHash);
  assert.equal(stillChanged.review.version_state, 'changed');
  assert.deepEqual(readFileSync(join(root, frozen.output_ref)), frozenBefore, 'reading never refreshes provenance');

  // Removing the immutable import trace cannot promote a refreshed pointer.
  rmSync(join(root, '.cerebro/runtime/traces', `${frozen.run_id}.jsonl`));
  const missingProvenance = readPrivateRoutineOutput(root, frozen.receipt_id);
  assert.equal(missingProvenance.review.can_judge, false);
  assert.equal(missingProvenance.review.version_state, 'unavailable');
  assert.equal(missingProvenance.review.reason_code, 'journal-provenance-unavailable');
  assert.equal(missingProvenance.review.expected_sha256, null);
  assert.throws(() => writeJudgmentReceipt(root, frozen.receipt_id, { ...judgment, reviewedSha256: sha(updatedNote) }), /judgment-evidence-unavailable/);
  assert.equal(existsSync(join(root, '.cerebro/runtime/judgments', frozen.receipt_id)), false);

  const missing = journal('missing', 'journal/2026-10-15.md', 'missing');
  rmSync(join(root, 'journal/2026-10-15.md'));
  assert.equal(readPrivateRoutineOutput(root, missing.receipt_id).review.reason_code, 'journal-source-not-found');
  const linked = journal('linked', 'journal/2026-10-14.md', 'linked');
  rmSync(join(root, 'journal/2026-10-14.md'));
  symlinkSync(join(root, 'journal/2026-10-20.md'), join(root, 'journal/2026-10-14.md'));
  assert.equal(readPrivateRoutineOutput(root, linked.receipt_id).review.reason_code, 'journal-source-symlink-blocked');
  // Swap a checked parent between path authorization and open. O_NOFOLLOW on
  // the final file alone does not prevent this directory race.
  const external = mkdtempSync(join(tmpdir(), 'judgment-evidence-external-'));
  const sourcePath = join(root, 'journal/2026-10-20.md');
  const realOpen = fs.openSync;
  let swapped = false;
  writeFileSync(join(external, '2026-10-20.md'), 'OUTSIDE_PRIVATE_MARKER');
  try {
    fs.openSync = (path, ...args) => {
      if (path === sourcePath && !swapped) {
        fs.renameSync(join(root, 'journal'), join(root, 'journal-original'));
        symlinkSync(external, join(root, 'journal'), 'dir');
        swapped = true;
      }
      return realOpen(path, ...args);
    };
    syncBuiltinESMExports();
    const race = readPrivateRoutineOutput(root, imported.receipt_id);
    assert.equal(swapped, true);
    assert.equal(race.output.content.includes('OUTSIDE_PRIVATE_MARKER'), false, 'a swapped parent must never expose external bytes');
    assert.equal(race.review.can_judge, false);
    assert.equal(race.review.version_state, 'unavailable');
    assert.equal(race.review.reason_code, 'journal-source-identity-changed');
  } finally {
    fs.openSync = realOpen;
    syncBuiltinESMExports();
    if (swapped) { rmSync(join(root, 'journal')); fs.renameSync(join(root, 'journal-original'), join(root, 'journal')); }
    rmSync(external, { recursive: true, force: true });
  }

  const legacy = receipt('legacy', 'legacy-history-imported');
  write(legacy.output_ref, JSON.stringify({ output_ref: 'original/session.json', marker: 'POINTER ONLY' }));
  const old = readPrivateRoutineOutput(root, legacy.receipt_id);
  assert.equal(old.review.origin, 'legacy-import');
  assert.equal(old.review.can_judge, false);
  assert.equal(old.output.content, '');
  assert.throws(() => writeJudgmentReceipt(root, legacy.receipt_id, { ...judgment, reviewedSha256: sha('wrapper') }), /judgment-evidence-unavailable/);
  assert.equal(existsSync(join(root, '.cerebro/runtime/judgments', legacy.receipt_id)), false);
  // Exercise the authenticated API boundary with the same unavailable sources.
  write('VERSION', 'fixture\n');
  write('COMECE-AQUI.md', '# Fixture\n');
  const { server } = createConsoleServer({ root, sessionToken: 'evidence-session', csrfToken: 'evidence-csrf' });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const api = `http://127.0.0.1:${server.address().port}`;
  const headers = { Cookie: 'cerebro_console_session=evidence-session', 'X-Cerebro-CSRF': 'evidence-csrf', 'Content-Type': 'application/json' };
  try {
    for (const [id, hash, reason] of [
      ['receipt-empty', sha(''), 'output-content-empty'],
      ['receipt-whitespace', sha(' \n\t\r\n'), 'output-content-empty'],
      [frozen.receipt_id, sha(updatedNote), 'journal-provenance-unavailable'],
    ]) {
      const read = await fetch(`${api}/api/runs/${id}/output`, { headers });
      assert.equal(read.status, 200);
      const detail = await read.json();
      assert.equal(detail.review.can_judge, false);
      assert.equal(detail.review.reason_code, reason);
      const post = await fetch(`${api}/api/runs/${id}/judgments`, { method: 'POST', headers,
        body: JSON.stringify({ confirm: true, approved_by: 'role-owner', verdict: 'approved', action_intent: 'none', note: '', reviewed_sha256: hash }) });
      assert.equal(post.status, 400);
      assert.equal((await post.json()).reason_code, 'judgment-evidence-unavailable');
      assert.equal(existsSync(join(root, '.cerebro/runtime/judgments', id)), false);
    }
  } finally { await new Promise((resolve) => server.close(resolve)); }

  console.log('✓ Approval evidence binds actual delivery bytes; changed, private and unsafe journal sources cannot be judged');
} finally { rmSync(root, { recursive: true, force: true }); }
