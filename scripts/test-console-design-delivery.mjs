import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bootstrapLegacyConsole } from './console-bootstrap.mjs';
import { launchConsole } from './console.mjs';

const root = mkdtempSync(join(realpathSync(tmpdir()), 'console-design-delivery-'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
let instance;
try {
  mkdirSync(join(root, '.git/info'), { recursive: true });
  writeFileSync(join(root, 'AGENTS.md'), '# Synthetic design proof\n');
  bootstrapLegacyConsole(root, { confirm: true });
  instance = await launchConsole({ root, port: 0, open: false });
  const catalog = await fetch(instance.url + '/design-system');
  assert.equal(catalog.status, 200, 'the real shared-component catalog is available');
  const html = await catalog.text();
  assert.match(html, /id="catalog-root"/);
  assert.match(html, /\/ui\.bundle\.js/);
  assert.match(html, /\/styles\.bundle\.css/);
  const cookie = catalog.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie, 'catalog navigation retains the existing local session boundary');
  for (const [ref, type] of [['ui.bundle.js', 'text/javascript'], ['styles.bundle.css', 'text/css'], ['brand-logo.png', 'image/png']]) {
    const response = await fetch(instance.url + '/' + ref);
    assert.equal(response.status, 200);
    assert.ok(response.headers.get('content-type').startsWith(type));
    assert.equal(hash(Buffer.from(await response.arrayBuffer())), hash(readFileSync(new URL('../console/' + ref, import.meta.url))));
    const csp = response.headers.get('content-security-policy');
    assert.match(csp, /script-src 'self'/);
    assert.match(csp, /style-src 'self'/);
    assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval/);
  }
  for (const ref of ['/ui/index.jsx', '/design/tokens.css', '/package.json']) {
    assert.equal((await fetch(instance.url + ref)).status, 404, 'the asset allowlist does not expose source or disk paths');
  }
  assert.equal((await fetch(instance.url + '/api/console')).status, 403);
  assert.equal((await fetch(instance.url + '/api/console', { headers: { cookie } })).status, 200);
  console.log('PASS design delivery: compiled local assets, genuine catalog, unchanged CSP and session boundary');
} finally {
  if (instance) await new Promise(done => instance.server.close(done));
  rmSync(root, { recursive: true, force: true });
}
