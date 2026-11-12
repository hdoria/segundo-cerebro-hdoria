import assert from 'node:assert/strict';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
const api = await import('./lib/operational-inbox.mjs').catch((error) => { if (error.code === 'ERR_MODULE_NOT_FOUND') return {}; throw error; });
assert.equal(typeof api.operationalInbox, 'function', 'operational inbox projection must exist');
const { operationalInbox, markOperationalNoticeRead } = api;
const root = mkdtempSync(join(realpathSync(tmpdir()), 'inbox-unit-'));
const outside = mkdtempSync(join(realpathSync(tmpdir()), 'inbox-outside-'));
const stateRef = '.cerebro/runtime/console-inbox-read.json';
const date = '2026-10-20T12:00:00Z';
const baseModel = () => ({
  systems: [{ system_id: 'sys-delta', operating_area: 'delta' }], native_systems: [],
  routines: [{ routine_id: 'rt-one', system_ref: 'sys-delta', health_reason_code: 'active', receipts: [{ receipt_id: 'failed-one', run_record_ref: 'run-record:failed-run', status: 'failed', completed_at: date }] },
    { routine_id: 'rt-blocked', system_ref: 'sys-delta', health_reason_code: 'executor-binding-missing', receipts: [] }],
  run_records: [{ run_id: 'failed-run', system_ref: 'sys-delta', status: 'completed', completed_at: date, mode: 'live' },
    { run_id: 'simulation', system_ref: 'sys-delta', status: 'failed', completed_at: date, mode: 'simulation' }],
  judgments: [{ receipt_id: 'pending-one', system_ref: 'sys-delta', completed_at: date, judgment: { status: 'pending' } },
    { receipt_id: 'approved-one', system_ref: 'sys-delta', completed_at: date, judgment: { status: 'approved' } }],
  today: { needs_attention: ['rt-blocked'] },
});
const decisions = { available: true, cases: [{ case_id: 'case-one', first_seen: '2026-10-19', title: 'PRIVATE BODY NEVER COPY', state: { status: 'pending' } }, { case_id: 'case-done', state: { status: 'applied' } }] };
const write = (ref, data) => { const path = join(root, ref); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, typeof data === 'string' ? data : JSON.stringify(data)); };
try {
  const model = baseModel();
  const before = JSON.stringify(model);
  let result = operationalInbox(root, { model, decisions });
  assert.equal(result.available, true);
  assert.equal(result.total, 4, 'receipt failure, independent routine blocker, pending judgment and pending decision only');
  assert.equal(result.counts.unread, 4);
  const importedHistory = baseModel();
  importedHistory.judgments.push(
    { receipt_id: 'fictional-import-journal', imported: true, judgment: { status: 'pending' } },
    { receipt_id: 'fictional-import-legacy', origin: 'legacy-import', judgment: { status: 'pending' } },
  );
  assert.equal(operationalInbox(root, { model: importedHistory, decisions }).total, 4,
    'imported historical output does not generate active judgment attention');
  assert.equal(result.notices.find((n) => n.kind === 'decision').occurred_at, '2026-10-19', 'date-only evidence keeps its precision instead of inventing a UTC time');
  assert.equal(existsSync(join(root, '.cerebro')), false, 'GET-style projection must not create preference folders');
  assert.equal(JSON.stringify(model), before, 'canonical objects never mutate');
  assert.equal(JSON.stringify(result).includes('PRIVATE BODY'), false);
  assert.equal(result.notices.some((n) => n.target.ref === 'simulation'), false);
  assert.equal(result.notices.filter((n) => n.evidence_ref === 'routine-receipt:failed-one').length, 1, 'receipt and run record deduplicate');
  const legacyFailedView = baseModel(); legacyFailedView.run_records[0].status = 'failed';
  assert.equal(operationalInbox(root, { model: legacyFailedView, decisions }).total, 4, 'legacy failed-status projections also deduplicate through the receipt reference');
  assert.deepEqual(result.notices.find((n) => n.evidence_ref === 'routine-receipt:failed-one').target, { kind: 'routine', ref: 'rt-one' });
  assert.equal(operationalInbox(root, { model, decisions, area: 'delta' }).total, 3, 'unscoped decision does not imply an area');
  assert.equal(operationalInbox(root, { model, decisions, area: 'other' }).total, 0);
  assert.equal(operationalInbox(root, { model, decisions, limit: 1, offset: 1 }).notices.length, 1);
  const independentBlocker = baseModel();
  independentBlocker.routines[0].health_reason_code = 'executor-missing';
  independentBlocker.today.needs_attention.push('rt-one');
  const blocked = operationalInbox(root, { model: independentBlocker, decisions });
  assert.equal(blocked.total, 5, 'a historical failed receipt cannot hide an independent current executor blocker');
  assert.equal(blocked.notices.some((n) => n.status === 'executor-missing'), true);
  const replayReceipt = baseModel();
  replayReceipt.run_records[0].mode = 'replay';
  assert.equal(operationalInbox(root, { model: replayReceipt, decisions }).total, 3, 'receipt simulation is resolved through the real projected run_record_ref field');
  const notice = result.notices.find((n) => n.kind === 'judgment');
  const input = { model, decisions, id: notice.id, fingerprint: notice.fingerprint, read: true };
  assert.deepEqual(markOperationalNoticeRead(root, input), { id: notice.id, fingerprint: notice.fingerprint, read: true });
  result = operationalInbox(root, { model, decisions });
  assert.equal(result.notices.find((n) => n.id === notice.id).read, true, 'read survives repository recreation');
  assert.equal(result.counts.unread, 3);
  assert.equal(operationalInbox(root, { model, decisions, unread: true }).total, 3);
  const stored = readFileSync(join(root, stateRef), 'utf8');
  assert.equal(/pending-one|sys-delta|private body|routine-receipt/i.test(stored), false, 'preferences contain only opaque hashes and read state');
  if (process.platform !== 'win32') assert.equal(lstatSync(join(root, stateRef)).mode & 0o777, 0o600);
  const changed = baseModel(); changed.judgments[0].completed_at = '2026-10-20T13:00:00Z';
  const changedNotice = operationalInbox(root, { model: changed, decisions }).notices.find((n) => n.id === notice.id);
  assert.equal(changedNotice.read, false, 'new canonical occurrence cannot inherit a read mark');
  assert.notEqual(changedNotice.fingerprint, notice.fingerprint);
  assert.throws(() => markOperationalNoticeRead(root, { ...input, model: changed }), /inbox-notice-stale/);
  assert.throws(() => markOperationalNoticeRead(root, { ...input, id: `notice-${'0'.repeat(32)}` }), /not-found/);
  assert.throws(() => markOperationalNoticeRead(root, { ...input, read: 'true' }), /inbox-request-invalid/);
  markOperationalNoticeRead(root, { ...input, read: false });
  assert.equal(operationalInbox(root, { model, decisions }).counts.unread, 4);
  const paused = baseModel();
  paused.routines = [{ routine_id: 'rt-paused', system_ref: 'sys-delta', version: '1.0.0', health_reason_code: 'routine-paused', state: { status: 'paused', paused_at: '2026-10-19T12:00:00Z' }, receipts: [] }];
  paused.today.needs_attention = ['rt-paused']; paused.run_records = []; paused.judgments = [];
  const pauseNotice = operationalInbox(root, { model: paused }).notices[0];
  markOperationalNoticeRead(root, { model: paused, id: pauseNotice.id, fingerprint: pauseNotice.fingerprint, read: true });
  paused.routines[0].health_reason_code = 'ready-manual-run'; paused.today.needs_attention = [];
  assert.equal(operationalInbox(root, { model: paused }).total, 0);
  paused.routines[0].health_reason_code = 'routine-paused'; paused.today.needs_attention = ['rt-paused'];
  paused.routines[0].state.paused_at = '2026-10-20T12:00:00Z';
  assert.equal(operationalInbox(root, { model: paused, unread: true }).total, 1, 'a newly recorded pause must not inherit the previous pause read mark');
  for (const mode of ['simulation', 'replay', 'test', 'fixture', 'demo', 'dry-run']) {
    const simulated = baseModel(); simulated.routines = []; simulated.judgments = []; simulated.today.needs_attention = []; simulated.run_records = [{ run_id: 'synthetic-run', status: 'failed', mode, system_ref: 'sys-delta' }];
    assert.equal(operationalInbox(root, { model: simulated }).total, 0, mode);
  }
  const privateState = JSON.stringify({ version: 1, marks: [], private: true, owner_context: 'PRIVATE OWNER CONTEXT' });
  write(stateRef, privateState);
  assert.deepEqual(operationalInbox(root, { model }).issues, ['inbox-read-state-unavailable']);
  assert.throws(() => markOperationalNoticeRead(root, input), /inbox-read-state-unavailable/);
  assert.equal(readFileSync(join(root, stateRef), 'utf8'), privateState, 'unknown private state envelope must remain untouched');
  write(stateRef, '{broken');
  assert.deepEqual(operationalInbox(root, { model }).issues, ['inbox-read-state-unavailable']);
  assert.throws(() => markOperationalNoticeRead(root, input), /inbox-read-state-unavailable/);
  assert.equal(readFileSync(join(root, stateRef), 'utf8'), '{broken', 'malformed preference state is not overwritten');
  write(stateRef, 'x'.repeat(1024 * 1024 + 1));
  assert.deepEqual(operationalInbox(root, { model }).issues, ['inbox-read-state-unavailable']);
  rmSync(join(root, '.cerebro'), { recursive: true });
  writeFileSync(join(outside, 'sentinel.json'), '{}');
  mkdirSync(join(root, '.cerebro/runtime'), { recursive: true });
  symlinkSync(join(outside, 'sentinel.json'), join(root, stateRef));
  assert.deepEqual(operationalInbox(root, { model }).issues, ['inbox-read-state-unavailable']);
  assert.throws(() => markOperationalNoticeRead(root, input), /inbox-read-state-unavailable/);
  assert.equal(readFileSync(join(outside, 'sentinel.json'), 'utf8'), '{}');
  rmSync(join(root, '.cerebro'), { recursive: true });
  symlinkSync(outside, join(root, '.cerebro'), 'dir');
  assert.throws(() => markOperationalNoticeRead(root, input), /inbox-read-state-unavailable/);
  assert.equal(existsSync(join(outside, 'runtime')), false);
  assert.throws(() => operationalInbox(root, { model, area: '../private' }), /inbox-filter-invalid/);
  console.log('operational-inbox: ok (canonical projection, simulation/dedup, read preferences, stale changes, privacy/path bounds)');
} finally { rmSync(root, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); }
