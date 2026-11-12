#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  activate,
  flushPendingActivation,
  parseActivationArgs,
} from '../.agents/scripts/activate.mjs';

const CLAIM = 'A'.repeat(43);
const CREDENTIAL = 'C'.repeat(43);

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'cerebro-activation-'));
  for (const file of [
    'COMECE-AQUI.md',
    'VERSION',
    'CLAUDE.md',
    '.agents/skills/comecar/SKILL.md',
    '.agents/scripts/ping.mjs',
  ]) {
    const path = join(root, file);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, file === 'VERSION' ? '1.33.0\n' : 'fixture\n');
  }
  return root;
}

function api({ status = 'started', failAt = 0 } = {}) {
  const calls = [];
  const fetchImpl = async (_url, options) => {
    const body = JSON.parse(options.body);
    calls.push(body);
    if (calls.length === failAt) throw new Error('offline');
    if (body.action === 'start') {
      return new Response(JSON.stringify({ ok: true, status, credential: CREDENTIAL }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  return { calls, fetchImpl };
}

function splitFixture(motorVersion = '2.0.0') {
  const base = mkdtempSync(join(tmpdir(), 'cerebro-activation-split-'));
  const motor = join(base, 'motor');
  const vault = join(base, 'notas');
  const put = (root, file, content = 'fixture\n') => {
    const path = join(root, file);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, content);
  };
  for (const file of ['COMECE-AQUI.md', '.agents/scripts/ping.mjs']) put(motor, file);
  put(motor, 'VERSION', `${motorVersion}\n`);
  for (const file of ['AGENTS.md', 'CLAUDE.md', '.agents/skills/comecar/SKILL.md', '.cerebro/bin/cerebro.mjs']) put(vault, file);
  put(vault, '.cerebro/motor', `MOTOR_DIR=${motor}\nMOTOR_VERSION=${motorVersion}\n`);
  return { base, motor, vault };
}

const roots = [];
try {
  assert.deepEqual(
    parseActivationArgs([`--claim=${CLAIM}`, '--runtime=codex']),
    { claim: CLAIM, runtime: 'codex' },
  );
  assert.throws(() => parseActivationArgs(['--claim=curto', '--runtime=codex']), /claim_invalid/);
  assert.throws(() => parseActivationArgs([`--claim=${CLAIM}`, '--runtime=browser']), /runtime_invalid/);

  const freshRoot = fixture();
  roots.push(freshRoot);
  const freshApi = api();
  const fresh = await activate({
    root: freshRoot,
    claim: CLAIM,
    runtime: 'codex',
    fetchImpl: freshApi.fetchImpl,
    endpoint: 'https://activation.test/functions/v1',
  });
  assert.equal(fresh.ok, true);
  assert.equal(fresh.event, 'install_completed');
  assert.deepEqual(freshApi.calls.map((call) => call.action), ['start', 'finish']);
  assert.equal(freshApi.calls[1].event, 'install_completed');
  assert.equal(freshApi.calls[0].claim, CLAIM);
  assert.equal(freshApi.calls[1].credential, CREDENTIAL);
  assert.equal(JSON.stringify(fresh).includes(CLAIM), false);
  assert.equal(JSON.stringify(fresh).includes(CREDENTIAL), false);
  assert.equal(readFileSync(join(freshRoot, '.cerebro/install-credential'), 'utf8').trim(), CREDENTIAL);
  assert.equal(readFileSync(join(freshRoot, '.cerebro/operator-runtime'), 'utf8').trim(), 'codex');
  if (process.platform !== 'win32') {
    assert.equal(statSync(join(freshRoot, '.cerebro/install-credential')).mode & 0o777, 0o600);
    assert.equal(statSync(join(freshRoot, '.cerebro/operator-runtime')).mode & 0o777, 0o600);
  }
  assert.equal(existsSync(join(freshRoot, '.cerebro/runtime')), false);
  assert.equal(existsSync(join(freshRoot, '.cerebro/install-activation-outbox.json')), false);

  const reconnectRoot = fixture();
  roots.push(reconnectRoot);
  const reconnectApi = api({ status: 'reconnected' });
  const reconnected = await activate({
    root: reconnectRoot,
    claim: CLAIM,
    runtime: 'claude-code',
    fetchImpl: reconnectApi.fetchImpl,
  });
  assert.equal(reconnected.event, 'install_reconnected');
  assert.equal(reconnectApi.calls[1].event, 'install_reconnected');

  const retryRoot = fixture();
  roots.push(retryRoot);
  const offlineApi = api({ failAt: 1 });
  const pending = await activate({
    root: retryRoot,
    claim: CLAIM,
    runtime: 'gemini-cli',
    fetchImpl: offlineApi.fetchImpl,
    timeoutMs: 50,
  });
  assert.equal(pending.pending, true);
  assert.equal(existsSync(join(retryRoot, '.cerebro/install-activation-outbox.json')), true);
  if (process.platform !== 'win32') {
    assert.equal(statSync(join(retryRoot, '.cerebro/install-activation-outbox.json')).mode & 0o777, 0o600);
  }

  const recoveredApi = api();
  const recovered = await flushPendingActivation({
    root: retryRoot,
    fetchImpl: recoveredApi.fetchImpl,
  });
  assert.equal(recovered.ok, true);
  assert.equal(recovered.event, 'install_completed');
  assert.equal(existsSync(join(retryRoot, '.cerebro/install-activation-outbox.json')), false);
  assert.deepEqual(recoveredApi.calls.map((call) => call.action), ['start', 'finish']);

  const brokenRoot = fixture();
  roots.push(brokenRoot);
  rmSync(join(brokenRoot, 'CLAUDE.md'));
  const brokenApi = api();
  const broken = await activate({
    root: brokenRoot,
    claim: CLAIM,
    runtime: 'antigravity',
    fetchImpl: brokenApi.fetchImpl,
  });
  assert.equal(broken.ok, false);
  assert.equal(broken.event, 'install_failed');
  assert.equal(brokenApi.calls[1].reason_code, 'package_incomplete');

  // Instalação em duas pastas: identidade e credencial no vault, versão do motor, arquivos por pasta.
  const split = splitFixture();
  roots.push(split.base);
  const splitApi = api();
  const splitResult = await activate({
    root: split.vault,
    motor: split.motor,
    claim: CLAIM,
    runtime: 'claude-code',
    fetchImpl: splitApi.fetchImpl,
  });
  assert.equal(splitResult.ok, true);
  assert.equal(splitResult.event, 'install_completed');
  assert.equal(splitApi.calls[0].version, '2.0.0');
  assert.equal(readFileSync(join(split.vault, '.cerebro/install-credential'), 'utf8').trim(), CREDENTIAL);
  assert.equal(readFileSync(join(split.vault, '.cerebro/operator-runtime'), 'utf8').trim(), 'claude-code');
  assert.match(readFileSync(join(split.vault, '.cerebro/id'), 'utf8').trim(), /^[0-9a-f-]{36}$/);
  assert.equal(existsSync(join(split.motor, '.cerebro')), false, 'o motor não recebe identidade');
  assert.equal(existsSync(join(split.vault, 'VERSION')), false, 'o vault não carrega VERSION');

  const noMotorVersion = splitFixture();
  roots.push(noMotorVersion.base);
  rmSync(join(noMotorVersion.motor, 'VERSION'));
  const noMotorApi = api();
  const noMotor = await activate({ root: noMotorVersion.vault, motor: noMotorVersion.motor, claim: CLAIM, runtime: 'codex', fetchImpl: noMotorApi.fetchImpl });
  assert.equal(noMotor.event, 'install_failed');
  assert.equal(noMotorApi.calls[1].reason_code, 'package_incomplete');

  const noLauncher = splitFixture();
  roots.push(noLauncher.base);
  rmSync(join(noLauncher.vault, '.cerebro/bin/cerebro.mjs'));
  const noLauncherApi = api();
  const noLauncherResult = await activate({ root: noLauncher.vault, motor: noLauncher.motor, claim: CLAIM, runtime: 'codex', fetchImpl: noLauncherApi.fetchImpl });
  assert.equal(noLauncherResult.event, 'install_failed');

  // ping.mjs: vault pelo ambiente, versão do motor, identidade gravada no vault.
  const pingFixture = splitFixture();
  roots.push(pingFixture.base);
  const received = [];
  const server = createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      received.push(JSON.parse(body));
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end('{"ok":true}');
    });
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const repoPing = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), '.agents', 'scripts', 'ping.mjs');
  const env = { ...process.env, CEREBRO_INSTALL_ROOT: pingFixture.vault, CEREBRO_API_URL: `http://127.0.0.1:${server.address().port}` };
  delete env.CEREBRO_TELEMETRY;
  const pingStatus = await new Promise((done) => {
    const child = spawn(process.execPath, [repoPing, 'sessao'], { env, stdio: 'ignore' });
    child.on('close', done);
  });
  server.close();
  assert.equal(pingStatus, 0);
  const pingEvent = received.find((item) => item.event === 'instalou' || item.event === 'sessao');
  assert.ok(pingEvent, 'ping chegou ao receptor');
  assert.equal(pingEvent.version, readFileSync(join(dirname(dirname(repoPing)), '..', 'VERSION'), 'utf8').trim(), 'versão vem do motor que executa o script');
  assert.equal(pingEvent.install_id, readFileSync(join(pingFixture.vault, '.cerebro/id'), 'utf8').trim());
  assert.equal(existsSync(join(pingFixture.motor, '.cerebro')), false);

  console.log('✓ ativação local: instalação, reconexão, retry, falha sanitizada e vault separado do motor');
} finally {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
}
