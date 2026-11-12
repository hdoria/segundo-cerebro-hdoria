#!/usr/bin/env node
// Build in the developer checkout. The distributed Console needs only Node20+.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwindcss from '@tailwindcss/postcss';
import customMedia from 'postcss-custom-media';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = name => resolve(root, 'console', name);
const shared = {
  absWorkingDir: root, bundle: true, minify: true, format: 'esm',
  target: 'es2022', platform: 'browser', legalComments: 'eof',
  define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'info',
};
// Backend readers must remain portable: installed engines have no node_modules.
await build({ absWorkingDir: root, entryPoints: ['scripts/build-inputs/note-markdown-parser.mjs'], outfile: resolve(root, 'scripts/lib/note-markdown-parser.bundle.mjs'), bundle: true, platform: 'node', format: 'esm', target: 'node20', legalComments: 'eof', logLevel: 'info' });
await build({ ...shared, entryPoints: ['console/ui/index.jsx'], outfile: output('ui.bundle.js') });
// Preserve dependency identifiers: arbitrary minified names can collide with the
// repository's customer-token privacy guard. Syntax/whitespace remain minified.
await build({ ...shared, minify: false, minifyWhitespace: true, minifySyntax: true, minifyIdentifiers: false, entryPoints: ['console/ui/note-workspace.jsx'], outfile: output('note-workspace.bundle.js') });
await build({ ...shared, minify: false, minifyWhitespace: true, minifySyntax: true, minifyIdentifiers: false, entryPoints: ['console/ui/library-workspace.jsx'], outfile: output('library.bundle.js') });
await build({ ...shared, entryPoints: ['console/canvas.js'], outfile: output('canvas.bundle.js') });
const css = await postcss([
  tailwindcss({ base: root, optimize: false }),
  customMedia({ preserve: false }),
]).process(await readFile(output('build.css'), 'utf8'), {
  from: output('build.css'), to: output('styles.bundle.css'), map: false,
});
await writeFile(output('styles.bundle.css'), css.css);
console.log('Console: React/shadcn, Canvas and token-based styles bundled locally.');
