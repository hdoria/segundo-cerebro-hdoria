import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { identityForKey } from '../console/design/tokens.js';
const source = readFileSync(new URL('../console/app.js', import.meta.url), 'utf8');
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));

// An unavailable decision queue is a real API state. It must not reserve most
// of the desktop for an empty column while shrinking the remaining work.
const state = { model: { today: { needs_attention: [], ready_to_work: [], active: [] }, routines: [] } };
const renderToday = runInNewContext(`${section('function renderToday()', 'function canvasRefOptions(')}\nrenderToday`, {
  state, visibleJudgments: () => [], inActiveOperatingArea: () => true,
  empty: (title, body) => `<p>${title}: ${body}</p>`,
});
for (const decisions of [undefined, { available: false }]) {
  state.decisions = decisions;
  assert.match(renderToday(), /today-dashboard is-single/);
}
state.decisions = { available: true, open: [], open_count: 0, decided_total: 0 };
assert.doesNotMatch(renderToday(), /today-dashboard is-single/);

// The same fallback mark is used by catalog, workspace and comunidade Vibe Makers, without
// depending on any colored ancestor. Identity does not encode execution state.
const systemIdentity = runInNewContext(`${section('function systemIdentity(', 'function systemPublisher(')}\nsystemIdentity`, {
  identityForKey, systemInitials: () => 'SC', escapeHtml: value => String(value),
});
const system = { system_id: 'demo-system', name: 'Sistema de contexto' };
const mark = systemIdentity(system);
assert.match(mark, new RegExp(`data-identity="${identityForKey(system.system_id)}"`));
assert.match(systemIdentity({ ...system, migration_stage: 'active' }), new RegExp(`data-identity="${identityForKey(system.system_id)}"`));
assert.equal(identityForKey('demo-system'), identityForKey('demo-system'));
assert.match(identityForKey('\"><script>'), /^(indigo|blue|violet|teal|rose|orange|green)$/);
console.log('console-composition: ok (unavailable/empty queues and shared entity identity)');
