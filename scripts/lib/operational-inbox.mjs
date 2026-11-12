// Derived attention queue. Canonical execution and decision state stays in its
// existing contracts/receipts; this file stores only explicit read preferences.
import { createHash, randomUUID } from 'node:crypto';
import { closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync, readSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { layout } from './system-protocol.mjs';
import { validateExecutionTraceEvent } from './execution-trace-runtime.mjs';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const NOTICE = /^notice-[a-f0-9]{32}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const MAX_BYTES = 1024 * 1024;
const MAX_MARKS = 4000;
const MAX_NOTICES = 5000;
const MAX_INPUTS = 10_000;
const SIMULATIONS = new Set(['simulation', 'replay', 'test', 'fixture', 'demo', 'dry-run']);
const MODE_UNAVAILABLE = Symbol('mode-unavailable');
const excludedMode = (mode) => mode === MODE_UNAVAILABLE || SIMULATIONS.has(mode);
const FAILURE = new Set(['failed', 'blocked', 'denied']);
const READY = new Set(['active', 'ready-manual-run', 'ready-to-activate']);
const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const token = (value) => typeof value === 'string' && ID.test(value) ? value : null;
const array = (value) => Array.isArray(value) ? value.slice(0, MAX_INPUTS) : [];
const exactKeys = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const date = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value) || !Number.isFinite(Date.parse(value))) return null;
  const iso = new Date(value).toISOString();
  return value.length === 10 ? (iso.slice(0, 10) === value ? value : null) : iso;
};
const failState = () => { throw new Error('inbox-read-state-unavailable'); };
const simulation = (value) => value?.is_simulation === true || SIMULATIONS.has(value?.mode) || SIMULATIONS.has(value?.execution_mode);

// The standard trace reader initializes storage. Notices need a bounded read-only
// projection, including denied replays that never reached the RunRecord ledger.
function traceMode(root, runId, budget, issues) {
  let fd, present = false;
  try {
    if (!token(runId)) return null;
    const runtime = resolve(root, '.cerebro', 'runtime');
    const configured = layout(root).executionTraces;
    if (configured != null && (typeof configured !== 'string' || configured.length > 1024)) throw Error('invalid-trace-path');
    const directory = resolve(root, configured || '.cerebro/runtime/traces');
    if (!directory.startsWith(`${runtime}${sep}`)) throw Error('invalid-trace-path');
    const path = join(directory, `${runId}.jsonl`);
    const before = lstatSync(path);
    present = true;
    checkAncestors(path);
    if (!before.isFile() || before.size > 512 * 1024 || budget.files >= 200 || budget.bytes + before.size > 4 * MAX_BYTES) throw Error('trace-limit');
    budget.files++;
    fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    const opened = fstatSync(fd);
    if (opened.dev !== before.dev || opened.ino !== before.ino || opened.size !== before.size) throw Error('changed-trace');
    const bytes = Buffer.alloc(opened.size + 1);
    let count = 0;
    while (count < bytes.length) { const read = readSync(fd, bytes, count, bytes.length - count, null); if (!read) break; count += read; }
    budget.bytes += count;
    checkAncestors(path);
    const after = lstatSync(path);
    if (count !== opened.size || after.dev !== opened.dev || after.ino !== opened.ino || after.size !== opened.size || after.mtimeMs !== opened.mtimeMs) throw Error('changed-trace');
    const lines = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, count)).split(/\r?\n/).filter(Boolean);
    if (!lines.length || lines.length > 2000) throw Error('trace-limit');
    let mode, trace;
    for (const [index, line] of lines.entries()) {
      const event = JSON.parse(line);
      if (validateExecutionTraceEvent(event).length || event.run_id !== runId || event.sequence !== index + 1 || (trace !== undefined && trace !== event.trace_id) || (index > 0 && mode !== event.mode)) throw Error('invalid-trace');
      mode = event.mode; trace = event.trace_id;
    }
    return mode ?? null;
  } catch (error) {
    if (error.code === 'ENOENT' && !present) return null;
    issues.add('inbox-trace-unavailable');
    return MODE_UNAVAILABLE;
  } finally { if (fd !== undefined) closeSync(fd); }
}

function derive(root, model, decisions) {
  const systems = new Map([...array(model?.systems), ...array(model?.native_systems)].flatMap((item) => [[item.system_id, item], [item.contract_id, item]]));
  const records = new Map(array(model?.run_records).filter((record) => token(record.run_id)).map((record) => [record.run_id, record]));
  const issues = new Set(), budget = { files: 0, bytes: 0 }, modes = new Map();
  const modeOf = (runId) => {
    if (!token(runId)) return null;
    if (!modes.has(runId)) modes.set(runId, records.get(runId)?.mode || traceMode(root, runId, budget, issues));
    return modes.get(runId);
  };
  const result = new Map(), receiptRuns = new Set();
  const add = ({ kind, status, target, evidence, system, occurred, title, severity, revision = null }) => {
    if (!token(status) || !token(target.ref) || !token(evidence)) return;
    const identity = [kind, evidence];
    const id = `notice-${digest(identity).slice(0, 32)}`;
    const system_ref = token(system), area_ref = token(systems.get(system_ref)?.operating_area);
    const occurred_at = date(occurred);
    const fingerprint = digest([identity, status, target, occurred_at, system_ref, area_ref, revision]);
    if (result.size < MAX_NOTICES || result.has(id)) result.set(id, { id, fingerprint, kind, severity, title, status, occurred_at, system_ref, area_ref, evidence_ref: evidence, target });
  };
  for (const routine of array(model?.routines)) {
    if (!token(routine.routine_id) || simulation(routine)) continue;
    for (const receipt of array(routine.receipts)) {
      if (!FAILURE.has(receipt.status)) continue;
      const runId = typeof receipt.run_record_ref === 'string' && receipt.run_record_ref.startsWith('run-record:')
        ? token(receipt.run_record_ref.slice('run-record:'.length)) : token(receipt.run_id);
      if (runId) receiptRuns.add(runId);
      if (simulation(receipt) || excludedMode(modeOf(runId))) continue;
      if (!token(receipt.receipt_id)) continue;
      add({ kind: 'run', status: receipt.status, target: { kind: 'routine', ref: routine.routine_id }, evidence: `routine-receipt:${receipt.receipt_id}`, system: routine.system_ref, occurred: receipt.completed_at || receipt.started_at, title: receipt.status === 'failed' ? 'Execução falhou' : receipt.status === 'denied' ? 'Execução com acesso negado' : 'Execução bloqueada', severity: 'error' });
    }
    const health = token(routine.health_reason_code);
    const observed = array(model?.today?.needs_attention).includes(routine.routine_id);
    if (observed && health && !READY.has(health)) {
      add({ kind: 'routine', status: health, target: { kind: 'routine', ref: routine.routine_id }, evidence: `routine:${routine.routine_id}`, system: routine.system_ref, occurred: health === 'routine-paused' ? routine.state?.paused_at : null, title: 'Rotina precisa de atenção', severity: 'warning' });
    }
  }
  for (const record of records.values()) {
    if (!FAILURE.has(record.status) || simulation(record) || excludedMode(modeOf(record.run_id)) || receiptRuns.has(record.run_id)) continue;
    add({ kind: 'run', status: record.status, target: { kind: 'run-record', ref: record.run_id }, evidence: `run-record:${record.run_id}`, system: record.system_ref, occurred: record.completed_at || record.started_at, title: record.status === 'failed' ? 'Execução falhou' : 'Execução bloqueada ou negada', severity: 'error' });
  }
  for (const judgment of array(model?.judgments)) {
    if (judgment.imported || ['journal-import', 'legacy-import'].includes(judgment.origin)
      || judgment.judgment?.status !== 'pending' || !token(judgment.receipt_id) || simulation(judgment) || excludedMode(modeOf(judgment.run_id))) continue;
    add({ kind: 'judgment', status: 'pending', target: { kind: 'receipt', ref: judgment.receipt_id }, evidence: `routine-receipt:${judgment.receipt_id}`, system: judgment.system_ref, occurred: judgment.completed_at, title: 'Entrega aguarda julgamento', severity: 'warning' });
  }
  for (const item of array(decisions?.cases)) {
    if (item.state?.status !== 'pending' || !token(item.case_id) || simulation(item)) continue;
    add({ kind: 'decision', status: 'pending', target: { kind: 'decision-case', ref: item.case_id }, evidence: `decision-case:${item.case_id}`, system: item.system_ref, occurred: item.first_seen, revision: date(item.last_seen), title: 'Decisão aguarda análise', severity: 'warning' });
  }
  const notices = [...result.values()].sort((a, b) => (a.severity === 'error' ? 0 : 1) - (b.severity === 'error' ? 0 : 1) || (b.occurred_at || '').localeCompare(a.occurred_at || '') || a.id.localeCompare(b.id));
  return { notices, issues: [...issues] };
}

function checkAncestors(path) {
  let cursor = resolve(path);
  while (true) {
    if (lstatSync(cursor).isSymbolicLink()) failState();
    const parent = dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  if (realpathSync(path) !== resolve(path)) failState();
}

function statePath(root, create = false) {
  const base = resolve(root);
  checkAncestors(base);
  let directory = base;
  for (const part of ['.cerebro', 'runtime']) {
    directory = join(directory, part);
    try {
      const stat = lstatSync(directory);
      if (!stat.isDirectory() || stat.isSymbolicLink()) failState();
    } catch (error) {
      if (error.code !== 'ENOENT' || !create) throw error;
      mkdirSync(directory, { mode: 0o700 });
    }
    checkAncestors(directory);
  }
  return join(directory, 'console-inbox-read.json');
}

function readMarks(root) {
  let fd;
  try {
    const path = statePath(root), before = lstatSync(path);
    if (!before.isFile() || before.isSymbolicLink() || before.size > MAX_BYTES) failState();
    fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    const stat = fstatSync(fd);
    if (stat.dev !== before.dev || stat.ino !== before.ino || stat.size > MAX_BYTES) failState();
    const bytes = Buffer.alloc(stat.size + 1);
    let count = 0;
    while (count < bytes.length) { const read = readSync(fd, bytes, count, bytes.length - count, null); if (!read) break; count += read; }
    const after = lstatSync(statePath(root));
    if (count !== stat.size || after.isSymbolicLink() || after.dev !== stat.dev || after.ino !== stat.ino || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs) failState();
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, count)));
    if (!exactKeys(value, ['version', 'marks']) || value.version !== 1 || !Array.isArray(value.marks) || value.marks.length > MAX_MARKS) failState();
    const marks = new Map();
    for (const mark of value.marks) {
      if (!exactKeys(mark, ['id', 'fingerprint', 'read', 'changed_at']) || !NOTICE.test(mark.id) || !DIGEST.test(mark.fingerprint) || mark.read !== true || !date(mark.changed_at) || marks.has(mark.id)) failState();
      marks.set(mark.id, { id: mark.id, fingerprint: mark.fingerprint, read: true, changed_at: date(mark.changed_at) });
    }
    return { marks, issue: null };
  } catch (error) {
    return { marks: new Map(), issue: error.code === 'ENOENT' ? null : 'inbox-read-state-unavailable' };
  } finally { if (fd !== undefined) closeSync(fd); }
}

function writeMarks(root, marks) {
  let temporary;
  try {
    const path = statePath(root, true);
    try { const stat = lstatSync(path); if (!stat.isFile() || stat.isSymbolicLink()) failState(); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const values = [...marks.values()].sort((a, b) => b.changed_at.localeCompare(a.changed_at)).slice(0, MAX_MARKS);
    const content = JSON.stringify({ version: 1, marks: values });
    if (Buffer.byteLength(content) > MAX_BYTES) failState();
    temporary = join(dirname(path), `.inbox-${randomUUID()}.tmp`);
    writeFileSync(temporary, content, { mode: 0o600, flag: 'wx' });
    if (statePath(root) !== path) failState();
    try { if (lstatSync(path).isSymbolicLink()) failState(); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    renameSync(temporary, path);
    temporary = null;
  } catch { failState(); }
  finally { if (temporary) { try { unlinkSync(temporary); } catch {} } }
}

export function operationalInbox(root, { model, decisions, area = '', unread = false, offset = 0, limit = 50 } = {}) {
  if (typeof area !== 'string' || (area && !token(area)) || typeof unread !== 'boolean' || !Number.isInteger(offset) || offset < 0 || offset > 1_000_000 || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('inbox-filter-invalid');
  const { marks, issue } = readMarks(root);
  const derived = derive(root, model, decisions);
  const notices = derived.notices.filter((notice) => !area || notice.area_ref === area).map((notice) => ({ ...notice, read: marks.get(notice.id)?.fingerprint === notice.fingerprint }));
  const counts = { total: notices.length, unread: notices.filter((notice) => !notice.read).length };
  const visible = unread ? notices.filter((notice) => !notice.read) : notices;
  const issues = [...derived.issues, ...(issue ? [issue] : []), ...(decisions?.unavailable ? ['inbox-decisions-unavailable'] : [])];
  return { available: Boolean(model), notices: visible.slice(offset, offset + limit), counts, total: visible.length, offset, limit, issues };
}

export function markOperationalNoticeRead(root, { model, decisions, id, fingerprint, read } = {}) {
  if (!NOTICE.test(id) || !DIGEST.test(fingerprint) || typeof read !== 'boolean') throw new Error('inbox-request-invalid');
  const notice = derive(root, model, decisions).notices.find((item) => item.id === id);
  if (!notice) throw new Error('not-found');
  if (notice.fingerprint !== fingerprint) throw new Error('inbox-notice-stale');
  const { marks, issue } = readMarks(root);
  if (issue) failState();
  if (read) marks.set(id, { id, fingerprint, read: true, changed_at: new Date().toISOString() });
  else marks.delete(id);
  writeMarks(root, marks);
  return { id, fingerprint, read };
}
