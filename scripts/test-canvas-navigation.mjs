import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { designTestStyles } from './lib/console-design-test-fixture.mjs';

// Exercise the production controller with only the browser renderer replaced.
// G6's fit returns a deliberately unreadable zoom to distinguish initial
// readable framing from the explicit entire-map action.
let graph;
class Renderer {
  constructor(options) {
    graph = this;
    this.options = options;
    this.zoom = 1;
    this.size = [options.width, options.height];
    this.states = {};
    this.resizeCount = 0;
    // G6 changes the root positioning; viewport sizing must not depend on
    // the renderer preserving our absolute positioning rule.
    options.container.style.position = 'relative';
  }
  on() {}
  async render() {}
  async fitView() { this.zoom = 0.24; }
  getZoom() { return this.zoom; }
  getZoomRange() { return [0.01, 10]; }
  async zoomTo(zoom) { this.zoom = zoom; }
  async focusElement() {}
  async setElementState(states) { this.states = states; }
  getRelatedEdgesData() { return []; }
  setSize(width, height) { this.size = [width, height]; this.resizeCount += 1; }
  destroy() { this.destroyed = true; }
}
globalThis.__canvasRenderer = Renderer;
// CI intentionally installs no browser dependencies. Keep the actual module
// and layout policy, replacing only renderer/icons at their import boundaries.
const source = await readFile(new URL('../console/canvas.js', import.meta.url), 'utf8');
let importCount = 0;
const moduleSource = source.replace(/import\s+\{([\s\S]*?)\}\s+from\s+['"]([^'"]+)['"];?/g, (statement, names, specifier) => {
  importCount += 1;
  if (specifier === './canvas-layout-policy.js' || specifier === './design/tokens.js') {
    return statement.replace(specifier, new URL(`../console/${specifier.slice(2)}`, import.meta.url).href);
  }
  if (specifier === '@antv/g6') {
    assert.deepEqual(names.split(',').map((name) => name.trim()), ['Graph', 'NodeEvent']);
    return 'const Graph = globalThis.__canvasRenderer; const NodeEvent = { CLICK: "node:click", DRAG_END: "node:dragend" };';
  }
  assert.ok(['@lucide/icons', '@lucide/icons/build', 'simple-icons'].includes(specifier), `unexpected canvas dependency: ${specifier}`);
  return `const { ${names} } = new Proxy({}, { get: () => () => '' });`;
});
assert.equal(importCount, 6, 'review the renderer seam when canvas imports change');
const { mountOperationalCanvas } = await import(`data:text/javascript;base64,${Buffer.from(moduleSource).toString('base64')}`);
delete globalThis.__canvasRenderer;
globalThis.document = { documentElement: {} };
globalThis.getComputedStyle = () => designTestStyles();
const frames = new Map();
let frameId = 0;
globalThis.requestAnimationFrame = (callback) => { frames.set(++frameId, callback); return frameId; };
globalThis.cancelAnimationFrame = (id) => frames.delete(id);
const flushFrames = async () => {
  const pending = [...frames.values()];
  frames.clear();
  for (const callback of pending) await callback();
};
let observer;
globalThis.ResizeObserver = class {
  constructor(callback) { observer = this; this.callback = callback; }
  observe(element) { this.element = element; }
  disconnect() { this.disconnected = true; }
};
const listeners = new Map();
const classes = new Set();
const container = {
  clientWidth: 640, clientHeight: 480, dataset: {},
  style: { setProperty() {} }, replaceChildren() {},
  querySelectorAll: () => [{ dataset: { nodeId: 'output' }, classList: {
    add: (...names) => names.forEach((name) => classes.add(name)),
    remove: (...names) => names.forEach((name) => classes.delete(name)),
  } }],
  addEventListener: (name, callback) => listeners.set(name, callback),
  removeEventListener: (name, callback) => { if (listeners.get(name) === callback) listeners.delete(name); },
};
const controller = await mountOperationalCanvas({ container, model: {
  graph_type: 'run', nodes: [{ id: 'output', kind: 'output', actual: true }], edges: [],
} });
assert.equal(graph.zoom, 0.70, 'initial framing keeps the readable run policy');
await controller.focus('output');
assert.ok(classes.has('is-focused'));
await controller.fit();
assert.equal(graph.zoom, 0.24, 'entire-map action must not reapply the readable minimum zoom');
assert.deepEqual(graph.states, { output: ['actual'] }, 'entire-map action preserves trace state and clears selection');
assert.ok(!classes.has('is-focused'));
assert.deepEqual(graph.size, [640, 480], 'renderer starts at actual graph-pane dimensions');
assert.deepEqual(graph.options.padding, [32, 32, 32, 32], 'inspector no longer consumes invisible map padding');
await controller.zoomIn();
assert.ok(graph.zoom > 0.24);
await controller.zoomOut();
assert.ok(Math.abs(graph.zoom - 0.24) < 0.00001);
graph.zoom = 9.9;
await controller.zoomIn();
assert.equal(graph.zoom, 10, 'zoom in stops at renderer upper bound');
graph.zoom = 0.011;
await controller.zoomOut();
assert.equal(graph.zoom, 0.01, 'zoom out stops at renderer lower bound');
assert.equal(observer.element, container);
container.clientWidth = 390;
container.clientHeight = 340;
observer.callback();
await flushFrames();
assert.deepEqual(graph.size, [390, 340], 'layout/sidebar changes resize the real pane without a window event');
container.clientWidth = 1072;
container.clientHeight = 711;
observer.callback();
await flushFrames();
assert.deepEqual(graph.size, [1072, 711], 'mobile-to-desktop resize restores viewport height despite renderer inline positioning');
const resizeCount = graph.resizeCount;
container.clientWidth = 0;
observer.callback();
await flushFrames();
assert.equal(graph.resizeCount, resizeCount, 'hidden panes do not collapse renderer dimensions');
container.clientWidth = 640;
observer.callback();
listeners.get('wheel')();
controller.destroy();
assert.equal(observer.disconnected, true);
assert.equal(listeners.has('wheel'), false, 'destroy removes the wheel listener');
assert.equal(frames.size, 0, 'destroy cancels queued resize and zoom work');
observer.callback();
await flushFrames();
assert.equal(graph.resizeCount, resizeCount, 'late observations do not touch a destroyed renderer');
assert.equal(graph.destroyed, true);
console.log('✓ Canvas: readable opening, entire map, bounded zoom and resize lifecycle');
