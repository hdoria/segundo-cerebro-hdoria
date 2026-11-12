import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// The shipped stylesheet is the value authority; these browser-free fixtures
// deliberately change a few resolved tokens to prove consumers read the system.
const css = await readFile(new URL('../console/design/tokens.css', import.meta.url), 'utf8');
const values = new Map([...css.matchAll(/(--[\w-]+)\s*:\s*([^;{}]+);/g)].map(([, name, value]) => [name, value.trim()]));
const styles = { getPropertyValue: (name) => values.get(name) || '' };
const { operationalPositions, readableViewportPlan } = await import('../console/canvas-layout-policy.js');
const model = { graph_type: 'run', nodes: [{ id: 'source', kind: 'source' }, { id: 'output', kind: 'output', actual: true }], edges: [] };
values.set('--canvas-column-gap', '300px');
values.set('--canvas-column-start', '80px');
values.set('--canvas-column-center-y', '220px');
assert.deepEqual(operationalPositions(model, styles), { source: { x: 80, y: 220 }, output: { x: 1280, y: 220 } });
values.set('--canvas-zoom-min-run', '0.83');
assert.equal(readableViewportPlan(model, 0.2, styles).zoom, 0.83);
assert.equal(readableViewportPlan(model, 0.9, styles).zoom, 0.9);

const events = new Map();
const motionEvents = new Map();
const media = { matches: false, addEventListener: (name, callback) => motionEvents.set(name, callback), removeEventListener: (name) => motionEvents.delete(name) };
const browser = { matchMedia: () => media, addEventListener: (name, callback) => events.set(name, callback), removeEventListener: (name) => events.delete(name) };
globalThis.document = { documentElement: {} };
globalThis.getComputedStyle = () => styles;
const frames = new Map();
let frameId = 0;
globalThis.requestAnimationFrame = (callback) => { frames.set(++frameId, callback); return frameId; };
globalThis.cancelAnimationFrame = (id) => frames.delete(id);
globalThis.ResizeObserver = class { observe() {} disconnect() {} };
const classes = new Set();
const container = { ownerDocument: { defaultView: browser }, clientWidth: 640, clientHeight: 480, dataset: {},
  style: { setProperty() {} }, replaceChildren() {}, addEventListener() {}, removeEventListener() {},
  querySelectorAll: () => [{ dataset: { nodeId: 'output' }, classList: { add: (...items) => items.forEach((item) => classes.add(item)), remove: (...items) => items.forEach((item) => classes.delete(item)) } }],
};
let graph;
class Renderer {
  constructor(options) { graph = this; this.options = options; this.zoom = 1; this.states = {}; this.draws = 0; this.positions = { source: [80, 220], output: [1280, 220] }; }
  on() {} async render() {} async fitView() { this.zoom = 0.2; } getZoom() { return this.zoom; }
  getZoomRange() { return [0.01, 10]; } async zoomTo(zoom) { this.zoom = zoom; } async focusElement() {}
  async setElementState(states) { this.states = states; } getRelatedEdgesData() { return []; }
  getNodeData() { return this.options.data.nodes; } getElementPosition(id) { return this.positions[id]; }
  setSize() {} setOptions(options) { this.options = { ...this.options, ...options }; }
  async draw() { this.draws += 1; classes.clear(); } destroy() { this.destroyed = true; }
}
globalThis.__canvasTokenRenderer = Renderer;
const source = await readFile(new URL('../console/canvas.js', import.meta.url), 'utf8');
const moduleSource = source.replace(/import\s+\{([\s\S]*?)\}\s+from\s+['"]([^'"]+)['"];?/g, (statement, names, specifier) => {
  if (specifier.startsWith('./')) return statement.replace(specifier, new URL(`../console/${specifier.slice(2)}`, import.meta.url).href);
  if (specifier === '@antv/g6') return 'const Graph = globalThis.__canvasTokenRenderer; const NodeEvent = { CLICK: "node:click", DRAG_END: "node:dragend" };';
  assert.ok(['@lucide/icons', '@lucide/icons/build', 'simple-icons'].includes(specifier));
  return `const { ${names} } = new Proxy({}, { get: () => () => '' });`;
});
const { mountOperationalCanvas } = await import(`data:text/javascript;base64,${Buffer.from(moduleSource).toString('base64')}`);
const controller = await mountOperationalCanvas({ container, model });
assert.equal(graph.zoom, 0.83, 'framing reads the design-system policy');
await controller.focus('output');
const before = { zoom: graph.zoom, positions: controller.positions(), states: structuredClone(graph.states) };
values.set('--run', '#123456');
values.set('--bg', '#abcdef');
values.set('--canvas-edge-width-actual', '3px');
values.set('--canvas-node-default-width', '144px');
events.get('cerebro:theme-change')();
for (const callback of [...frames.values()]) { frames.clear(); await callback(); }
assert.equal(graph.draws, 1, 'theme refresh redraws the existing G6 instance');
assert.equal(graph.options.background, 'transparent', 'CSS viewport owns the surface without a stale opaque G6 layer');
assert.equal(graph.options.edge.state.actual.stroke, '#123456');
assert.equal(graph.options.edge.style.lineWidth({ data: { actual: true } }), 3);
assert.equal(graph.options.node.style.size({ data: { kind: 'output' } })[0], 144);
assert.deepEqual(controller.positions(), before.positions, 'theme changes preserve user positions');
assert.equal(graph.zoom, before.zoom, 'theme changes preserve viewport zoom');
assert.deepEqual(graph.states, before.states, 'theme changes preserve selected and replay states');
assert.ok(classes.has('is-focused'), 'redrawn HTML nodes retain selected-neighborhood focus');
media.matches = true;
motionEvents.get('change')();
for (const callback of [...frames.values()]) { frames.clear(); await callback(); }
assert.equal(graph.options.animation, false, 'reduced-motion changes disable renderer transitions');
events.get('cerebro:theme-change')();
controller.destroy();
assert.equal(events.has('cerebro:theme-change'), false);
assert.equal(motionEvents.has('change'), false);
assert.equal(frames.size, 0, 'destroy cancels queued theme redraws');
assert.equal(graph.destroyed, true);
values.set('--canvas-brain-radius-system', '400px');
values.set('--canvas-brain-handoff-stack-gap', '42px');
const brainModel = { graph_type: 'brain', nodes: [
  { id: 'system:left', kind: 'system' }, { id: 'system:right', kind: 'system' },
  ...Array.from({ length: 4 }, (_, index) => ({ id: `handoff:${index}`, kind: 'handoff' })),
], edges: Array.from({ length: 4 }, (_, index) => [
  { id: `in:${index}`, source: 'system:left', target: `handoff:${index}` },
  { id: `out:${index}`, source: `handoff:${index}`, target: 'system:right' },
]).flat() };
const brainController = await mountOperationalCanvas({ container, model: brainModel });
const nodeData = (id) => graph.options.data.nodes.find((node) => node.id === id);
assert.equal(nodeData('system:left').style.y, -400 * Number.parseFloat(values.get('--canvas-brain-squash')));
const firstLane = nodeData('handoff:0').style.y;
assert.equal(nodeData('handoff:2').style.y - firstLane, 84, 'handoff spacing comes from shared geometry tokens');
assert.equal(nodeData('handoff:3').style.y, firstLane, 'handoff lane count is a shared display policy');
brainController.destroy();
delete globalThis.__canvasTokenRenderer;
console.log('✓ Canvas tokens: shared geometry, paint, theme refresh, reduced motion and lifecycle');
