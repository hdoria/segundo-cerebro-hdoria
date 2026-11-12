#!/usr/bin/env node
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createConsoleServer } from './console-server.mjs';

const root = mkdtempSync(join(realpathSync(tmpdir()), 'console-files-'));
const outside = mkdtempSync(join(realpathSync(tmpdir()), 'console-files-outside-'));
function write(ref, text) { const path = join(root, ref); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text); }
function config(value) { write('.cerebro/layout.json', JSON.stringify(value)); }
write('VERSION', '1'); write('COMECE-AQUI.md', '# Start');
config({ knowledgeRoot: '.', vault: { areas: 'Areas' } });
write('Areas/area-delta.md', '---\ntype: Area\n---\n# Delta Academy\n');
write('Projects/project.md', '---\ntype: Project\nupdated: 2026-10-20\nbelongs_to: "[[area-delta|Delta]]"\n---\n# Launch course\nbody-only-needle [[area-other]]');
write('Projects/related.md', '---\ntype: Project\nrelated_to:\n  - "[[Delta Academy]]"\n---\n# Another project');
write('Projects/loose.md', '# Loose note\n[[area-delta]]');
write('Projects/private-title.md', '---\nvisibility: private\n---\n# private-title');
write('visible.md', '# Visible\n<script>alert(1)</script> ![remote](https://invalid.example/image)');
for (const ref of ['.hidden.md', '.env.md', 'credentials.md', 'id_rsa.md', 'privado/secret.md', '.cerebro/secret.md', 'node_modules/secret.md', 'build/secret.md', 'vendor/secret.md']) write(ref, '# denied-marker');
write('Projects/huge.md', `# Huge\n${'x'.repeat(512 * 1024)}`);
write('Projects/binary.md', Buffer.from([0x23, 0x20, 0xff]));
write('Projects/nul.md', '# Nul\u0000data');
write('Projects/indented-private.md', '---\n  visibility: private\n---\n# Indented private');
write('Projects/private-key.md', '# Private credential');
write('Projects/broken-header.md', '---\nvisibility: private\n# Broken header');
write('Projects/yaml-private.md', '---\nvisibility: &secret private\n---\n# YAML private');
write('Projects/quoted-private.md', '---\n"visibility": private\n---\n# Quoted private');
write('Projects/classified.md', '---\nclassification: private\n---\n# Classified private');
write('Projects/sensitive.md', '---\nsensitivity: confidential\n---\n# Confidential note');
writeFileSync(join(outside, 'escaped.md'), '# Escaped');
symlinkSync(join(outside, 'escaped.md'), join(root, 'linked.md'));
symlinkSync(outside, join(root, 'linked-dir'), 'dir');
const instance = createConsoleServer({ root });
await new Promise((resolve) => instance.server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${instance.server.address().port}`;
const cookie = (await fetch(base)).headers.get('set-cookie').split(';')[0];
async function get(path, authenticated = true) {
  const response = await fetch(`${base}${path}`, { headers: authenticated ? { Cookie: cookie } : {} });
  return { status: response.status, value: await response.json(), headers: response.headers };
}
async function list(params = '') { return get(`/api/local-files${params ? `?${params}` : ''}`); }
async function open(ref) { return get(`/api/local-files/content?ref=${encodeURIComponent(ref)}`); }
try {
  assert.equal((await get('/api/business-metrics', false)).status, 403, 'business metrics needs session');
  const definition = { key: 'course-sales', label: 'Course sales', unit: 'count', definition: 'Confirmed course sales', source_ref: 'local-sales', scope: { area_ref: 'area-delta' } };
  write('.cerebro/metrics/definitions.json', JSON.stringify({ definitions: [definition] }));
  const metrics = await get('/api/business-metrics?area=area-delta');
  assert.equal(metrics.status, 200);
  assert.equal(metrics.value.metrics.length, 1);
  assert.equal(metrics.value.metrics[0].current, null, 'defined without reading remains null');
  assert.equal((await get('/api/business-metrics?area=other')).value.metrics.length, 0);
  assert.equal((await get('/api/local-files', false)).status, 403, 'file metadata needs existing Console session');
  assert.equal((await get('/api/local-files/content?ref=visible.md', false)).status, 403, 'content needs session');
  const first = await list();
  assert.equal(first.status, 200);
  assert.equal(first.value.directory, '.');
  assert.equal(first.value.parent_ref, null);
  assert.deepEqual(first.value.folders, [{ ref: 'Areas', name: 'Areas' }, { ref: 'Projects', name: 'Projects' }]);
  assert.equal(JSON.stringify(first.value).includes('denied-marker'), false);
  assert.equal(first.value.files.some((file) => file.ref === 'visible.md'), true);
  assert.equal((await list('q=body-only-needle')).value.total, 0, 'search is title only');
  assert.equal((await list('q=PRIVATE-TITLE')).value.total, 0, 'private title excluded before searching');
  const titleSearch = (await list('q=course')).value;
  assert.equal(titleSearch.total, 1);
  assert.deepEqual(titleSearch.files[0], { ref: 'Projects/project.md', title: 'Launch course', type: 'Project', updated: '2026-10-20', area_refs: ['area-delta'] });
  const area = (await list('area=area-delta')).value;
  assert.deepEqual(area.files.map((file) => file.ref).sort(), ['Areas/area-delta.md', 'Projects/project.md', 'Projects/related.md']);
  assert.equal((await list('area=Delta%20Academy&type=Project')).value.total, 2, 'area labels resolve through declared own-note H1');
  const folder = (await list('dir=Projects')).value;
  assert.equal(folder.parent_ref, '.');
  assert.equal(folder.total, 3);
  assert.equal((await list('dir=Projects&limit=1&offset=1')).value.files[0].ref, folder.files[1].ref);
  write('Projects/new.md', '# Newly added');
  assert.equal((await list('q=Newly')).value.files[0].ref, 'Projects/new.md', 'refresh reads new files');
  for (const [updated, expected] of [
    ['not-a-date', null], ['2026-99-99', null],
    ['2026-10-20', '2026-10-20'],
    ['2026-10-20T14:25:30.000Z', '2026-10-20T14:25:30.000Z'],
    ['2026-10-20T11:25:30-03:00', '2026-10-20T11:25:30-03:00'],
  ]) {
    write('Dates/date.md', `---\nupdated: ${updated}\nbelongs_to: "[[area-delta]]"\n---\n# Date fixture`);
    const dated = (await list('q=Date%20fixture&area=area-delta')).value.files[0];
    assert.equal(dated.updated, expected, 'file and area metadata exposes only dates safe for the UI formatter');
  }
  const content = await open('visible.md');
  assert.equal(content.value.text, '# Visible\n<script>alert(1)</script> ![remote](https://invalid.example/image)');
  assert.equal(content.headers.get('content-type'), 'application/json; charset=utf-8');
  assert.equal(content.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(content.value.bytes, Buffer.byteLength(content.value.text));
  for (const ref of ['../escaped.md', '/etc/passwd', 'Projects/../visible.md', 'Projects\\project.md', 'visible.md\u0000', '.hidden.md', '.env.md', 'credentials.md', 'id_rsa.md', 'privado/secret.md', '.cerebro/secret.md', 'node_modules/secret.md', 'build/secret.md', 'vendor/secret.md', 'Projects/private-title.md', 'Projects/indented-private.md', 'Projects/private-key.md', 'Projects/broken-header.md', 'Projects/yaml-private.md', 'Projects/quoted-private.md', 'Projects/classified.md', 'Projects/sensitive.md', 'Projects/huge.md', 'Projects/binary.md', 'Projects/nul.md', 'linked.md', 'linked-dir/escaped.md', 'VERSION', 'missing.md']) {
    assert.deepEqual((await open(ref)).value, { reason_code: 'not-found' }, `denied open: ${ref}`);
    assert.equal((await open(ref)).status, 404);
  }
  for (const dir of ['../', '/etc', 'Projects/..', 'linked-dir', 'privado', '.cerebro', 'Projects\\child']) assert.equal((await list(`dir=${encodeURIComponent(dir)}`)).status, 404, `denied directory: ${dir}`);
  for (const query of ['limit=0', 'limit=101', 'offset=-1', 'offset=1.2', `q=${'x'.repeat(201)}`]) assert.equal((await list(query)).status, 400, `bounded query: ${query.slice(0, 30)}`);
  write('visible.md', '---\nvisibility: private # stale open must revalidate\n---\n# Now private');
  assert.equal((await open('visible.md')).status, 404);
  renameSync(join(root, 'Projects/new.md'), join(root, 'Projects/old.md'));
  symlinkSync(join(outside, 'escaped.md'), join(root, 'Projects/new.md'));
  assert.equal((await open('Projects/new.md')).status, 404, 'previously listed file replaced by symlink is denied');
  const readable = join(root, 'Projects/loose.md');
  chmodSync(readable, 0);
  try { assert.equal((await list('q=course')).value.total, 1, 'an unreadable file does not break the index'); } finally { chmodSync(readable, 0o600); }
  config({ knowledgeRoot: 'Projects' });
  assert.equal((await list()).value.directory, 'Projects');
  assert.equal((await open('Areas/area-delta.md')).status, 404, 'open remains inside configured knowledge root');
  config({ knowledgeRoot: 'linked-dir' });
  assert.equal((await list()).status, 404, 'symlinked configured root denied');
  config({ knowledgeRoot: 'linked-dir/child' });
  mkdirSync(join(outside, 'child'));
  assert.equal((await list()).status, 404, 'symlinked configured root ancestor denied');
  config({ knowledgeRoot: '../' });
  assert.equal((await list()).status, 404, 'invalid configured root fails closed');
  config({});
  assert.equal((await list()).value.available, false, 'default absent knowledge root is honest unavailable');
  write('01-nucleo-privado/note.md', '# Default root');
  assert.equal((await list()).value.files[0].ref, '01-nucleo-privado/note.md');
  renameSync(join(root, '.cerebro/layout.json'), join(root, '.cerebro/old-layout.json'));
  writeFileSync(join(outside, 'layout.json'), JSON.stringify({ knowledgeRoot: '.' }));
  symlinkSync(join(outside, 'layout.json'), join(root, '.cerebro/layout.json'));
  assert.equal((await list()).status, 404, 'layout itself cannot be a symlink');
  rmSync(join(root, '.cerebro/layout.json'));
  renameSync(join(root, '.cerebro/old-layout.json'), join(root, '.cerebro/layout.json'));
  const { listLocalFiles, readLocalFile } = await import('./lib/local-file-browser.mjs');
  const { publicMarkdownParts } = await import('./lib/note-visibility.mjs');
  for (const text of ['\uFEFF---\nvisibility: private\n---\n# BOM private', '---  \nvisibility: private\n---\n# Delimiter spaces', '---\nvisibility : private\n---\n# Key spaces']) {
    assert.throws(() => publicMarkdownParts(text), /not-found/, 'shared helper independently protects raw UTF-8 readers');
  }
  assert.deepEqual(publicMarkdownParts('---\ntype: Area\n---\n# Public'), { header: 'type: Area', body: '# Public' });
  symlinkSync(root, join(outside, 'root-link'), 'dir');
  assert.throws(() => listLocalFiles(join(outside, 'root-link')), /not-found/);
  assert.throws(() => readLocalFile(join(outside, 'root-link'), '01-nucleo-privado/note.md'), /not-found/);
  assert.throws(() => listLocalFiles(join(outside, 'root-link', 'Projects')), /not-found/);
  console.log('✓ local files: authenticated HTTP browsing, title/area filters, pagination, freshness and shared private/path/symlink/content bounds');
} finally {
  await new Promise((resolve) => instance.server.close(resolve));
  rmSync(root, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true });
}
