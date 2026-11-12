#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { build } from 'esbuild';
import { parseLayoutPreferences, serializeLayoutPreferences, resolvePanelLayout, resizePanelForKey, panelVisibility } from '../console/ui/library-layout.js';

const config = { categoryDefault: 252, categoryMin: 220, categoryMax: 360, listDefault: 360, listMin: 280, listMax: 480, readerMin: 300, separator: 6, step: 16 };
assert.deepEqual(parseLayoutPreferences(null), {});
for (const raw of ['oops', 'null', '[]', '"private note"', '{"categoryWidth":"350","listWidth":null}', '{"categoryWidth":1e400}']) assert.deepEqual(parseLayoutPreferences(raw), {});
assert.deepEqual(parseLayoutPreferences('{"categoryWidth":300,"listWidth":420,"note":"private text","categoryMin":1}'), { categoryWidth: 300, listWidth: 420 });
assert.equal(serializeLayoutPreferences({ categoryWidth: 300, listWidth: 420, text: 'private note', selectedRef: 'people/private.md' }), '{"categoryWidth":300,"listWidth":420}');
assert.equal(serializeLayoutPreferences({ categoryWidth: Infinity, listWidth: NaN }), '{}');
assert.deepEqual(panelVisibility({}, 'desktop'), { categories: true, list: true });
assert.deepEqual(panelVisibility({ filtersCollapsed: true }, 'desktop'), { categories: false, list: true });
assert.deepEqual(panelVisibility({}, 'tablet'), { categories: false, list: true });
assert.deepEqual(panelVisibility({ panel: 'categories' }, 'tablet'), { categories: false, list: false });
assert.deepEqual(panelVisibility({ expanded: true }, 'desktop'), { categories: false, list: false });
assert.deepEqual(panelVisibility({}, 'mobile'), { categories: false, list: false });
const resolve = (width, preferences = {}, visible = { categories: true, list: true }) => resolvePanelLayout({ width, preferences, visible, config });
const normal = resolve(1200);
assert.equal(normal.categoryWidth, 252);
assert.equal(normal.listWidth, 360);
assert.equal(normal.readerWidth, 576);
const enormous = resolve(1200, { categoryWidth: 100000, listWidth: 100000 });
assert.equal(enormous.categoryWidth, 360);
assert.equal(enormous.listWidth, 480);
for (const width of [0, 6, 150, 300, 469, 720, 812, 900, 1400]) {
  for (const preferences of [{}, { categoryWidth: -1, listWidth: -1 }, { categoryWidth: 1e8, listWidth: 1e8 }]) {
    const layout = resolve(width, preferences);
    for (const value of [layout.categoryWidth, layout.listWidth, layout.readerWidth, layout.separatorWidth]) assert.ok(Number.isFinite(value) && value >= 0);
    assert.ok(layout.categoryWidth + layout.listWidth + layout.readerWidth + layout.separatorWidth * 2 <= width + 1e-8, `no overflow at ${width}`);
    if (width >= config.readerMin + config.separator * 2) assert.ok(layout.readerWidth >= config.readerMin);
    if (width >= 812) { assert.ok(layout.categoryWidth >= 220); assert.ok(layout.listWidth >= 280); }
  }
}
const tablet = resolve(469, {}, { categories: false, list: true });
assert.equal(tablet.categoryWidth, 0);
assert.equal(tablet.readerWidth, 300);
assert.ok(tablet.listWidth > 0);
const fullReader = resolve(469, {}, { categories: false, list: false });
assert.equal(fullReader.readerWidth, 469);
assert.equal(fullReader.separatorWidth, 0);
const range = normal.ranges.category;
assert.equal(resizePanelForKey('ArrowRight', 252, range, config.step), 268);
assert.equal(resizePanelForKey('ArrowLeft', 252, range, config.step), 236);
assert.equal(resizePanelForKey('Home', 252, range, config.step), range.min);
assert.equal(resizePanelForKey('End', 252, range, config.step), range.max);
assert.equal(resizePanelForKey('ArrowLeft', range.min, range, config.step), range.min);
assert.equal(resizePanelForKey('Escape', 252, range, config.step), null);

const temporary = mkdtempSync(new URL('../.library-layout-test-', import.meta.url));
try {
  const result = await build({ stdin: { contents: `
    import React from 'react'; import {renderToStaticMarkup} from 'react-dom/server';
    import {LibraryPanelLayout} from './console/ui/library-layout.jsx';
    export const render = (state={}) => renderToStaticMarkup(<LibraryPanelLayout state={state}><aside className="library-categories">Categories</aside><section className="library-list">Notes</section><section className="library-reader">Reading</section></LibraryPanelLayout>);
  `, resolveDir: fileURLToPath(new URL('..', import.meta.url)), loader: 'jsx' }, bundle: true, platform: 'node', format: 'esm', packages: 'external', write: false, logLevel: 'silent' });
  const path = join(temporary, 'render.mjs'); writeFileSync(path, result.outputFiles[0].text);
  const { render } = await import(pathToFileURL(path));
  const html = render();
  assert.match(html, /library-panels library-panel-layout/);
  assert.equal((html.match(/role="separator"/g) || []).length, 2);
  assert.equal((html.match(/aria-orientation="vertical"/g) || []).length, 2);
  assert.match(html, /aria-label="Largura das categorias"/);
  assert.match(html, /aria-label="Largura da lista de notas"/);
  assert.match(html, /Restaurar larguras/);
  assert.equal((render({ filtersCollapsed: true }).match(/role="separator"/g) || []).length, 1);
  assert.doesNotMatch(render({ expanded: true }), /role="separator"|Restaurar larguras/);
  assert.match(html, /Categories[\s\S]*Notes[\s\S]*Reading/);
} finally { rmSync(temporary, { recursive: true, force: true }); }
console.log('✓ library layout: bounded widths, responsive panes, safe numeric preferences, keyboard ranges and SSR without browser globals');
