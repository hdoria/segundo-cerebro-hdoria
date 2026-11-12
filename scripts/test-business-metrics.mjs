import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import fsPromises from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';

import { businessMetrics } from './lib/business-metrics.mjs';
const roots = [];
const fixture = () => { const root = mkdtempSync(join(realpathSync(tmpdir()), 'business-metrics-')); roots.push(root); return root; };
const write = (root, ref, value) => { mkdirSync(join(root, ref, '..'), { recursive: true }); writeFileSync(join(root, ref), typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)); };
const definition = (extra = {}) => ({ key: 'approved-sales', label: 'Approved sales', unit: 'count', definition: 'Approved sales in the stated period.', target: 10, source_ref: 'sales-source', scope: { area_ref: 'sales' }, ...extra });
const snapshot = (snapshot_id, observed_at, value, extra = {}) => ({ snapshot_id, observed_at, source: { id: 'sales-source', label: 'Sales source' }, scope: { area_ref: 'sales' }, period: { kind: 'month', label: 'October', start: '2026-10-01', end: '2026-10-31' }, metrics: [{ ...definition(), state: 'measured', value }], ...extra });
try {
  const root = fixture();
  write(root, '.cerebro/metrics/definitions.json', { definitions: [definition(), definition({ key: 'renewals', label: 'Renewals', target: null })] });
  write(root, '.cerebro/metrics/snapshots/older.json', snapshot('sales-old', '2026-10-10T10:00:00Z', 4));
  write(root, '.cerebro/metrics/snapshots/current.json', snapshot('sales-new', '2026-10-20T10:00:00Z', 0));
  // Native Windows realpath can change path spelling relative to realpathSync.
  // Emulate that API boundary on every OS while keeping the real files and lstat checks.
  const nativeRealpath = fsPromises.realpath;
  try {
    fsPromises.realpath = async (...args) => (await nativeRealpath(...args)).toUpperCase();
    syncBuiltinESMExports();
    const preserved = await businessMetrics(root);
    assert.equal(preserved.available, true, 'valid configured roots remain readable despite native realpath spelling changes');
    assert.equal(preserved.metrics.find((item) => item.name === 'Approved sales').current, 0);
  } finally { fsPromises.realpath = nativeRealpath; syncBuiltinESMExports(); }
  let result = await businessMetrics(root);
  assert.equal(result.available, true, 'existing upstream definitions and snapshots are available');
  assert.equal(result.metrics.length, 2);
  const metric = result.metrics.find((item) => item.name === 'Approved sales');
  assert.equal(metric.current, 0, 'actual zero is measured');
  assert.equal(metric.status, 'measured');
  assert.equal(metric.goal, 10);
  assert.equal(metric.definition, definition().definition);
  assert.equal(metric.unit, 'count');
  assert.equal(metric.source_ref, 'sales-source');
  assert.deepEqual(metric.area_refs, ['sales']);
  assert.equal(metric.period.label, 'October');
  assert.deepEqual(metric.history.map((item) => item.value), [0, 4]);
  assert.equal(metric.history[0].snapshot_id, 'sales-new');
  assert.equal(metric.history[0].source_ref, 'sales-source');
  assert.equal(metric.history[0].period.start, '2026-10-01');
  const missing = result.metrics.find((item) => item.name === 'Renewals');
  assert.equal(missing.current, null);
  assert.equal(missing.status, 'unmeasured');
  assert.equal(missing.goal, null);
  assert.deepEqual(missing.history, []);
  assert.equal((await businessMetrics(root, { area: 'other' })).metrics.length, 0);
  assert.equal((await businessMetrics(root, { area: 'sales' })).metrics.length, 2);
  assert.deepEqual((await businessMetrics(root, { area: '../sales' })).metrics, []);

  const empty = fixture();
  write(empty, '.cerebro/retrieval-health.json', { metrics: [definition({ value: 100 })] });
  assert.deepEqual(await businessMetrics(empty), { available: false, metrics: [], filters: { systems: [], workflows: [] }, issues: [] }, 'engine health is not business data');
  assert.equal((await businessMetrics(root)).metrics.length, 2, 'reads selected data root, not engine checkout');
  const legacy = fixture();
  write(legacy, '.cerebro/metrics/definitions.json', [definition()]);
  write(legacy, '.cerebro/metrics/snapshots/count.json', snapshot('count', '2026-10-20T10:00:00Z', undefined, { metrics: [{ ...definition(), state: 'measured', count: 7 }] }));
  assert.equal((await businessMetrics(legacy)).metrics[0].current, 7, 'upstream count field is retained');
  write(legacy, '.cerebro/metrics/snapshots/count.json', snapshot('count', '2026-10-20T10:00:00Z', 7, { metrics: [{ ...definition(), state: 'unavailable', value: 7 }] }));
  assert.equal((await businessMetrics(legacy)).metrics[0].current, null, 'unavailable reading never promotes a number');

  const denied = fixture();
  write(denied, '.cerebro/metrics/definitions.json', { definitions: [definition({ private: true }), definition({ key: 'secret', source_ref: '../outside' }), definition({ key: 'credential', source_ref: 'install-credential' }), { key: 'bad', label: 'Malformed' }] });
  write(denied, '.cerebro/metrics/snapshots/private.json', snapshot('private-data', '2026-10-20T10:00:00Z', 7, { privacy: 'private' }));
  write(denied, '.cerebro/metrics/snapshots/malformed.json', '{');
  result = await businessMetrics(denied);
  assert.deepEqual(result.metrics, []);
  assert.ok(result.issues.length);
  assert.ok(!JSON.stringify(result).includes('private-data'));
  write(denied, '.cerebro/metrics/definitions.json', { definitions: [definition({ definition: 'Bearer TEST_TOKEN_MUST_NOT_APPEAR' })] });
  assert.ok(!JSON.stringify(await businessMetrics(denied)).includes('TEST_TOKEN'));
  write(denied, '.cerebro/metrics/definitions.json', Buffer.from([0xff, 0x00]));
  assert.deepEqual((await businessMetrics(denied)).metrics, []);

  write(denied, '.cerebro/metrics/definitions.json', ' '.repeat(256 * 1024 + 1));
  assert.deepEqual((await businessMetrics(denied)).metrics, [], 'oversized definitions denied');
  const readingsOnly = fixture();
  write(readingsOnly, '.cerebro/metrics/snapshots/valid.json', snapshot('reading-only', '2026-10-20T10:00:00Z', 0));
  assert.equal((await businessMetrics(readingsOnly)).metrics[0].current, 0, 'explicit snapshot carries its own metric definition');
  write(readingsOnly, '.cerebro/metrics/snapshots/other-source.json', snapshot('second-source', '2026-10-20T10:00:00Z', 2, { source: { id: 'other-source' } }));
  assert.equal((await businessMetrics(readingsOnly)).metrics.length, 2, 'independent sources never aggregate');
  write(readingsOnly, '.cerebro/metrics/snapshots/newer.json', snapshot('newer', '2026-10-21T10:00:00Z', 9, { metrics: [{ ...definition(), state: 'unavailable', value: 9 }] }));
  assert.equal((await businessMetrics(readingsOnly)).metrics.find((item) => item.source_ref === 'sales-source').current, null, 'latest missing reading never reuses an older value');

  const detailed = fixture();
  write(detailed, '.cerebro/metrics/snapshots/older.json', snapshot('fraction-old', '2026-10-19T10:00:00Z', 2, {
    metrics: [{ ...definition(), state: 'measured', value: 2, numerator: { key: 'completed', label: 'Completed purchases', value: 2, definition: 'Approved purchase IDs' }, denominator: 0, attribution: 'Recorded purchase IDs' }],
  }));
  write(detailed, '.cerebro/metrics/snapshots/current.json', snapshot('fraction-new', '2026-10-20T10:00:00Z', 0, {
    metrics: [{ ...definition(), state: 'measured', value: 0, numerator: 0, denominator: 'Eligible purchases', attribution: { basis: 'Matched purchase IDs' } }],
  }));
  const fractionMetric = (await businessMetrics(detailed)).metrics[0];
  assert.equal(fractionMetric.current, 0, 'fractions never replace the declared reading with a calculated ratio');
  assert.equal(fractionMetric.numerator, 0);
  assert.deepEqual(fractionMetric.denominator, { key: null, label: 'Eligible purchases', value: null, definition: '' });
  assert.equal(fractionMetric.attribution, 'Matched purchase IDs');
  assert.equal(fractionMetric.history[0].numerator, 0);
  assert.deepEqual(fractionMetric.history[0].denominator, fractionMetric.denominator);
  assert.equal(fractionMetric.history[0].attribution, 'Matched purchase IDs');
  assert.deepEqual(fractionMetric.history[1].numerator, { key: 'completed', label: 'Completed purchases', value: 2, definition: 'Approved purchase IDs' });
  assert.equal(fractionMetric.history[1].denominator, 0, 'undefined division does not erase an explicit zero denominator');
  assert.equal(fractionMetric.history[1].attribution, 'Recorded purchase IDs');
  assert.equal(fractionMetric.history[1].source_ref, 'sales-source');
  const configured = fixture();
  write(configured, '.cerebro/metrics/definitions.json', [definition({ numerator: 'Completed purchases', denominator: { label: 'All purchases', value: 0 }, attribution: { basis: 'Definition provenance' } })]);
  const configuredMetric = (await businessMetrics(configured)).metrics[0];
  assert.equal(configuredMetric.current, null);
  assert.deepEqual(configuredMetric.numerator, { key: null, label: 'Completed purchases', value: null, definition: '' });
  assert.deepEqual(configuredMetric.denominator, { key: null, label: 'All purchases', value: 0, definition: '' });
  assert.equal(configuredMetric.attribution, 'Definition provenance');
  write(detailed, '.cerebro/metrics/snapshots/latest.json', snapshot('fraction-missing', '2026-10-21T10:00:00Z', undefined, {
    metrics: [{ ...definition(), state: 'unavailable', numerator: { key: '../outside', label: 'Unsafe ref' }, denominator: { private: true, label: 'Hidden denominator' }, attribution: { private: true, basis: 'Hidden attribution' } }],
  }));
  const unavailableMetric = (await businessMetrics(detailed)).metrics[0];
  for (const item of [unavailableMetric, unavailableMetric.history[0]]) {
    assert.equal(item.numerator, null); assert.equal(item.denominator, null); assert.equal(item.attribution, null);
  }
  assert.equal(unavailableMetric.current, null, 'missing current detail never borrows an older fraction or reading');
  assert.equal(JSON.stringify(unavailableMetric).includes('Hidden'), false, 'nested private fraction and attribution stay excluded');
  assert.equal(metric.numerator, null); assert.equal(metric.denominator, null); assert.equal(metric.attribution, null);
  const malformed = fixture();
  const invalidFractions = [null, '', true, [], {}, { label: 'x'.repeat(151) }, { definition: 'x'.repeat(501) }, { value: '3' }, { label: 'Hidden fraction', privacy: { contains_private_content: true } }];
  write(malformed, '.cerebro/metrics/snapshots/invalid.json', snapshot('invalid-fractions', '2026-10-20T10:00:00Z', 0, {
    metrics: invalidFractions.map((value, index) => ({ ...definition({ key: `invalid-${index}` }), state: 'measured', value: 0, numerator: value, denominator: value, attribution: index % 2 ? { basis: 'x'.repeat(1001) } : ['Unsupported attribution'] })),
  }));
  const malformedDetails = (await businessMetrics(malformed)).metrics;
  assert.equal(malformedDetails.length, 9, 'valid readings survive malformed optional detail');
  for (const item of malformedDetails) {
    assert.equal(item.current, 0, 'invalid optional detail does not erase the independent reading');
    assert.equal(item.numerator, null); assert.equal(item.denominator, null); assert.equal(item.attribution, null);
  }

  const scoped = fixture();
  const firstScope = { area_ref: 'sales', system_ref: 'system-a', workflow_refs: ['workflow-a'], subject: { kind: 'offer', ref: 'offer-a' } };
  const secondScope = { area_ref: 'sales', system_ref: 'system-b', workflow_refs: ['workflow-b'], subject: { kind: 'offer', ref: 'offer-b' } };
  write(scoped, '.cerebro/metrics/snapshots/a.json', snapshot('scope-a', '2026-10-20T10:00:00Z', 3, { scope: firstScope }));
  write(scoped, '.cerebro/metrics/snapshots/b.json', snapshot('scope-b', '2026-10-20T10:00:00Z', 8, { scope: secondScope }));
  const series = (await businessMetrics(scoped)).metrics;
  assert.equal(series.length, 2, 'different system, workflow and subject scopes remain independent series');
  assert.deepEqual(series.map((item) => item.scope), [firstScope, secondScope], 'public series retain explicit validated scope');
  assert.deepEqual(series.map((item) => item.history[0].scope), [firstScope, secondScope], 'historical provenance includes scope');
  write(scoped, '.cerebro/metrics/definitions.json', [definition({ key: 'configured', scope: { area_ref: 'sales', system_ref: 'system-c', workflow_refs: ['workflow-c', 'workflow-a'] } })]);
  write(scoped, '.cerebro/metrics/snapshots/other-area.json', snapshot('scope-other', '2026-10-20T10:00:00Z', 1, { scope: { area_ref: 'product', system_ref: 'system-other', workflow_refs: ['workflow-other'] } }));
  const scopedChoices = { systems: ['system-a', 'system-b', 'system-c'], workflows: ['workflow-a', 'workflow-b', 'workflow-c'] };
  const selected = await businessMetrics(scoped, { area: 'sales', system: 'system-a', workflow: 'workflow-a' });
  assert.equal(selected.metrics.length, 1);
  assert.deepEqual(selected.metrics[0].scope, firstScope);
  assert.deepEqual(selected.filters, scopedChoices, 'choices reflect valid area records before system/workflow filtering');
  assert.equal((await businessMetrics(scoped, { area: 'sales', system: 'system-a', workflow: 'workflow-b' })).metrics.length, 0, 'scope filters are conjunctive');
  assert.equal((await businessMetrics(scoped, { area: 'sales', workflow: 'workflow-a' })).metrics.length, 2, 'definitions and readings both participate in filters');
  assert.equal((await businessMetrics(scoped, { system: 'system-b' })).metrics.length, 1);
  assert.equal((await businessMetrics(scoped, { workflow: 'workflow-other' })).metrics[0].scope.area_ref, 'product');
  assert.deepEqual((await businessMetrics(scoped, { area: 'unknown' })).filters, { systems: [], workflows: [] });
  for (const [key, value] of [['area', '../sales'], ['system', '../outside'], ['system', 42], ['workflow', 'install-credential'], ['workflow', 'x'.repeat(161)]]) {
    const invalid = await businessMetrics(scoped, { [key]: value });
    assert.deepEqual(invalid.metrics, []); assert.deepEqual(invalid.filters, { systems: [], workflows: [] });
    assert.deepEqual(invalid.issues, [`invalid-${key}`]);
  }
  write(scoped, '.cerebro/metrics/snapshots/unsafe.json', snapshot('scope-unsafe', '2026-10-20T10:00:00Z', 99, { scope: { ...firstScope, subject: { kind: 'offer', ref: '../outside' } } }));
  write(scoped, '.cerebro/metrics/snapshots/private-scope.json', snapshot('scope-private', '2026-10-20T10:00:00Z', 99, { scope: { area_ref: 'sales', system_ref: 'hidden-system', workflow_refs: ['hidden-workflow'], private: true } }));
  assert.equal((await businessMetrics(scoped)).metrics.length, 4, 'unsafe scope references remain excluded');
  assert.deepEqual((await businessMetrics(scoped, { area: 'sales' })).filters, scopedChoices, 'invalid/private scopes never become filter choices');

  const linked = fixture();
  symlinkSync(join(root, '.cerebro'), join(linked, '.cerebro'), 'dir');
  assert.deepEqual((await businessMetrics(linked)).metrics, [], 'symlinked parent denied');
  const linkedRoot = join(fixture(), 'linked'); symlinkSync(root, linkedRoot, 'dir');
  assert.deepEqual((await businessMetrics(linkedRoot)).metrics, [], 'symlinked selected root denied');
  const linkedFile = fixture();
  mkdirSync(join(linkedFile, '.cerebro/metrics/snapshots'), { recursive: true });
  symlinkSync(join(root, '.cerebro/metrics/definitions.json'), join(linkedFile, '.cerebro/metrics/definitions.json'));
  symlinkSync(join(root, '.cerebro/metrics/snapshots/current.json'), join(linkedFile, '.cerebro/metrics/snapshots/outside.json'));
  assert.deepEqual((await businessMetrics(linkedFile)).metrics, [], 'symlinked files denied');
  write(root, '.cerebro/metrics/definitions.json', { private: true, definitions: [definition()] });
  rmSync(join(root, '.cerebro/metrics/snapshots'), { recursive: true });
  assert.deepEqual((await businessMetrics(root)).metrics, [], 'privacy revalidated on refresh');
  console.log('PASS business metrics: fractions/attribution current and history, conjunctive scope filters, existing provenance and bounded private reads');
} finally { for (const root of roots) rmSync(root, { recursive: true, force: true }); }
