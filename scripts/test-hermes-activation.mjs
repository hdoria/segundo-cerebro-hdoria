#!/usr/bin/env node

import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { mock } from 'node:test';
import {
  createHermesActivationController,
  hermesActivationInternals,
  HERMES_PIN,
} from './lib/hermes-activation.mjs';
import { createConsoleServer } from './console-server.mjs';
import { createHermesConfigSnapshot, discardHermesConfigSnapshot, readHermesStatus } from './lib/hermes-runtime.mjs';

const sandbox = mkdtempSync(join(tmpdir(), 'hermes-activation-'));
const brain = join(sandbox, 'brain');
const hermesHome = join(sandbox, '.hermes');
const configPath = join(hermesHome, 'config.yaml');
const envPath = join(hermesHome, '.env');

function write(path, value) {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, value);
}

function result(stdout = '', status = 0) {
  return { status, stdout, stderr: '', error: null };
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function waitFor(read, predicate, timeout = 2_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const value = await read();
    if (await predicate(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('test-timeout');
}

function fakeChild(onStart) {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = () => { child.emit('close', 130); };
  queueMicrotask(() => onStart(child));
  return child;
}

try {
  mkdirSync(brain, { recursive: true });
  mkdirSync(join(brain, '.cerebro'), { recursive: true });
  mkdirSync(join(brain, '.agents', 'skills'), { recursive: true });
  write(join(brain, 'VERSION'), 'fixture\n');
  write(join(brain, 'COMECE-AQUI.md'), '# Fixture\n');
  mkdirSync(hermesHome, { recursive: true });
  write(configPath, `model:\n  provider: openai-codex\nterminal:\n  cwd: "${brain}"\nskills:\n  external_dirs:\n    - "${join(brain, '.agents', 'skills')}"\n`);
  write(envPath, 'UNRELATED=preserved\n');

  assert.equal(hermesActivationInternals.versionAtLeast('Hermes Agent v0.18.2', HERMES_PIN.minimumVersion), true);
  assert.equal(hermesActivationInternals.versionAtLeast('Hermes Agent v0.17.9', HERMES_PIN.minimumVersion), false);
  assert.deepEqual(hermesActivationInternals.installerCommand('win32', 'C:\\Temp\\install.ps1').args, [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'C:\\Temp\\install.ps1',
    '-NonInteractive', '-SkipSetup', '-Commit', HERMES_PIN.commit,
  ]);
  assert.equal(hermesActivationInternals.installerCommand('linux', '/tmp/install.sh').command, '/bin/bash');
  assert.match(HERMES_PIN.posix.url, new RegExp(`${HERMES_PIN.commit}/scripts/install\\.sh$`));
  assert.match(HERMES_PIN.win32.url, new RegExp(`${HERMES_PIN.commit}/scripts/install\\.ps1$`));
  const parsed = hermesActivationInternals.parseOAuthOutput('', 'Open https://auth.openai.com/codex/device\nEnter this code:\nABCD-EFGH\n');
  assert.equal(parsed.verification, 'https://auth.openai.com/codex/device');
  assert.equal(parsed.userCode, 'ABCD-EFGH');
  assert.equal(hermesActivationInternals.safeDisplay({ username: 'owner<script>' }), '@ownerscript');

  let authenticated = false;
  let gatewayRunning = true;
  const calls = [];
  function runner(command, args, options) {
    calls.push({ command, args, options });
    const key = args.join(' ');
    if (key === '--version') return result('Hermes Agent v0.18.2\n');
    if (key === 'config path') return result(`${configPath}\n`);
    if (key === 'config env-path') return result(`${envPath}\n`);
    if (key === 'skills trust --help') return result('', 2);
    if (key === 'auth status openai-codex') return result(authenticated ? 'openai-codex: logged in\n' : 'openai-codex: logged out (No Codex credentials stored.)\n');
    if (key === 'gateway status') return result(`Service installed\nStatus: ${gatewayRunning ? 'running' : 'stopped'}\n`);
    if (key === 'gateway stop') { gatewayRunning = false; return result('stopped\n'); }
    if (key === 'gateway restart' || key.startsWith('gateway install')) { gatewayRunning = true; return result('running\n'); }
    if (key === 'doctor') return result('all checks passed\n');
    return result('ok\n');
  }

  const spawnCalls = [];
  function spawnProcess(command, args, options) {
    spawnCalls.push({ command, args, options });
    return fakeChild((child) => {
      child.stdout.emit('data', 'To continue:\nhttps://auth.openai.com/codex/device\nEnter this code:\nWXYZ-1234\n');
      authenticated = true;
      child.emit('close', 0);
    });
  }

  const chainedController = createHermesActivationController({
    root: brain,
    hermesRunner: runner,
    spawnProcess,
  });
  const chainedStart = chainedController.startPrepare();
  assert.match(chainedStart.action.id, /^[A-Za-z0-9_-]{20,}$/);
  await waitFor(() => chainedController.status(), (value) => value.action.status === 'succeeded');
  assert.equal(spawnCalls.length, 1, 'preparar precisa encadear o OAuth quando ele ainda não existe');
  chainedController.dispose();
  authenticated = false;
  spawnCalls.length = 0;

  const oauthController = createHermesActivationController({
    root: brain,
    hermesRunner: runner,
    spawnProcess,
  });
  assert.equal(oauthController.status().phase, 'codex-login');
  const oauthStart = oauthController.startCodex();
  assert.equal(oauthStart.action.status, 'running');
  const oauthDone = await waitFor(() => oauthController.status(), (value) => value.action.status === 'succeeded');
  assert.equal(oauthDone.action.verification_url, 'https://auth.openai.com/codex/device');
  assert.equal(oauthDone.action.user_code, 'WXYZ-1234');
  assert.equal(spawnCalls[0].command, 'hermes');
  assert.deepEqual(spawnCalls[0].args, ['auth', 'add', 'openai-codex', '--type', 'oauth', '--label', 'Cérebro hdoria']);
  assert.equal(spawnCalls[0].options.shell, false);
  assert(calls.some((call) => call.args.join(' ') === 'config set model.provider openai-codex'));
  assert(calls.some((call) => call.args.length === 4 && call.args[0] === 'config' && call.args[2] === 'model.default' && call.args[3] === ''));

  const token = `123456789:${'x'.repeat(32)}`;
  const updates = [
    [],
    [{ update_id: 10, message: { text: '/start', chat: { id: -100, type: 'group' }, from: { id: 111, username: 'group_user' } } },
      { update_id: 11, message: { text: '/start', chat: { id: 111, type: 'private' }, from: { id: 111, username: 'wrong_owner' } } }],
    [{ update_id: 12, message: { text: '/start', chat: { id: 222, type: 'private' }, from: { id: 222, username: 'right_owner' } } }],
  ];
  const telegramRequests = [];
  async function telegramFetch(url, options) {
    telegramRequests.push({ url, options });
    if (String(url).endsWith('/getMe')) return jsonResponse({ ok: true, result: { id: 999, username: 'brain_test_bot' } });
    if (String(url).endsWith('/getUpdates')) return jsonResponse({ ok: true, result: updates.shift() || [] });
    throw new Error('unexpected-request');
  }

  const telegramController = createHermesActivationController({
    root: brain,
    hermesRunner: runner,
    fetcher: telegramFetch,
  });
  const telegramStart = telegramController.startTelegram(token);
  assert.equal(JSON.stringify(telegramStart).includes(token), false);
  assert.throws(() => telegramController.startPrepare(), /activation-busy/);
  const firstCandidate = await waitFor(() => telegramController.status(), (value) => value.action.status === 'awaiting-confirmation');
  assert.equal(firstCandidate.bot.owner_candidate_display, '@wrong_owner');
  assert.equal(JSON.stringify(firstCandidate).includes('111'), false);
  telegramController.rejectOwner(firstCandidate.action.id);
  const secondCandidate = await waitFor(() => telegramController.status(), (value) => value.action.status === 'awaiting-confirmation' && value.bot.owner_candidate_display === '@right_owner');
  assert.equal(JSON.stringify(secondCandidate).includes('222'), false);
  telegramController.confirmOwner(secondCandidate.action.id);
  const ready = await waitFor(() => telegramController.status(), (value) => value.phase === 'ready');
  assert.equal(ready.bot.connected, true);
  assert.equal(JSON.stringify(ready).includes(token), false);
  assert.equal(JSON.stringify(ready).includes('222'), false);
  const env = readFileSync(envPath, 'utf8');
  assert.match(env, /UNRELATED=preserved/);
  assert.match(env, /TELEGRAM_ALLOWED_USERS=222/);
  assert.match(env, /TELEGRAM_HOME_CHANNEL=222/);
  assert.match(env, /GATEWAY_ALLOW_ALL_USERS=false/);
  assert.match(env, /TELEGRAM_ALLOW_ALL_USERS=false/);
  assert(calls.some((call) => call.args.join(' ') === 'gateway stop'));
  assert(calls.some((call) => call.args.join(' ') === 'gateway restart'));
  assert.equal(calls.some((call) => call.args.join(' ').includes(token)), false);
  assert(telegramRequests.every((request) => request.options.method === 'POST'));

  const resumedController = createHermesActivationController({
    root: brain,
    hermesRunner: runner,
    fetcher: telegramFetch,
  });
  const resumedInitial = resumedController.status();
  assert.equal(resumedInitial.phase, 'ready');
  assert.equal(resumedInitial.bot.connected, true);
  const resumed = await waitFor(() => resumedController.status(), (value) => value.bot.username === 'brain_test_bot');
  assert.equal(resumed.bot.username, 'brain_test_bot');
  assert.equal(JSON.stringify(resumed).includes(token), false);
  resumedController.dispose();

  const configSnapshot = createHermesConfigSnapshot(brain, { runner });
  assert.notEqual(dirname(configSnapshot.backupPath), dirname(envPath));
  assert.equal(existsSync(configSnapshot.backupPath), true);
  if (process.platform !== 'win32') assert.equal(statSync(configSnapshot.backupPath).mode & 0o777, 0o600);
  discardHermesConfigSnapshot(configSnapshot);
  assert.equal(existsSync(configSnapshot.backupPath), false);

  const beforeRollback = readFileSync(envPath, 'utf8');
  const rollbackCalls = [];
  function rollbackRunner(command, args, options) {
    rollbackCalls.push(args.join(' '));
    if (args.join(' ') === 'doctor') return result('attention\n', 1);
    return runner(command, args, options);
  }
  const rollbackUpdates = [
    [],
    [{ update_id: 20, message: { text: '/start', chat: { id: 444, type: 'private' }, from: { id: 444, username: 'rollback_owner' } } }],
  ];
  const rollbackFetch = async (url) => String(url).endsWith('/getMe')
    ? jsonResponse({ ok: true, result: { id: 999, username: 'rollback_bot' } })
    : jsonResponse({ ok: true, result: rollbackUpdates.shift() || [] });
  const rollbackController = createHermesActivationController({ root: brain, hermesRunner: rollbackRunner, fetcher: rollbackFetch });
  rollbackController.startTelegram(token);
  const rollbackCandidate = await waitFor(() => rollbackController.status(), (value) => value.action.status === 'awaiting-confirmation');
  rollbackController.confirmOwner(rollbackCandidate.action.id);
  const rolledBack = await waitFor(() => rollbackController.status(), (value) => value.action.status === 'error');
  assert.equal(rolledBack.action.error_code, 'hermes-doctor-attention');
  assert.equal(readFileSync(envPath, 'utf8'), beforeRollback);
  assert(rollbackCalls.filter((value) => value === 'gateway restart').length >= 2, 'falha precisa restaurar o serviço anterior');

  for (const wasRunning of [true, false]) {
    let ownerClock = 0;
    gatewayRunning = wasRunning;
    const beforeExpiry = readFileSync(envPath, 'utf8');
    const expiryUpdates = [
      [],
      [{ update_id: 25, message: { text: '/start', chat: { id: 555, type: 'private' }, from: { id: 555, username: 'expiring_owner' } } }],
    ];
    const expiryFetch = async (url) => String(url).endsWith('/getMe')
      ? jsonResponse({ ok: true, result: { id: 999, username: 'expiring_bot' } })
      : jsonResponse({ ok: true, result: expiryUpdates.shift() || [] });
    await new Promise((resolve) => setImmediate(resolve));
    mock.timers.enable({ apis: ['setTimeout'] });
    const expiryController = createHermesActivationController({
      root: brain, hermesRunner: runner, fetcher: expiryFetch, clock: () => ownerClock,
    });
    try {
      const started = expiryController.startTelegram(token);
      let candidate;
      for (let attempt = 0; attempt < 50; attempt += 1) {
        await new Promise((resolve) => setImmediate(resolve));
        candidate = expiryController.status();
        if (candidate.action.status === 'awaiting-confirmation') break;
      }
      assert.equal(candidate.action.status, 'awaiting-confirmation');
      assert.equal(gatewayRunning, false, 'a identificação pausa o gateway');
      ownerClock = 10 * 60 * 1000;
      mock.timers.tick(10 * 60 * 1000);
      assert.equal(gatewayRunning, wasRunning, 'expirar sem polling precisa restaurar o estado anterior do gateway');
      const expired = expiryController.status();
      assert.equal(expired.action.status, 'error', 'confirmação humana também precisa expirar');
      assert.equal(expired.action.error_code, 'telegram-owner-timeout');
      assert.equal(expired.action.expires_at, null);
      assert.equal(expired.bot.owner_candidate_display, null);
      assert.equal(readFileSync(envPath, 'utf8'), beforeExpiry, 'expiração não pode persistir o token candidato');
      assert.equal(JSON.stringify(expired).includes(token), false);
      assert.throws(() => expiryController.confirmOwner(started.action.id), /activation-action-invalid/);
      assert.throws(() => expiryController.rejectOwner(started.action.id), /activation-action-invalid/);
    } finally {
      expiryController.dispose();
      await new Promise((resolve) => setImmediate(resolve));
      mock.timers.reset();
    }
  }

  let delayedClock = 0;
  let finishDelayedUpdates;
  let delayedRequests = 0;
  gatewayRunning = true;
  const delayedFetch = async (url) => {
    if (String(url).endsWith('/getMe')) return jsonResponse({ ok: true, result: { id: 999, username: 'delayed_bot' } });
    if (delayedRequests++ === 0) return jsonResponse({ ok: true, result: [] });
    return new Promise((resolve) => { finishDelayedUpdates = resolve; });
  };
  const delayedController = createHermesActivationController({
    root: brain, hermesRunner: runner, fetcher: delayedFetch, clock: () => delayedClock,
  });
  try {
    const delayedStart = delayedController.startTelegram(token);
    for (let attempt = 0; attempt < 50 && !finishDelayedUpdates; attempt += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    assert.equal(typeof finishDelayedUpdates, 'function');
    delayedClock = 10 * 60 * 1000;
    assert.equal(delayedController.status().action.error_code, 'telegram-owner-timeout');
    finishDelayedUpdates(jsonResponse({ ok: true, result: [
      { update_id: 26, message: { text: '/start', chat: { id: 666, type: 'private' }, from: { id: 666, username: 'late_owner' } } },
    ] }));
    await new Promise((resolve) => setImmediate(resolve));
    const afterLateResponse = delayedController.status();
    assert.equal(afterLateResponse.action.status, 'error', 'resposta tardia não pode ressuscitar a ativação expirada');
    assert.equal(afterLateResponse.action.error_code, 'telegram-owner-timeout');
    assert.equal(afterLateResponse.bot.owner_candidate_display, null);
    assert.equal(gatewayRunning, true);
    assert.throws(() => delayedController.confirmOwner(delayedStart.action.id), /activation-action-invalid/);
  } finally {
    delayedController.dispose();
  }

  let missingCalls = 0;
  const missingRunner = (_command, args) => {
    missingCalls += 1;
    if (args.join(' ') === '--version') return { status: null, stdout: '', stderr: '', error: { code: 'ENOENT' } };
    return result('', 1);
  };
  const checksumController = createHermesActivationController({
    root: brain,
    hermesRunner: missingRunner,
    fetcher: async () => new Response('not the official installer', { status: 200 }),
    platform: 'darwin',
  });
  checksumController.startPrepare();
  const checksumFailure = await waitFor(() => checksumController.status(), (value) => value.action.status === 'error');
  assert.equal(checksumFailure.action.error_code, 'hermes-installer-checksum-failed');
  assert(missingCalls > 0);

  const apiUpdates = [
    [],
    [{ update_id: 30, message: { text: '/start', chat: { id: 333, type: 'private' }, from: { id: 333, username: 'api_owner' } } }],
  ];
  const apiFetch = async (url) => String(url).endsWith('/getMe')
    ? jsonResponse({ ok: true, result: { id: 999, username: 'api_test_bot' } })
    : jsonResponse({ ok: true, result: apiUpdates.shift() || [] });
  const serverInstance = createConsoleServer({
    root: brain,
    sessionToken: 'activation-session',
    csrfToken: 'activation-csrf',
    hermesRunner: runner,
    hermesFetch: apiFetch,
  });
  await new Promise((resolve) => serverInstance.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${serverInstance.server.address().port}`;
  const cookie = 'cerebro_console_session=activation-session';
  const post = async (path, value, origin = base) => {
    const response = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json', 'X-Cerebro-CSRF': 'activation-csrf' },
      body: JSON.stringify({ ...value, confirm: true }),
    });
    return { status: response.status, value: await response.json() };
  };
  const deniedOrigin = await post('/api/integrations/hermes/activation/telegram/start', { token }, 'https://attacker.example');
  assert.equal(deniedOrigin.status, 403);
  const apiStart = await post('/api/integrations/hermes/activation/telegram/start', { token });
  assert.equal(apiStart.status, 202);
  assert.equal(JSON.stringify(apiStart.value).includes(token), false);
  const apiCandidate = await waitFor(async () => {
    const response = await fetch(`${base}/api/integrations/hermes/activation`, { headers: { Cookie: cookie } });
    return response.json();
  }, async (promise) => (await promise).action?.status === 'awaiting-confirmation');
  const candidateState = await apiCandidate;
  assert.equal(candidateState.bot.owner_candidate_display, '@api_owner');
  assert.equal(JSON.stringify(candidateState).includes('333'), false);
  const stale = await post('/api/integrations/hermes/activation/owner/confirm', { action_id: 'stale-action' });
  assert.equal(stale.status, 400);
  const accepted = await post('/api/integrations/hermes/activation/owner/confirm', { action_id: candidateState.action.id });
  assert.equal(accepted.status, 202);
  const apiReady = await waitFor(async () => {
    const response = await fetch(`${base}/api/integrations/hermes/activation`, { headers: { Cookie: cookie } });
    return response.json();
  }, async (promise) => (await promise).phase === 'ready');
  assert.equal((await apiReady).phase, 'ready');
  const replay = await post('/api/integrations/hermes/activation/owner/confirm', { action_id: candidateState.action.id });
  assert.equal(replay.status, 400);
  await new Promise((resolve) => serverInstance.server.close(resolve));

  oauthController.dispose();
  telegramController.dispose();
  checksumController.dispose();
  rollbackController.dispose();

  const gatewayFor = (text) => readHermesStatus(brain, { runner: (command, args, options) => (args.join(' ') === 'gateway status' ? result(text) : runner(command, args, options)) }).gateway;
  assert.deepEqual(gatewayFor('✗ Gateway is not running\n\nTo start:\n  hermes gateway install\n'), { installed: false, running: false }, 'sem serviço não conta como instalado');
  assert.deepEqual(gatewayFor('✓ Gateway is running (PID: 42)\n  (Running manually, not as a system service)\n'), { installed: false, running: true });
  assert.deepEqual(gatewayFor('Launchd plist: /x.plist\n✓ Gateway is supervised by launchd (PID 42)\n'), { installed: true, running: true });
  assert.deepEqual(gatewayFor('Launchd plist: /x.plist\n⚠ Gateway service is registered but launchd is not supervising it\n✗ No fallback process is running\n'), { installed: true, running: false });
  console.log('✓ Ativação Hermes usa OAuth sanitizado, identifica /start e fecha Telegram em allowlist');
} finally {
  rmSync(sandbox, { recursive: true, force: true });
}
