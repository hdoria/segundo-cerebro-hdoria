#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { buildBrainUpdateCenter } from './lib/brain-update-center.mjs';
import { planUpdate } from './update.mjs';

const sandbox = mkdtempSync(join(tmpdir(), 'upstream-provenance-'));
const engine = join(sandbox, 'engine');
const privateRoot = join(sandbox, 'private');
const write = (root, path, value) => {
  const target = join(root, path);
  mkdirSync(join(target, '..'), { recursive: true });
  writeFileSync(target, value);
};
const baseline = {
  schema_version: 1,
  repo: 'hdoria/cerebro-hdoria-clean',
  tag: 'v1.40.0',
  commit: '4524e1ba65f9377ebc61d61594476e8a8bc31225',
  integration: 'selective',
  included: ['community', 'safe-updater', 'activation-resumption'],
  excluded: ['member-panel', 'cockpit-launcher', 'metrics-ui'],
};
const center = () => buildBrainUpdateCenter(privateRoot, { engineRoot: engine });
const baselinePath = '.cerebro/upstream-baseline.json';
const record = (value) => write(engine, baselinePath, JSON.stringify(value));

try {
  write(engine, 'VERSION', '1.37.0\n');
  write(engine, '.cerebro/source', 'REPO=hdoria/cerebro-hdoria\nBRANCH=main\n');
  write(privateRoot, 'VERSION', '2026.08.24\n');
  write(privateRoot, '.cerebro/source', 'REPO=example/private-channel\nBRANCH=stable\n');
  write(privateRoot, baselinePath, JSON.stringify({ ...baseline, repo: 'private/never-read' }));

  const missing = center();
  assert.equal(missing.motor.fork_version, '1.37.0');
  assert.equal(missing.motor.version, '1.37.0', 'legacy motor.version remains compatible');
  assert.deepEqual(missing.motor.upstream_baseline, { status: 'missing', runtime_verified: false });
  assert.equal(missing.motor.can_apply, false);
  assert.deepEqual(missing.motor.source, { repo: 'example/private-channel', branch: 'stable' });

  record(baseline);
  const valid = center();
  assert.deepEqual(valid.motor.upstream_baseline, { ...baseline, status: 'recorded', runtime_verified: false });
  assert.equal(valid.installation.version, '2026.08.24');
  assert.deepEqual(valid.motor.source, missing.motor.source, 'provenance never selects the update channel');
  assert.equal(valid.motor.target_version, missing.motor.target_version);
  assert.equal(valid.motor.can_apply, false);
  assert(!JSON.stringify(valid).includes('private/never-read'));

  const invalid = [
    null, [], {}, { ...baseline, schema_version: 2 },
    { ...baseline, repo: '../bad' }, { ...baseline, repo: 'a'.repeat(201) + '/repo' },
    { ...baseline, tag: 'latest' }, { ...baseline, tag: 'v1.40.0-' + 'a'.repeat(100) },
    { ...baseline, commit: baseline.commit.slice(0, 7) },
    { ...baseline, commit: 'z'.repeat(40) }, { ...baseline, integration: 'full' },
    { ...baseline, included: 'all' }, { ...baseline, excluded: [null] },
    { ...baseline, included: Array(33).fill('entry') },
    { ...baseline, included: ['a'.repeat(81)] },
  ];
  for (const value of invalid) {
    record(value);
    assert.deepEqual(center().motor.upstream_baseline, { status: 'invalid', runtime_verified: false });
  }
  for (const bytes of ['', '{broken-json', ' '.repeat(16_385)]) {
    write(engine, baselinePath, bytes);
    assert.equal(center().motor.upstream_baseline.status, 'invalid');
  }
  if (process.platform !== 'win32') {
    rmSync(join(engine, baselinePath));
    symlinkSync(join(privateRoot, baselinePath), join(engine, baselinePath));
    assert.deepEqual(center().motor.upstream_baseline, { status: 'invalid', runtime_verified: false });
    rmSync(join(engine, baselinePath));
    rmSync(join(engine, '.cerebro'), { recursive: true });
    symlinkSync(join(privateRoot, '.cerebro'), join(engine, '.cerebro'));
    assert.deepEqual(center().motor.upstream_baseline, { status: 'invalid', runtime_verified: false });
  }

  // Execute the real Updates renderer against synthetic API data.
  const app = readFileSync(new URL('../console/app.js', import.meta.url), 'utf8');
  const start = app.indexOf('function renderBrainUpdates(');
  const end = app.indexOf('\nfunction renderAnatomy(', start);
  const state = { brain: { updates: { data: valid } } };
  const render = runInNewContext(`${app.slice(start, end)}\nrenderBrainUpdates`, {
    state, escapeHtml: (value) => String(value).replaceAll('<', '&lt;'),
    updateRemoteCopy: () => ({ tone: 'idle', label: 'Não consultado', detail: 'Consulta manual' }),
    updateReasonCopy: () => 'Não gerenciado', brainCount: (value) => value,
  });
  let markup = render({});
  assert.match(markup, /Versão do fork[^]*v1\.37\.0/);
  assert.match(markup, /Referência upstream[^]*v1\.40\.0/);
  assert.match(markup, /Integração seletiva/);
  assert.match(markup, /4524e1b/);
  assert.match(markup, /metadados registrados[^]*execução não verificada/i);
  assert.doesNotMatch(markup, /data-update-apply/);
  state.brain.updates.data = { ...valid, motor: { ...valid.motor, upstream_baseline: { status: 'invalid', runtime_verified: false } } };
  markup = render({});
  assert.match(markup, /Referência upstream[^]*Não verificada/);
  assert.match(markup, /inválido/);
  assert.doesNotMatch(markup, /v1\.40\.0|c14c12e/);
  state.brain.updates.data = missing;
  assert.match(render({}), /Referência upstream[^]*Não verificada[^]*ausente/);

  // Exercise the package manifest through the real updater planner without mutating the product.
  const product = fileURLToPath(new URL('../', import.meta.url));
  const version = readFileSync(join(product, 'VERSION'), 'utf8').trim();
  assert.equal(version, '1.42.2');
  const actual = buildBrainUpdateCenter(privateRoot, { engineRoot: product });
  assert.equal(actual.motor.fork_version, version);
  assert.equal(actual.communication.brain_releases[0]?.version, version, 'current fork changelog must appear in Updates history');
  for (const key of ['repo', 'tag', 'commit', 'integration']) {
    assert.equal(actual.motor.upstream_baseline[key], baseline[key]);
  }
  assert.equal(actual.motor.upstream_baseline.status, 'recorded');
  assert.equal(actual.motor.upstream_baseline.runtime_verified, false);
  const plan = planUpdate(join(sandbox, 'package-target'), product, `v${version}`);
  for (const path of [baselinePath, 'docs/guides/upstream-alignment.md']) {
    assert(plan.entries.some((entry) => entry.path === path && entry.kind === 'motor'), `${path} must be packaged`);
  }
  console.log('upstream-provenance: ok (engine-only, missing/invalid/recorded, Updates renderer, packaging)');
} finally {
  rmSync(sandbox, { recursive: true, force: true });
}
