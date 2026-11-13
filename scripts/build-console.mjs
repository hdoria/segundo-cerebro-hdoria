#!/usr/bin/env node
// Build in the developer checkout. The distributed Console needs only Node20+.
import { readFile, writeFile } from 'node:fs/promises';
import { relative } from 'node:path';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwindcss from '@tailwindcss/postcss';
import customMedia from 'postcss-custom-media';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// --check compila em memória e compara com os bundles commitados, sem gravar nada.
const check = process.argv.includes('--check');
const outputs = [];
const output = name => resolve(root, 'console', name);
const shared = {
  absWorkingDir: root, bundle: true, minify: true, format: 'esm',
  target: 'es2022', platform: 'browser', legalComments: 'eof',
  define: { 'process.env.NODE_ENV': '"production"' }, logLevel: check ? 'warning' : 'info',
};
const bundle = async (options) => {
  const result = await build({ ...options, write: false, logLevel: check ? 'warning' : options.logLevel });
  for (const file of result.outputFiles) outputs.push({ path: file.path, text: file.text });
};
// Backend readers must remain portable: installed engines have no node_modules.
await bundle({ absWorkingDir: root, entryPoints: ['scripts/build-inputs/note-markdown-parser.mjs'], outfile: resolve(root, 'scripts/lib/note-markdown-parser.bundle.mjs'), bundle: true, platform: 'node', format: 'esm', target: 'node20', legalComments: 'eof', logLevel: 'info' });
await bundle({ ...shared, entryPoints: ['console/ui/index.jsx'], outfile: output('ui.bundle.js') });
// Preserve dependency identifiers: arbitrary minified names can collide with the
// repository's customer-token privacy guard. Syntax/whitespace remain minified.
await bundle({ ...shared, minify: false, minifyWhitespace: true, minifySyntax: true, minifyIdentifiers: false, entryPoints: ['console/ui/note-workspace.jsx'], outfile: output('note-workspace.bundle.js') });
await bundle({ ...shared, minify: false, minifyWhitespace: true, minifySyntax: true, minifyIdentifiers: false, entryPoints: ['console/ui/library-workspace.jsx'], outfile: output('library.bundle.js') });
await bundle({ ...shared, entryPoints: ['console/canvas.js'], outfile: output('canvas.bundle.js') });
const css = await postcss([
  tailwindcss({ base: root, optimize: false }),
  customMedia({ preserve: false }),
]).process(await readFile(output('build.css'), 'utf8'), {
  from: output('build.css'), to: output('styles.bundle.css'), map: false,
});
outputs.push({ path: output('styles.bundle.css'), text: css.css });

// Dependência resolvida fora do checkout (node_modules por link simbólico) grava o
// caminho da máquina no bundle, e o bundle vai para o pacote público.
const leaks = outputs.filter(({ text }) => /(?:^|["'\s])(?:\.\.\/)+[^\s"']*node_modules\//m.test(text) || text.includes(`${root}/`));
if (leaks.length) {
  console.error(`✗ bundle com caminho de fora do checkout: ${leaks.map(({ path }) => relative(root, path)).join(', ')}`);
  process.exit(1);
}
if (check) {
  const stale = [];
  for (const { path, text } of outputs) {
    const current = await readFile(path, 'utf8').catch(() => null);
    if (current !== text) stale.push(relative(root, path));
  }
  if (stale.length) {
    console.error(`✗ bundle desatualizado, rode npm run build:console: ${stale.join(', ')}`);
    process.exit(1);
  }
  console.log(`✓ ${outputs.length} bundles batem com a fonte`);
} else {
  for (const { path, text } of outputs) await writeFile(path, text);
  console.log('Console: React/shadcn, Canvas and token-based styles bundled locally.');
}
