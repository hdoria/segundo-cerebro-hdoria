// Explicit, version-bound publication of an approved private draft. This module
// never invokes an executor. Snapshots stay under the local private runtime.
import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync, constants, existsSync, fstatSync, fsyncSync, lstatSync, mkdirSync,
  openSync, readSync, readdirSync, renameSync, rmdirSync, unlinkSync, writeSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { layout, REF_ID_RE } from './system-protocol.mjs';
import { loadRoutineContract, readRoutineRunReceipt } from './routine-protocol.mjs';
import { readPrivateRoutineOutput } from './judgment-protocol.mjs';
import { publicMarkdownParts } from './note-visibility.mjs';

export const DELIVERY_APPLICATION_PREVIEW_TTL_MS = 15 * 60 * 1000;
export const MAX_DELIVERY_APPLICATION_BYTES = 512 * 1024;
export const DELIVERY_APPLICATION_ROLLBACK_REASONS = Object.freeze(['user-requested', 'incorrect-content', 'wrong-date', 'mistake']);
const HASH = /^[a-f0-9]{64}$/;
const APPLICATION_ID = /^application-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const START = '<!-- ai:start -->';
const END = '<!-- ai:end -->';
const secret = /Bearer\s+|-----BEGIN .*PRIVATE KEY-----|\b(?:sk|ghp|xoxb)[-_A-Za-z0-9]{12,}/i;
const sha = value => createHash('sha256').update(value).digest('hex');
const fail = code => { throw new Error(`delivery-application-${code}`); };
const validHash = value => typeof value === 'string' && HASH.test(value);
const hashOrNull = value => value === null || validHash(value);
const validId = value => typeof value === 'string' && REF_ID_RE.test(value);
const validIso = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const same = (a, b) => a.dev === b.dev && a.ino === b.ino && a.mode === b.mode;
const inside = (root, path) => { const rel = relative(root, path); return !!rel && !rel.startsWith('..') && !isAbsolute(rel); };
function nowIso(clock = () => new Date()) {
  const value = new Date(typeof clock === 'function' ? clock() : clock);
  if (!Number.isFinite(value.getTime())) fail('clock-invalid');
  return value.toISOString();
}
function id(value) { if (typeof value !== 'string' || !REF_ID_RE.test(value)) fail('id-invalid'); return value; }
function actor(value) { if (typeof value !== 'string' || !REF_ID_RE.test(value)) fail('actor-invalid'); return value; }
function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)
    || !Number.isFinite(Date.parse(`${value}T00:00:00Z`)) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) fail('date-invalid');
  return value;
}
function safeRef(value) {
  if (typeof value !== 'string' || isAbsolute(value) || value.includes('\\') || value.length > 240
    || value.split('/').some(part => !part || part.startsWith('.') || /^(private|privado)$/i.test(part)
      || !/^[A-Za-z0-9][A-Za-z0-9_. -]*$/.test(part))) fail('target-invalid');
  return value;
}
function targetFor(root, targetDate) {
  const daily = safeRef(layout(root).vault?.daily || 'journal');
  const ref = `${daily}/${date(targetDate)}.md`;
  return { target_ref: ref, path: resolve(root, ref) };
}
// Snapshot every existing component and reject symlinks/hardlinked files. A
// second check binds an opened fd and its parents to the authorized identities.
function chain(root, path) {
  const base = resolve(root);
  if (base !== path && !inside(base, path)) fail('path-invalid');
  const paths = [base]; let current = base;
  for (const part of relative(base, path).split(sep).filter(Boolean)) { current = join(current, part); paths.push(current); }
  const identities = [];
  for (let i = 0; i < paths.length; i++) {
    let stat;
    try { stat = lstatSync(paths[i]); } catch (error) { if (error.code === 'ENOENT') return { paths, identities }; throw error; }
    if (stat.isSymbolicLink()) fail('symlink-blocked');
    if (i < paths.length - 1 && !stat.isDirectory()) fail('path-invalid');
    if (stat.isFile() && stat.nlink !== 1) fail('hardlink-blocked');
    identities.push({ dev: stat.dev, ino: stat.ino, mode: stat.mode });
  }
  return { paths, identities };
}
function assertChain(root, path, previous, fdStat = null) {
  const actual = chain(root, path);
  if (actual.identities.length !== previous.identities.length
    || actual.identities.some((entry, i) => !same(entry, previous.identities[i]))
    || (fdStat && !same(fdStat, previous.identities.at(-1)))) fail('identity-changed');
}
function readBounded(root, path, { optional = false, max = MAX_DELIVERY_APPLICATION_BYTES } = {}) {
  let fd;
  try {
    const authorized = chain(root, path);
    if (authorized.identities.length < authorized.paths.length) {
      if (optional) return { text: '', hash: null, mode: 0o600, identity: authorized };
      fail('file-missing');
    }
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const stat = fstatSync(fd); assertChain(root, path, authorized, stat);
    if (!stat.isFile() || stat.nlink !== 1) fail('file-invalid');
    if (stat.size > max) fail('file-too-large');
    const bytes = Buffer.alloc(max + 1); let used = 0;
    while (used < bytes.length) { const size = readSync(fd, bytes, used, bytes.length - used, null); if (!size) break; used += size; }
    assertChain(root, path, authorized, fstatSync(fd));
    if (used > max) fail('file-too-large');
    const buffer = bytes.subarray(0, used);
    if (buffer.includes(0)) fail('file-binary');
    let text;
    // Preserve BOM and CRLF bytes exactly for manual content and snapshots.
    try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buffer); } catch { fail('file-encoding-invalid'); }
    return { text, hash: sha(buffer), mode: stat.mode & 0o777, identity: authorized };
  } catch (error) {
    if (error.code === 'ELOOP') fail('symlink-blocked');
    if (error.code === 'ENOENT') fail('identity-changed');
    throw error;
  } finally { if (fd !== undefined) closeSync(fd); }
}
function contentAllowed(text) {
  try { publicMarkdownParts(text); } catch { fail('content-private'); }
  if (secret.test(text)) fail('content-secret');
}
function privateBase(root) { return resolve(root, '.cerebro/runtime/delivery-applications'); }
function secureDirectory(root, path) {
  const before = chain(root, path);
  for (let i = before.identities.length; i < before.paths.length; i++) {
    const parent = dirname(before.paths[i]); const authorized = chain(root, parent);
    try { mkdirSync(before.paths[i], { mode: 0o700 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    assertChain(root, parent, authorized);
    const stat = lstatSync(before.paths[i]);
    if (stat.isSymbolicLink() || !stat.isDirectory()) fail('symlink-blocked');
  }
  const stat = lstatSync(path);
  if (!stat.isDirectory()) fail('path-invalid');
}
function writeExclusive(root, path, text, mode = 0o600) {
  const parent = dirname(path); const authorized = chain(root, parent); let fd;
  try {
    fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, mode);
    assertChain(root, parent, authorized);
    const bytes = Buffer.from(text); let used = 0;
    while (used < bytes.length) used += writeSync(fd, bytes, used, bytes.length - used);
    fsyncSync(fd); assertChain(root, parent, authorized);
  } finally { if (fd !== undefined) closeSync(fd); }
}
function atomic(root, path, text, mode = 0o600, beforeCommit = () => {}) {
  const temporary = join(dirname(path), `.delivery-${randomUUID()}.tmp`);
  try {
    writeExclusive(root, temporary, text, mode);
    const authorized = chain(root, dirname(path));
    beforeCommit(); assertChain(root, dirname(path), authorized);
    renameSync(temporary, path);
  } finally { try { unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
}
function metadataKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length && Object.keys(value).every(key => keys.includes(key));
}
const recordKeys = ['protocol_version', 'application_id', 'receipt_id', 'sequence', 'status', 'target_date', 'target_ref',
  'source_ref', 'source_sha256', 'judgment_id', 'approved_by', 'previewed_at', 'plan_digest', 'created_at',
  'before_sha256', 'after_sha256', 'before_mode', 'events'];
function validateRecord(root, value, receiptId) {
  if (!metadataKeys(value, recordKeys) || value.protocol_version !== 1 || value.receipt_id !== receiptId
    || !APPLICATION_ID.test(value.application_id || '')
    || !Number.isSafeInteger(value.sequence) || value.sequence < 1
    || !['prepared', 'applied', 'rollback-prepared', 'rolled-back'].includes(value.status)
    || !validId(value.approved_by) || !validId(value.judgment_id)
    || !validHash(value.source_sha256) || !validHash(value.plan_digest)
    || !validHash(value.after_sha256) || !hashOrNull(value.before_sha256)
    || !Number.isInteger(value.before_mode) || value.before_mode < 0 || value.before_mode > 0o777
    || typeof value.source_ref !== 'string' || value.source_ref.length > 256 || !/^\.cerebro\/runtime\/(?:[A-Za-z0-9][A-Za-z0-9_.-]*\/)*[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(value.source_ref)
    || !Array.isArray(value.events) || value.events.length > 2
    || !validIso(value.created_at) || !validIso(value.previewed_at)) fail('state-invalid');
  if (value.target_ref !== targetFor(root, value.target_date).target_ref) fail('state-invalid');
  for (const event of value.events) {
    if (!metadataKeys(event, ['kind', 'at', 'approved_by', 'reason']) || !['applied', 'rolled-back'].includes(event.kind)
      || !validId(event.approved_by) || !validIso(event.at)
      || (event.kind === 'applied' ? event.reason !== null : !DELIVERY_APPLICATION_ROLLBACK_REASONS.includes(event.reason))) fail('state-invalid');
  }
  if ((value.status === 'prepared' && value.events.length)
    || (value.status === 'applied' && (value.events.length !== 1 || value.events[0].kind !== 'applied'))
    || (['rollback-prepared', 'rolled-back'].includes(value.status) && (value.events.length !== 2 || value.events[0].kind !== 'applied' || value.events[1].kind !== 'rolled-back'))) fail('state-invalid');
  return value;
}
function records(root, receiptId) {
  id(receiptId);
  const directory = join(privateBase(root), receiptId); const authorized = chain(root, directory);
  if (authorized.identities.length < authorized.paths.length) return [];
  const names = readdirSync(directory); assertChain(root, directory, authorized);
  if (names.length > 1000) fail('state-invalid');
  const values = names.map(name => {
    if (!APPLICATION_ID.test(name)) fail('state-invalid');
    let raw;
    try { raw = JSON.parse(readBounded(root, join(directory, name, 'record.json'), { max: 32768 }).text); } catch { fail('state-invalid'); }
    const record = validateRecord(root, raw, receiptId);
    if (record.application_id !== name) fail('state-invalid');
    return record;
  }).sort((a, b) => a.sequence - b.sequence);
  if (values.some((value, i) => i > 0 && value.sequence <= values[i - 1].sequence)) fail('state-invalid');
  return values;
}
function stateView(record) {
  if (!record) return { status: 'not-applied' };
  const recoveryRequired = ['prepared', 'rollback-prepared'].includes(record.status);
  return { status: record.status === 'prepared' ? 'not-applied' : record.status === 'rollback-prepared' ? 'applied' : record.status, recovery_required: recoveryRequired, application_id: record.application_id, target_ref: record.target_ref,
    target_date: record.target_date, applied_at: record.events[0]?.at || null, rolled_back_at: record.events[1]?.at || null,
    before_sha256: record.before_sha256, after_sha256: record.after_sha256, approved_by: record.approved_by };
}
function evidence(root, receiptId) {
  id(receiptId);
  const receipt = readRoutineRunReceipt(root, `routine-receipt:${receiptId}`);
  const { contract } = loadRoutineContract(root, receipt.routine_id);
  if (receipt.status !== 'completed') fail('delivery-unavailable');
  if (contract.version !== receipt.routine_version || contract.permission_mode !== 'read-only'
    || contract.destination.kind !== 'runtime-output') fail('contract-ineligible');
  const output = readPrivateRoutineOutput(root, receiptId);
  if (output.review.origin !== 'native' || !output.review.can_judge) fail('delivery-ineligible');
  const judgment = output.judgment.current;
  if (!judgment || judgment.verdict !== 'approved' || judgment.action_intent !== 'none') fail('approval-required');
  if (!judgment.reviewed_version || judgment.reviewed_version.scope !== 'delivery-quality'
    || judgment.reviewed_version.sha256 !== output.review.content_sha256
    || judgment.reviewed_version.source_ref !== output.review.source_ref) fail('approval-stale');
  contentAllowed(output.output.content);
  if (output.output.content.includes(START) || output.output.content.includes(END)) fail('markers-invalid');
  // Timestamp is the executed slot, not the date of this later application.
  const timezone = contract.trigger?.schedule?.timezone || 'UTC';
  const timestamp = receipt.scheduled_for || receipt.started_at;
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(timestamp));
  const part = type => parts.find(value => value.type === type).value;
  return { receipt, contract, output, judgment, suggested_date: `${part('year')}-${part('month')}-${part('day')}` };
}
export function deliveryApplicationState(root, receiptId, { clock } = {}) {
  void clock;
  let state;
  try {
    state = stateView(records(root, receiptId).at(-1));
    if (state.recovery_required) return { eligible: false, reason_code: 'delivery-application-recovery-required', suggested_date: null, state };
    const value = evidence(root, receiptId);
    return { eligible: state.status !== 'applied', reason_code: state.status === 'applied' ? 'delivery-application-already-applied' : null, suggested_date: value.suggested_date, state };
  } catch (error) {
    return { eligible: false, reason_code: /^delivery-application-[a-z-]+$/.test(error.message) ? error.message : 'delivery-application-unavailable', suggested_date: null, state: state || { status: 'not-applied' } };
  }
}
function replacement(before, draft) {
  const starts = before.split(START).length - 1; const ends = before.split(END).length - 1;
  if (starts !== ends || starts > 1 || (starts === 1 && before.indexOf(START) > before.indexOf(END))) fail('markers-invalid');
  const newline = before.includes('\r\n') ? '\r\n' : '\n';
  const block = `${START}${newline}${draft}${draft.endsWith('\n') ? '' : newline}${END}`;
  if (starts) return before.slice(0, before.indexOf(START)) + block + before.slice(before.indexOf(END) + END.length);
  return before + (before ? (before.endsWith('\n') ? newline : newline + newline) : '') + block + newline;
}
function unified(before, after, ref) {
  const left = before.split('\n'); const right = after.split('\n');
  if (left.length + right.length > 16000 || [...left, ...right].some(line => line.length > 32768)) fail('diff-too-large');
  let start = 0; while (start < left.length && start < right.length && left[start] === right[start]) start++;
  let end = 0; while (end < left.length - start && end < right.length - start && left[left.length - end - 1] === right[right.length - end - 1]) end++;
  const from = Math.max(0, start - 3); const leftEnd = Math.min(left.length, left.length - end + 3); const rightEnd = Math.min(right.length, right.length - end + 3);
  return [`--- a/${ref}`, `+++ b/${ref}`, `@@ -${from + 1},${leftEnd - from} +${from + 1},${rightEnd - from} @@`,
    ...left.slice(from, start).map(line => ` ${line}`), ...left.slice(start, left.length - end).map(line => `-${line}`),
    ...right.slice(start, right.length - end).map(line => `+${line}`), ...right.slice(right.length - end, rightEnd).map(line => ` ${line}`)].join('\n');
}
function buildPlan(root, receiptId, { target_date, approved_by, previewed_at }) {
  actor(approved_by);
  const value = evidence(root, receiptId);
  const target = targetFor(root, target_date);
  const before = readBounded(root, target.path, { optional: true }); contentAllowed(before.text);
  const after = replacement(before.text, value.output.output.content);
  if (Buffer.byteLength(after) > MAX_DELIVERY_APPLICATION_BYTES) fail('file-too-large');
  const afterHash = sha(after);
  const binding = { protocol_version: 1, receipt_id: receiptId, judgment_id: value.judgment.judgment_id,
    source_ref: value.output.review.source_ref, source_sha256: value.output.review.content_sha256,
    target_date, target_ref: target.target_ref, approved_by, previewed_at,
    before_sha256: before.hash, after_sha256: afterHash };
  return { value, target, before, binding, after, plan_digest: sha(JSON.stringify(binding)) };
}
export function previewDeliveryApplication(root, receiptId, { target_date, approved_by } = {}, { clock } = {}) {
  const state = stateView(records(root, receiptId).at(-1));
  if (state.recovery_required) fail('recovery-required');
  if (state.status === 'applied') fail('already-applied');
  const previewedAt = nowIso(clock);
  const plan = buildPlan(root, receiptId, { target_date, approved_by, previewed_at: previewedAt });
  return { ...plan.binding, plan_digest: plan.plan_digest, previewed_at: previewedAt,
    expires_at: new Date(Date.parse(previewedAt) + DELIVERY_APPLICATION_PREVIEW_TTL_MS).toISOString(),
    before: plan.before.text, after: plan.after, diff: unified(plan.before.text, plan.after, plan.target.target_ref),
    suggested_date: plan.value.suggested_date };
}
function processAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (error) { if (error.code === 'ESRCH') return false; return true; }
}
function liveClaims(root, directory) {
  const authorized = chain(root, directory);
  const names = readdirSync(directory); assertChain(root, directory, authorized);
  if (names.length > 1000) fail('target-busy');
  const claims = [];
  for (const name of names) {
    if (/^\.delivery-[a-f0-9-]+\.tmp$/.test(name)) continue;
    if (!/^claim-[a-f0-9-]{36}\.json$/.test(name)) fail('target-busy');
    const path = join(directory, name); let value;
    try { value = JSON.parse(readBounded(root, path, { max: 4096 }).text); } catch {
      // A unique claim can disappear only when its participant has left.
      if (!existsSync(path)) continue;
      fail('target-busy');
    }
    if (!metadataKeys(value, ['pid', 'nonce', 'choosing', 'ticket']) || !Number.isSafeInteger(value.pid) || value.pid < 1
      || !/^[a-f0-9-]{36}$/.test(value.nonce || '') || name !== `claim-${value.nonce}.json`
      || typeof value.choosing !== 'boolean' || !Number.isSafeInteger(value.ticket) || value.ticket < 0
      || (value.choosing ? value.ticket !== 0 : value.ticket === 0)) fail('target-busy');
    if (!processAlive(value.pid)) {
      // Unique UUID paths are never reused. Removing a dead participant cannot
      // remove a successor's ownership, unlike replacing one canonical lock.
      try { unlinkSync(path); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      continue;
    }
    claims.push(value);
  }
  return claims;
}
function withLock(root, scope, action) {
  const directory = join(privateBase(root), 'locks', sha(scope)); secureDirectory(root, directory);
  const owner = { pid: process.pid, nonce: randomUUID(), choosing: true, ticket: 0 };
  const path = join(directory, `claim-${owner.nonce}.json`);
  // Lamport bakery, with nonblocking contention instead of spinning. Publish
  // choosing before sampling tickets. Stable scope directories and UUID claim
  // paths are never renamed/reused. See lamport.azurewebsites.net/pubs/bakery.pdf.
  atomic(root, path, JSON.stringify(owner));
  try {
    const peers = liveClaims(root, directory);
    const ticket = Math.max(0, ...peers.map(value => value.ticket)) + 1;
    if (!Number.isSafeInteger(ticket)) fail('target-busy');
    owner.ticket = ticket; owner.choosing = false;
    atomic(root, path, JSON.stringify(owner));
    for (const peer of liveClaims(root, directory)) {
      if (peer.nonce === owner.nonce) continue;
      if (peer.choosing || peer.ticket < ticket || (peer.ticket === ticket && peer.nonce < owner.nonce)) fail('target-busy');
    }
    return action();
  } finally { unlinkSync(path); }
}
function withApplicationLocks(root, receiptId, targetRef, action) {
  return withLock(root, `receipt:${receiptId}`, () => withLock(root, `target:${targetRef}`, action));
}
function recordPath(root, record) { return join(privateBase(root), record.receipt_id, record.application_id, 'record.json'); }
function persist(root, record, directory = dirname(recordPath(root, record))) { validateRecord(root, record, record.receipt_id); atomic(root, join(directory, 'record.json'), `${JSON.stringify(record)}\n`); }
function assertTarget(root, path, expected) {
  const current = readBounded(root, path, { optional: true });
  if (current.hash !== expected.hash) fail('target-changed');
  // A replacement with equal bytes still invalidates the checked inode.
  assertChain(root, path, expected.identity);
}
function restore(root, path, before, expectedHash) {
  const current = readBounded(root, path, { optional: true });
  if (current.hash !== expectedHash) fail('target-changed');
  if (before.hash === null) { assertTarget(root, path, current); unlinkSync(path); }
  else atomic(root, path, before.text, before.mode, () => assertTarget(root, path, current));
}
function erasePrepared(root, record) {
  const directory = dirname(recordPath(root, record));
  for (const name of ['record.json', 'before.snapshot', 'after.snapshot']) {
    try { unlinkSync(join(directory, name)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  rmdirSync(directory);
}
export function applyDeliveryApplication(root, receiptId, { target_date, approved_by, previewed_at, plan_digest } = {}, { clock } = {}) {
  id(receiptId); actor(approved_by); const target = targetFor(root, target_date);
  if (!validHash(plan_digest) || !validIso(previewed_at)) fail('preview-invalid');
  const now = nowIso(clock); const age = Date.parse(now) - Date.parse(previewed_at);
  return withApplicationLocks(root, receiptId, target.target_ref, () => {
    const interrupted = records(root, receiptId).at(-1);
    if (interrupted && ['prepared', 'rollback-prepared'].includes(interrupted.status) && interrupted.target_ref !== target.target_ref) fail('recovery-required');
    recoverPending(root, receiptId);
    const previous = records(root, receiptId); const latest = previous.at(-1);
    if (latest?.status === 'applied') {
      if (latest.plan_digest === plan_digest && latest.approved_by === approved_by && latest.target_ref === target.target_ref) return stateView(latest);
      fail('already-applied');
    }
    if (age < 0 || age > DELIVERY_APPLICATION_PREVIEW_TTL_MS) fail('preview-expired');
    const plan = buildPlan(root, receiptId, { target_date, approved_by, previewed_at });
    if (plan.plan_digest !== plan_digest) fail('preview-stale');
    // Enforce the same diff bound even if an API caller skipped preview.
    unified(plan.before.text, plan.after, target.target_ref);
    const record = { ...plan.binding, application_id: `application-${randomUUID()}`, sequence: (latest?.sequence || 0) + 1,
      status: 'prepared', plan_digest, created_at: now, before_mode: plan.before.mode, events: [] };
    const directory = dirname(recordPath(root, record));
    const stage = join(privateBase(root), 'staging', `stage-${randomUUID()}`);
    let written = false; let published = false;
    try {
      secureDirectory(root, stage);
      writeExclusive(root, join(stage, 'before.snapshot'), plan.before.text);
      writeExclusive(root, join(stage, 'after.snapshot'), plan.after);
      persist(root, record, stage);
      secureDirectory(root, dirname(directory));
      const authorized = chain(root, dirname(directory));
      renameSync(stage, directory); assertChain(root, dirname(directory), authorized);
      published = true;
      secureDirectory(root, dirname(target.path));
      const current = readBounded(root, target.path, { optional: true });
      if (current.hash !== plan.before.hash) fail('target-changed');
      atomic(root, target.path, plan.after, plan.before.mode, () => {
        // Recheck approval and output immediately before committing bytes.
        const currentPlan = buildPlan(root, receiptId, { target_date, approved_by, previewed_at });
        if (currentPlan.plan_digest !== plan_digest) fail('preview-stale');
        assertTarget(root, target.path, current);
      });
      written = true;
      record.status = 'applied'; record.events.push({ kind: 'applied', at: now, approved_by, reason: null });
      persist(root, record);
      return stateView(record);
    } catch (error) {
      try {
        if (written) restore(root, target.path, plan.before, record.after_sha256);
        if (published) erasePrepared(root, record);
        else if (existsSync(stage)) {
          for (const name of readdirSync(stage)) unlinkSync(join(stage, name));
          rmdirSync(stage);
        }
      } catch { fail('recovery-required'); }
      if (/^delivery-application-/.test(error.message)) throw error;
      fail('persistence-failed');
    }
  });
}
export function rollbackDeliveryApplication(root, receiptId, { application_id, approved_by, reason } = {}, { clock } = {}) {
  id(receiptId); actor(approved_by);
  if (!APPLICATION_ID.test(application_id || '')) fail('id-invalid');
  if (!DELIVERY_APPLICATION_ROLLBACK_REASONS.includes(reason)) fail('rollback-reason-invalid');
  const initial = records(root, receiptId).at(-1);
  if (!initial || initial.application_id !== application_id) fail('application-not-found');
  return withLock(root, `receipt:${receiptId}`, () => {
    const current = records(root, receiptId).at(-1);
    if (!current || current.application_id !== application_id) fail('application-not-found');
    return withLock(root, `target:${current.target_ref}`, () => {
    recoverPending(root, receiptId);
    const record = records(root, receiptId).at(-1);
    if (!record || record.application_id !== application_id) fail('application-not-found');
    if (record.status === 'rolled-back') return stateView(record);
    if (record.status !== 'applied') fail('recovery-required');
    const directory = dirname(recordPath(root, record));
    const before = readBounded(root, join(directory, 'before.snapshot'));
    const after = readBounded(root, join(directory, 'after.snapshot'));
    if (before.hash !== (record.before_sha256 || sha('')) || after.hash !== record.after_sha256) fail('state-invalid');
    before.hash = record.before_sha256; before.mode = record.before_mode;
    const target = targetFor(root, record.target_date); const now = nowIso(clock);
    const current = readBounded(root, target.path, { optional: true });
    if (current.hash !== record.after_sha256) fail('target-changed');
    record.status = 'rollback-prepared'; record.events.push({ kind: 'rolled-back', at: now, approved_by, reason }); persist(root, record);
    try {
      restore(root, target.path, before, record.after_sha256);
      record.status = 'rolled-back'; persist(root, record);
    } catch {
      // If receipt persistence fails, put the applied bytes back only while the
      // restored version is unchanged. Otherwise leave explicit recovery state.
      try {
        const current = readBounded(root, target.path, { optional: true });
        if (current.hash !== before.hash) fail('target-changed');
        atomic(root, target.path, after.text, before.mode, () => assertTarget(root, target.path, current));
        record.status = 'applied'; record.events.pop(); persist(root, record);
      } catch { fail('recovery-required'); }
      fail('persistence-failed');
    }
    return stateView(record);
    });
  });
}

// Reconcile only durable transaction intent with exact snapshots. Recovery never
// writes a note: mismatched manual edits remain untouched and fail closed.
function recoverPending(root, receiptId) {
  const record = records(root, receiptId).at(-1);
  if (!record || !['prepared', 'rollback-prepared'].includes(record.status)) return stateView(record);
  const directory = dirname(recordPath(root, record));
  const before = readBounded(root, join(directory, 'before.snapshot'));
  const after = readBounded(root, join(directory, 'after.snapshot'));
  if (before.hash !== (record.before_sha256 || sha('')) || after.hash !== record.after_sha256) fail('state-invalid');
  const current = readBounded(root, targetFor(root, record.target_date).path, { optional: true });
  if (record.status === 'prepared') {
    if (current.hash === record.before_sha256) { erasePrepared(root, record); return { status: 'not-applied' }; }
    if (current.hash !== record.after_sha256) fail('target-changed');
    record.status = 'applied'; record.events = [{ kind: 'applied', at: record.created_at, approved_by: record.approved_by, reason: null }];
  } else {
    if (current.hash === record.after_sha256) { record.status = 'applied'; record.events.pop(); }
    else if (current.hash === record.before_sha256) record.status = 'rolled-back';
    else fail('target-changed');
  }
  persist(root, record);
  return stateView(record);
}
export function recoverDeliveryApplication(root, receiptId, { approved_by } = {}, { clock } = {}) {
  id(receiptId); actor(approved_by); nowIso(clock);
  return withLock(root, `receipt:${receiptId}`, () => {
    const latest = records(root, receiptId).at(-1);
    if (latest) withLock(root, `target:${latest.target_ref}`, () => recoverPending(root, receiptId));
    return deliveryApplicationState(root, receiptId, { clock });
  });
}
