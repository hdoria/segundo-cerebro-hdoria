#!/usr/bin/env node
// Catches omitted package assets, checkout-only imports and wrong effective roots.
// Uses the real installer/updater and installed CLI, never npm/build or a real vault.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyPlan, planUpdate } from './update.mjs';

const product = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sandbox = mkdtempSync(join(realpathSync(tmpdir()), 'installed Console release '));
const source = join(sandbox, 'current release package');
const version = readFileSync(join(product, 'VERSION'), 'utf8').trim();
const tag = `v${version}`;
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const write = (root, ref, value) => {
  mkdirSync(dirname(join(root, ref)), { recursive: true });
  writeFileSync(join(root, ref), typeof value === 'string' || Buffer.isBuffer(value) ? value : `${JSON.stringify(value)}\n`);
};
const env = { ...process.env, CEREBRO_TELEMETRY: 'off', CEREBRO_INSTALL_SOURCE_DIR: source, CEREBRO_UPDATE_SOURCE_DIR: source };
const run = (script, args, extraEnv = {}) => execFileSync(process.execPath, [script, ...args], {
  cwd: sandbox, env: { ...env, ...extraEnv }, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', timeout: 30_000, maxBuffer: 16 * 1024 * 1024,
});

// Follow actual local HTML/module/CSS dependencies independently of the motor manifest.
// If console/ or one dependency leaves the manifest, installed HTTP must still fail.
function requiredAssets() {
  const assets = new Map();
  const pending = ['/index.html', '/design-system.html', '/canvas.bundle.js'];
  while (pending.length) {
    const ref = pending.shift();
    if (assets.has(ref)) continue;
    const bytes = readFileSync(join(product, 'console', ref.slice(1)));
    assets.set(ref, bytes);
    if (!/\.(?:html|css|js)$/.test(ref) || ref === '/canvas.bundle.js') continue;
    const text = bytes.toString('utf8');
    const links = ref.endsWith('.html') ? [...text.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
      : ref.endsWith('.css') ? [...text.matchAll(/url\(["']?([^\s"')]+)["']?\)/g)]
        : [...text.matchAll(/(?:from\s*|import\s*\()\s*["']([^"']+)["']/g)];
    for (const [, link] of links) {
      if (!link.startsWith('/') && !link.startsWith('./')) continue;
      const local = new URL(link, `http://localhost${ref}`).pathname;
      if (!assets.has(local)) pending.push(local);
    }
  }
  return assets;
}

// Instala em duas pastas (vault + motor) pelo instalador real; devolve os caminhos.
function install(name, packageRoot = source, releaseTag = tag) {
  const folders = { vault: join(sandbox, name, 'notas'), motor: join(sandbox, name, 'motor') };
  const args = ['--tag', releaseTag, '--vault', folders.vault, '--motor', folders.motor];
  const preview = JSON.parse(run(join(source, 'scripts/install.mjs'), args, { CEREBRO_INSTALL_SOURCE_DIR: packageRoot }));
  assert.equal(preview.status, 'preview');
  assert.equal(preview.written, false);
  assert.equal(existsSync(folders.vault) || existsSync(folders.motor), false, 'installation preview must not create its destinations');
  const applied = JSON.parse(run(join(source, 'scripts/install.mjs'), [...args, '--apply'], { CEREBRO_INSTALL_SOURCE_DIR: packageRoot }));
  assert.equal(applied.status, 'installed');
  assert.equal(applied.version, releaseTag.slice(1));
  assert.equal(existsSync(join(folders.motor, 'node_modules')), false, 'installed Console has no npm dependency step');
  return folders;
}

function dataFixture(root, marker) {
  mkdirSync(join(root, '.cerebro/runtime'), { recursive: true });
  write(root, '.cerebro/layout.json', { knowledgeRoot: 'notes', vault: { areas: 'notes/areas' } });
  write(root, 'notes/areas/release-area.md', '---\ntype: Area\n---\n# Release area\n');
  write(root, 'notes/public.md', `---\ntype: Note\nbelongs_to: "[[release-area]]"\n---\n# ${marker}\nSynthetic public text\n`);
  write(root, '.cerebro/metrics/definitions.json', { definitions: [{ key: 'release-count', label: marker, unit: 'count', definition: 'Synthetic measured count', source_ref: 'release-source', scope: { area_ref: 'release-area' } }] });
  write(root, '.cerebro/metrics/snapshots/zero.json', {
    snapshot_id: 'release-zero', observed_at: '2026-10-20T12:00:00Z', source: { id: 'release-source' },
    scope: { area_ref: 'release-area' }, period: { label: 'Synthetic period' },
    metrics: [{ key: 'release-count', label: marker, unit: 'count', state: 'measured', value: 0 }],
  });
  write(root, '.automacao/_FILA-DECISAO.json', { abertos: { 'release-decision': { titulo: 'Private synthetic decision title', categoria: 'martelo', first_seen: '2026-10-20', last_seen: '2026-10-20' } }, historico: [] });
}

async function installedCli(engine, root, verify) {
  const child = spawn(process.execPath, [join(engine, 'scripts/console.mjs'), '--root', root, '--port=0', '--no-open'], {
    cwd: sandbox, env: { ...env, CEREBRO_INSTALL_ROOT: join(sandbox, 'wrong environment root') }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  let output = '';
  const stopped = new Promise((done) => child.once('close', done));
  try {
    const url = await new Promise((done, reject) => {
      const timer = setTimeout(() => reject(new Error('installed-console-start-timeout')), 15_000);
      child.once('error', (error) => { clearTimeout(timer); reject(error); });
      child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`installed-console-exit:${code}:${output}`)); });
      child.stderr.on('data', (bytes) => { output += bytes; });
      child.stdout.on('data', (bytes) => {
        output += bytes;
        const match = output.match(/http:\/\/127\.0\.0\.1:\d+/);
        if (match) { clearTimeout(timer); done(match[0]); }
      });
    });
    await verify(url);
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
    let timer;
    try { await Promise.race([stopped, new Promise((_, reject) => { timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('installed-console-stop-timeout')); }, 10_000); })]); }
    finally { clearTimeout(timer); }
  }
}

async function verifyAssets(url, assets) {
  for (const [ref, expected] of assets) {
    try {
      const route = ref === '/index.html' ? '/' : ref === '/design-system.html' ? '/design-system' : ref;
      const response = await fetch(url + route, { signal: AbortSignal.timeout(10_000) });
      assert.equal(response.status, 200);
      assert.equal(digest(Buffer.from(await response.arrayBuffer())), digest(expected));
    } catch (error) { throw new Error(`packaged asset unavailable or changed: ${ref}`, { cause: error }); }
  }
}

async function smoke(engine, root, marker, assets) {
  await installedCli(engine, root, async (url) => {
    await verifyAssets(url, assets);
    const page = await fetch(url); await page.text();
    const cookie = page.headers.get('set-cookie')?.split(';')[0];
    assert.ok(cookie, 'installed Console issues its own session');
    const get = async (path) => {
      const response = await fetch(url + path, { headers: { Cookie: cookie }, signal: AbortSignal.timeout(10_000) });
      assert.equal(response.status, 200, `installed HTTP ${path}`);
      return response.json();
    };
    const session = await get('/api/session'); assert.equal(typeof session.csrf_token, 'string');
    const files = await get(`/api/local-files?q=${encodeURIComponent(marker)}`);
    assert.equal(files.available, true); assert.equal(files.total, 1); assert.equal(files.files[0].title, marker);
    const metrics = await get('/api/business-metrics?area=release-area');
    assert.equal(metrics.available, true); assert.equal(metrics.metrics.length, 1);
    assert.equal(metrics.metrics[0].name, marker); assert.equal(metrics.metrics[0].current, 0);
    assert.equal(metrics.metrics[0].history[0].snapshot_id, 'release-zero');
    const inbox = await get('/api/operational-inbox');
    assert.equal(inbox.available, true);
    assert.ok(inbox.notices.some((notice) => notice.target.kind === 'decision-case'), 'installed notice adapter reads the chosen root');
    assert.doesNotMatch(JSON.stringify(inbox), /Private synthetic decision title/);
    const update = await get('/api/update'); assert.equal(update.motor.fork_version, version);
    assert.equal(existsSync(join(root, '.cerebro/runtime/console-inbox-read.json')), false, 'installed GET does not create read preferences');
  });
}

try {
  const assets = requiredAssets();
  // Materialize only files the official package actually declares, never copy .git,
  // node_modules or any untracked/private directory from the developer checkout.
  const packagePlan = planUpdate(join(sandbox, 'package inventory only'), product, tag);
  for (const entry of packagePlan.entries.filter((entry) => ['motor', 'seed'].includes(entry.kind))) {
    write(source, entry.path, readFileSync(join(product, entry.path)));
  }
  for (const ref of ['.gitignore', '.cerebro/vault-seed.manifest']) write(source, ref, readFileSync(join(product, ref)));
  const projected = (dir) => readdirSync(join(product, dir), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile()).map((entry) => join(entry.parentPath, entry.name).slice(product.length + 1));
  for (const ref of [...projected('templates/vault'), ...projected('.claude/skills'), ...projected('.agents/skills')]) {
    write(source, ref, readFileSync(join(product, ref)));
  }
  const fresh = install('fresh');
  dataFixture(fresh.vault, 'Fresh root marker');

  const baseline = join(sandbox, 'previous release package');
  cpSync(source, baseline, { recursive: true });
  write(baseline, 'VERSION', '0.0.1\n');
  write(baseline, 'templates/vault/AGENTS.md', readFileSync(join(source, 'templates/vault/AGENTS.md'), 'utf8').replace('<!-- CEREBRO:MANAGED:BEGIN -->', '<!-- CEREBRO:MANAGED:BEGIN -->\nSYNTHETIC OLD MANAGED RULE'));
  write(baseline, 'console/styles.css', Buffer.concat([readFileSync(join(source, 'console/styles.css')), Buffer.from('\n/* previous synthetic release */\n')]));
  const upgraded = install('existing', baseline, 'v0.0.1');
  const ownerInstructions = '\nOWNER INSTRUCTIONS MUST SURVIVE\n';
  const ownerBefore = readFileSync(join(upgraded.vault, 'AGENTS.md'), 'utf8') + ownerInstructions;
  write(upgraded.vault, 'AGENTS.md', ownerBefore);
  write(upgraded.vault, '.gitignore', `${readFileSync(join(upgraded.vault, '.gitignore'), 'utf8')}\n*.owner-only\n`);
  const sentinels = {
    'meu-negocio/mapa.md': 'OWNER CONTEXT', 'capturas/local.txt': 'OWNER CAPTURE', 'privado/local.txt': 'PRIVATE SENTINEL',
    '.cerebro/install-credential': 'OWNER CREDENTIAL',
    '.cerebro/metrics/definitions.json': '{"definitions":[]}', '.cerebro/runtime/owner-state.json': '{"owner":"state"}',
    '.agents/skills/own-skill/SKILL.md': 'OWNER SKILL', 'sistemas/outros-instalados/own-system/context.md': 'OWNER SYSTEM',
  };
  for (const [ref, value] of Object.entries(sentinels)) write(upgraded.vault, ref, value);
  const updater = join(upgraded.motor, 'scripts/update.mjs');
  const args = ['--tag', tag, '--vault', upgraded.vault, '--motor', upgraded.motor, '--baseline-dir', baseline];
  const preview = JSON.parse(run(updater, args));
  assert.deepEqual(preview.conflicts, []);
  assert.equal(readFileSync(join(upgraded.motor, 'VERSION'), 'utf8').trim(), '0.0.1', 'upgrade preview is read-only');
  assert.throws(() => run(updater, [...args, '--apply', '--approve-plan', 'wrong-hash']), /plan-changed/);
  run(updater, [...args, '--apply', '--approve-plan', preview.plan_hash]);
  assert.equal(readFileSync(join(upgraded.motor, 'VERSION'), 'utf8').trim(), version);
  assert.match(readFileSync(join(upgraded.vault, '.cerebro/motor'), 'utf8'), new RegExp(`MOTOR_VERSION=${version.replaceAll('.', '\\.')}`));
  assert.ok(readFileSync(join(upgraded.vault, '.gitignore'), 'utf8').includes('*.owner-only'), 'owner ignore rules survive the installed upgrade');
  for (const [ref, value] of Object.entries(sentinels)) assert.equal(readFileSync(join(upgraded.vault, ref), 'utf8'), value, `preserved ${ref}`);
  const ownerAfter = readFileSync(join(upgraded.vault, 'AGENTS.md'), 'utf8');
  const currentManaged = readFileSync(join(source, 'templates/vault/AGENTS.md'), 'utf8').match(/<!-- CEREBRO:MANAGED:BEGIN -->[\s\S]*?<!-- CEREBRO:MANAGED:END -->/)[0];
  const templatePrefix = readFileSync(join(source, 'templates/vault/AGENTS.md'), 'utf8').split('<!-- CEREBRO:MANAGED:BEGIN -->')[0];
  assert.equal(ownerAfter, `${templatePrefix}${currentManaged}\n${ownerInstructions}`, 'managed block updates while the unmanaged owner tail survives');
  assert.doesNotMatch(ownerAfter, /SYNTHETIC OLD MANAGED RULE/);
  const replay = JSON.parse(run(updater, ['--tag', tag, '--vault', upgraded.vault, '--motor', upgraded.motor]));
  assert.deepEqual(replay.conflicts, []);
  assert.ok(replay.files.every((entry) => entry.action === 'unchanged'), 'second apply is idempotent');
  const backups = readdirSync(join(upgraded.motor, '.cerebro/update-backups')).sort();
  run(updater, ['--tag', tag, '--vault', upgraded.vault, '--motor', upgraded.motor, '--apply', '--approve-plan', replay.plan_hash]);
  assert.deepEqual(readdirSync(join(upgraded.motor, '.cerebro/update-backups')).sort(), backups, 'idempotent replay creates no backup');
  dataFixture(upgraded.vault, 'Upgrade root marker');

  // D8: a pasta única legada segue atualizável por --root, sem ser mais instalada.
  const legacy = join(sandbox, 'legacy instructions engine');
  mkdirSync(legacy);
  applyPlan(legacy, planUpdate(legacy, baseline, 'v0.0.1'));
  const legacyInstructions = '# Entire legacy file belongs to its owner\nKEEP THIS RULE\n';
  write(legacy, 'CLAUDE.md', legacyInstructions);
  const legacyUpdater = join(legacy, 'scripts/update.mjs');
  const legacyArgs = ['--tag', tag, '--root', legacy, '--baseline-dir', baseline];
  const legacyPreview = JSON.parse(run(legacyUpdater, legacyArgs));
  assert.deepEqual(legacyPreview.conflicts, []);
  run(legacyUpdater, [...legacyArgs, '--apply', '--approve-plan', legacyPreview.plan_hash]);
  const legacyAfter = readFileSync(join(legacy, 'CLAUDE.md'), 'utf8');
  assert.ok(legacyAfter.startsWith(legacyInstructions), 'unmarked legacy instructions survive in full');
  assert.ok(legacyAfter.includes('<!-- CEREBRO:MANAGED:BEGIN -->'), 'managed instructions are appended to a legacy file');

  // Negative control: the official installer tolerates legacy manifest omissions;
  // prove the release smoke detects their real HTTP consequence after installation.
  const incomplete = join(sandbox, 'incomplete release package');
  cpSync(source, incomplete, { recursive: true });
  rmSync(join(incomplete, 'console/experience.js'));
  const broken = install('incomplete', incomplete);
  await assert.rejects(installedCli(broken.motor, fresh.vault, (url) => verifyAssets(url, assets)), /packaged asset unavailable or changed: \/experience\.js/);
  await smoke(fresh.motor, fresh.vault, 'Fresh root marker', assets);
  await smoke(upgraded.motor, upgraded.vault, 'Upgrade root marker', assets);
  console.log(`PASS installed Console release: ${assets.size} HTTP assets, fresh split install, preview/hash upgrade, owner preservation, idempotence, --root vault, legacy update, files/metrics/inbox and missing-asset detection`);
} finally { rmSync(sandbox, { recursive: true, force: true }); }
