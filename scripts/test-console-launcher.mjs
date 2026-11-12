#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { EventEmitter } from 'node:events';
import { bootstrapLegacyConsole } from './console-bootstrap.mjs';
import { launchConsole, openConsoleBrowser, parseConsoleArgs } from './console.mjs';

assert.deepEqual(parseConsoleArgs(['--root', 'a brain', '--port=0', '--no-open'], {}), { root: resolve('a brain'), port: 0, open: false, help: false });
assert.deepEqual(parseConsoleArgs(['--help'], {}), { help: true });
assert.equal(parseConsoleArgs([], { CEREBRO_INSTALL_ROOT: '/synthetic/brain' }).root, resolve('/synthetic/brain'));
for (const args of [[], ['--root'], ['--root='], ['--root=a', '--port=-1'], ['--root=a', '--port=1.5'], ['--root=a', '--port=65536'], ['--root=a', '--unknown'], ['--root=a', '--root=b']]) {
  assert.throws(() => parseConsoleArgs(args, {}), /console-(root-required|arguments-invalid)/);
}

for (const [platform, expected] of [['darwin', ['open']], ['win32', ['rundll32.exe', 'url.dll,FileProtocolHandler']], ['linux', ['xdg-open']]]) {
  let received;
  await openConsoleBrowser('http://127.0.0.1:4782', { platform, spawn(command, args, options) {
    received = { command, args, options };
    const child = new EventEmitter(); queueMicrotask(() => child.emit('close', 0)); return child;
  } });
  assert.equal(received.command, expected[0]);
  assert.deepEqual(received.args, [...expected.slice(1), 'http://127.0.0.1:4782']);
  assert.notEqual(received.options.shell, true);
  assert.equal(received.options.timeout, 5000, 'browser helper must not hold startup indefinitely');
}
await assert.rejects(openConsoleBrowser('http://127.0.0.1:4782', { spawn() {
  const child = new EventEmitter(); queueMicrotask(() => child.emit('error', new Error('PRIVATE INTERNAL PATH'))); return child;
} }), /^Error: console-browser-unavailable$/);

const root = mkdtempSync(join(tmpdir(), 'console-launcher-'));
let instance;
try {
  mkdirSync(join(root, '.git', 'info'), { recursive: true });
  writeFileSync(join(root, 'AGENTS.md'), '# Synthetic brain\n');
  bootstrapLegacyConsole(root, { confirm: true });
  let opened = 0;
  instance = await launchConsole({ root, port: 0, open: false }, { opener: () => { opened++; } });
  assert.equal(instance.root, root);
  assert.equal(opened, 0);
  assert.match(instance.url, /^http:\/\/127\.0\.0\.1:\d+$/);
  const page = await fetch(instance.url);
  assert.equal(page.status, 200);
  await page.text();
  await new Promise((done) => instance.server.close(done)); instance = null;
  instance = await launchConsole({ root, port: 0, open: true }, { opener: async (url) => {
    opened++; const response = await fetch(url); assert.equal(response.status, 200); await response.text();
  } });
  assert.equal(opened, 1, 'browser opens only after the listener is ready');
  assert.equal(instance.open_error, null);
  await new Promise((done) => instance.server.close(done)); instance = null;
  instance = await launchConsole({ root, port: 0, open: true }, { opener: async () => { throw Error('PRIVATE'); } });
  assert.equal(instance.open_error, 'console-browser-unavailable');
  const live = await fetch(instance.url); assert.equal(live.status, 200); await live.text();
} finally {
  if (instance) await new Promise((done) => instance.server.close(done));
  rmSync(root, { recursive: true, force: true });
}
console.log('✓ Console launcher: explicit root, native browser arguments, no-open and live HTTP');
