// Read-only adapter for the existing local metric registry.
// Canonical files: .cerebro/metrics/definitions.json and snapshots/*.json.
import { constants, realpath as realpathCallback } from 'node:fs';
import { promisify } from 'node:util';
import { lstat, open, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

// Match realpathSync/configured-root semantics. fs.promises.realpath uses native
// semantics, which may return different Windows casing or expanded short names.
const realpath = promisify(realpathCallback);

const LIMITS = { files: 200, bytes: 256 * 1024, total: 4 * 1024 * 1024, definitions: 500, metrics: 1000, history: 100 };
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const SECRET_REF = /(?:^|[._:-])(?:private|privado|credential|credentials|secret|secrets|password|token|env|id_rsa)(?:$|[._:-])/i;
const SECRET = /Bearer\s+\S+|-----BEGIN [^-]*PRIVATE KEY|\b(?:sk-[\w-]{16,}|gh[pousr]_[\w]{16,}|xox[baprs]-[\w-]{16,})|(?:api[_-]?key|password|access[_-]?token|secret)\s*[:=]\s*["']?[^\s"',}]{8,}|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const RESTRICTED = new Set(['private', 'confidential', 'restricted', 'privado']);
const PERIOD_KEYS = ['kind', 'mode', 'label', 'start', 'end', 'start_date', 'end_date', 'started_at', 'ended_at', 'from', 'to', 'timezone', 'cycle_ref', 'edition_ref'];
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const number = (value) => typeof value === 'number' && Number.isFinite(value) ? value : null;
const id = (value) => typeof value === 'string' && ID.test(value) && !SECRET_REF.test(value) ? value : null;
const text = (value, max) => typeof value === 'string' && value.length <= max && !/[\x00-\x1f\x7f]/.test(value) && !SECRET.test(value) ? value.trim() : '';
const date = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
const refs = (value) => Array.isArray(value) && value.length <= 50 && value.every((ref) => id(ref)) ? [...new Set(value)] : [];
const areaKey = (value) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function privateRecord(value) {
  if (!object(value)) return false;
  for (const key of ['private', 'confidential', 'restricted']) if (value[key] === true || value[key] === 'true') return true;
  for (const key of ['visibility', 'access', 'privacy', 'status', 'classification', 'sensitivity']) {
    if (typeof value[key] === 'string' && RESTRICTED.has(value[key].toLowerCase().trim())) return true;
  }
  if (object(value.privacy) && (privateRecord(value.privacy) || value.privacy.contains_pii === true || value.privacy.contains_private_content === true)) return true;
  return false;
}

function scopeOf(value) {
  if (value === undefined) value = {};
  if (!object(value) || privateRecord(value)) return null;
  for (const key of ['area_ref', 'system_ref']) if (value[key] != null && !id(value[key])) return null;
  if (value.workflow_refs !== undefined && (!Array.isArray(value.workflow_refs) || value.workflow_refs.length > 50 || value.workflow_refs.some((ref) => !id(ref)))) return null;
  if (value.subject != null && (!object(value.subject) || !id(value.subject.ref) || !text(value.subject.kind || 'unspecified', 60))) return null;
  return { area_ref: id(value.area_ref), system_ref: id(value.system_ref), workflow_refs: refs(value.workflow_refs).sort(), subject: value.subject ? { kind: text(value.subject.kind || 'unspecified', 60), ref: value.subject.ref } : null };
}

function periodOf(value) {
  const result = {};
  if (!object(value)) return result;
  for (const key of PERIOD_KEYS) {
    if (typeof value[key] === 'string' && text(value[key], 150)) result[key] = text(value[key], 150);
  }
  if (typeof value.partial_day === 'boolean') result.partial_day = value.partial_day;
  return result;
}

function fraction(value) {
  if (number(value) !== null) return value;
  if (typeof value === 'string') {
    const label = text(value, 150);
    return label ? { key: null, label, value: null, definition: '' } : null;
  }
  if (!object(value) || privateRecord(value)) return null;
  if (value.key != null && !id(value.key)) return null;
  if (value.label != null && (typeof value.label !== 'string' || (value.label && !text(value.label, 150)))) return null;
  if (value.definition != null && (typeof value.definition !== 'string' || (value.definition && !text(value.definition, 500)))) return null;
  if (value.value != null && number(value.value) === null) return null;
  const result = { key: id(value.key), label: text(value.label, 150), value: number(value.value), definition: text(value.definition, 500) };
  return result.key || result.label || result.value !== null || result.definition ? result : null;
}

function attribution(value) {
  if (object(value)) return privateRecord(value) ? null : text(value.basis, 1000) || null;
  return text(value, 1000) || null;
}

function metricOf(raw, definition = false) {
  if (!object(raw) || privateRecord(raw) || !id(raw.key) || !text(raw.label, 160) || !text(raw.unit, 40)) return null;
  if (raw.source_ref != null && !id(raw.source_ref)) return null;
  if (raw.source_refs !== undefined && (!Array.isArray(raw.source_refs) || raw.source_refs.length > 50 || raw.source_refs.some((ref) => !id(ref)))) return null;
  if (raw.definition != null && !text(raw.definition, 1500)) return null;
  if (raw.target != null && number(raw.target) === null) return null;
  const reading = Object.hasOwn(raw, 'value') ? number(raw.value) : number(raw.count) ?? number(raw.brl_cents);
  return { key: raw.key, name: text(raw.label, 160), unit: text(raw.unit, 40), definition: text(raw.definition, 1500) || null, goal: number(raw.target), current: !definition && raw.state === 'measured' ? reading : null, source_refs: refs(raw.source_refs),
    numerator: fraction(raw.numerator), denominator: fraction(raw.denominator), attribution: attribution(raw.attribution) };
}

async function checkedPath(root, parts) {
  let cursor = root;
  for (const part of parts) {
    if (!part || part === '.' || part === '..' || /[/\\\x00]/.test(part)) throw new Error('unsafe-path');
    cursor = join(cursor, part);
    if ((await lstat(cursor)).isSymbolicLink()) throw new Error('unsafe-path');
  }
  if (await realpath(cursor) !== cursor) throw new Error('unsafe-path');
  return cursor;
}

async function checkedRoot(root) {
  const base = resolve(root);
  let cursor = base;
  while (true) {
    const info = await lstat(cursor);
    if (info.isSymbolicLink()) throw new Error('unsafe-root');
    const parent = dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  if (!(await lstat(base)).isDirectory() || await realpath(base) !== base) throw new Error('unsafe-root');
  return base;
}

async function safeJson(root, parts, budget) {
  const file = await checkedPath(root, parts);
  const before = await lstat(file);
  if (!before.isFile() || before.size > LIMITS.bytes || budget.bytes + before.size > LIMITS.total) throw new Error('read-limit');
  const handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino || opened.size > LIMITS.bytes) throw new Error('changed-file');
    const bytes = Buffer.alloc(opened.size + 1);
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    if (bytesRead !== opened.size || budget.bytes + bytesRead > LIMITS.total) throw new Error('read-limit');
    const after = await lstat(await checkedPath(root, parts));
    if (after.dev !== opened.dev || after.ino !== opened.ino || after.size !== opened.size || after.mtimeMs !== opened.mtimeMs) throw new Error('changed-file');
    budget.bytes += bytesRead;
    const content = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, bytesRead));
    if (content.includes('\0') || SECRET.test(content)) throw new Error('restricted-content');
    const result = JSON.parse(content);
    if (privateRecord(result)) throw new Error('restricted-content');
    return result;
  } finally { await handle.close(); }
}

/** Existing explicit metric definitions/readings only; never executes a query or writes a file. */
export async function businessMetrics(root, { area = '', system = '', workflow = '' } = {}) {
  const result = { available: false, metrics: [], filters: { systems: [], workflows: [] }, issues: [] };
  const issues = new Set();
  for (const [key, value] of Object.entries({ area, system, workflow })) {
    if (typeof value !== 'string' || (value && !id(value))) return { ...result, issues: [`invalid-${key}`] };
  }
  let base;
  try { base = await checkedRoot(root); } catch { return { ...result, issues: ['metrics-root-unavailable'] }; }
  const budget = { bytes: 0 };
  const definitions = [];
  try {
    const value = await safeJson(base, ['.cerebro', 'metrics', 'definitions.json'], budget);
    const records = Array.isArray(value) ? value : value?.definitions;
    if (!Array.isArray(records)) issues.add('definitions-invalid');
    else {
      if (records.length > LIMITS.definitions) issues.add('definition-limit');
      for (const raw of records.slice(0, LIMITS.definitions)) {
        const metric = metricOf(raw, true), scope = scopeOf(raw?.scope);
        if (!metric || !scope) { issues.add('definition-invalid'); continue; }
        definitions.push({ ...metric, scope, source_ref: id(raw.source_ref), period: periodOf(raw.period) });
      }
    }
  } catch (error) { if (error.code !== 'ENOENT') issues.add('definitions-unavailable'); }
  const snapshots = [];
  try {
    const directory = await checkedPath(base, ['.cerebro', 'metrics', 'snapshots']);
    const entries = (await readdir(directory, { withFileTypes: true })).filter((entry) => /^[A-Za-z0-9][A-Za-z0-9._-]*\.json$/.test(entry.name)).sort((a, b) => a.name.localeCompare(b.name));
    if (entries.length > LIMITS.files) issues.add('snapshot-file-limit');
    for (const entry of entries.slice(0, LIMITS.files)) {
      try {
        const raw = await safeJson(base, ['.cerebro', 'metrics', 'snapshots', entry.name], budget);
        const scope = scopeOf(raw?.scope), observed_at = date(raw?.observed_at), source_ref = id(raw?.source?.id);
        if (!object(raw) || !id(raw.snapshot_id) || !scope || !observed_at || !source_ref || privateRecord(raw.source) || !Array.isArray(raw.metrics)) throw new Error('invalid-snapshot');
        const metrics = raw.metrics.slice(0, 200).map((metric) => metricOf(metric)).filter(Boolean);
        if (metrics.length !== Math.min(raw.metrics.length, 200)) issues.add('reading-invalid');
        if (!metrics.length) throw new Error('invalid-snapshot');
        snapshots.push({ snapshot_id: raw.snapshot_id, observed_at, source_ref, scope, period: periodOf(raw.period), metrics });
      } catch { issues.add('snapshot-unavailable'); }
    }
  } catch (error) { if (error.code !== 'ENOENT') issues.add('snapshots-unavailable'); }
  const registry = new Map(), seenSnapshots = new Set();
  const matches = (scope) => !area || areaKey(scope.area_ref || '') === areaKey(area);
  const scopeKey = (scope) => JSON.stringify(scope);
  const metricKey = (metric, scope, source) => JSON.stringify([metric.key, metric.unit, source, scopeKey(scope)]);
  for (const snapshot of snapshots) {
    if (seenSnapshots.has(snapshot.snapshot_id)) { issues.add('duplicate-snapshot'); continue; }
    seenSnapshots.add(snapshot.snapshot_id);
    if (!matches(snapshot.scope)) continue;
    for (const metric of snapshot.metrics) {
      const key = metricKey(metric, snapshot.scope, snapshot.source_ref);
      if (!registry.has(key)) {
        if (registry.size >= LIMITS.metrics) { issues.add('metric-limit'); continue; }
        registry.set(key, { id: key, ...metric, source_ref: snapshot.source_ref, scope: snapshot.scope, history: [] });
      }
      registry.get(key).history.push({ ...metric, value: metric.current, status: metric.current === null ? 'unmeasured' : 'measured', snapshot_id: snapshot.snapshot_id, observed_at: snapshot.observed_at, source_ref: snapshot.source_ref, scope: snapshot.scope, period: snapshot.period });
    }
  }
  for (const metric of registry.values()) {
    metric.history.sort((a, b) => b.observed_at.localeCompare(a.observed_at) || b.snapshot_id.localeCompare(a.snapshot_id));
    Object.assign(metric, metric.history[0]);
    metric.history = metric.history.slice(0, LIMITS.history);
  }
  for (const definition of definitions.filter((metric) => matches(metric.scope))) {
    const existing = [...registry.values()].filter((metric) => metric.key === definition.key && metric.unit === definition.unit && scopeKey(metric.scope) === scopeKey(definition.scope) && (!definition.source_ref || metric.source_ref === definition.source_ref));
    for (const metric of existing) {
      metric.goal ??= definition.goal;
      metric.definition ||= definition.definition;
    }
    if (!existing.length) {
      if (registry.size >= LIMITS.metrics) { issues.add('metric-limit'); continue; }
      const key = metricKey(definition, definition.scope, definition.source_ref);
      registry.set(key, { ...definition, id: key, current: null, history: [] });
    }
  }
  result.available = definitions.length > 0 || snapshots.length > 0;
  const areaMetrics = [...registry.values()];
  result.filters = {
    systems: [...new Set(areaMetrics.map((metric) => metric.scope.system_ref).filter(Boolean))].sort(),
    workflows: [...new Set(areaMetrics.flatMap((metric) => metric.scope.workflow_refs))].sort(),
  };
  result.metrics = areaMetrics.filter((metric) => (!system || metric.scope.system_ref === system)
    && (!workflow || metric.scope.workflow_refs.includes(workflow))).map((metric) => ({
    id: metric.id, name: metric.name, definition: metric.definition, unit: metric.unit,
    source_ref: metric.source_ref, source_refs: metric.source_refs, scope: metric.scope, period: metric.period || {},
    goal: metric.goal, current: metric.current, status: metric.current === null ? 'unmeasured' : 'measured',
    numerator: metric.numerator, denominator: metric.denominator, attribution: metric.attribution,
    area_refs: metric.scope.area_ref ? [metric.scope.area_ref] : [],
    history: metric.history.map(({ value, status, snapshot_id, observed_at, source_ref, source_refs, scope, period, unit, goal, definition, numerator, denominator, attribution }) => ({ value, status, snapshot_id, observed_at, source_ref, source_refs, scope, period, unit, goal, definition, numerator, denominator, attribution })),
  })).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  result.issues = [...issues];
  return result;
}
