#!/usr/bin/env node
// Fase 1 do Hermes em outra máquina: escolher o destino e ler o estado remoto.
// Nada aqui escreve na máquina remota; o único comando é um script fixo lido pelo ssh.
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createConsoleServer } from './console-server.mjs';
import {
  REMOTE_PROBE_SCRIPT,
  classifySshFailure,
  listSshHosts,
  parseRemoteStatus,
  readHermesTarget,
  readRemoteHermesStatus,
  testSshConnection,
  validateHermesTarget,
} from './lib/hermes-remote.mjs';

const sandbox = mkdtempSync(join(tmpdir(), 'hermes-remote-'));
const brain = join(sandbox, 'meu-cerebro');
mkdirSync(join(brain, '.cerebro'), { recursive: true });
writeFileSync(join(brain, 'VERSION'), 'fixture\n');
writeFileSync(join(brain, 'COMECE-AQUI.md'), '# Fixture\n');

try {
  const sshConfig = [
    '# hosts do tailscale',
    'Host github.com',
    '  HostName github.com',
    'Host popcode-server-01 popcode-server-02',
    '  User popcode',
    'Host *',
    '  ServerAliveInterval 30',
    'Host dev-?? *.internal',
    'host popcode-server-01',
    'Host mac-mini # comentario',
    '  Hostname 100.1.2.3',
    'Host bad;rm',
  ].join('\n');
  assert.deepEqual(listSshHosts(sshConfig), ['popcode-server-01', 'popcode-server-02', 'mac-mini']);
  assert.deepEqual(listSshHosts(''), []);
  assert.deepEqual(listSshHosts(undefined), []);

  assert.deepEqual(validateHermesTarget({ kind: 'local' }, { brainRoot: brain }), { kind: 'local' });
  assert.deepEqual(
    validateHermesTarget({ kind: 'remote', host: 'popcode-server-01' }, { brainRoot: brain }),
    { kind: 'remote', host: 'popcode-server-01', profile: 'cerebro', brain_path: '~/meu-cerebro' },
  );
  assert.deepEqual(
    validateHermesTarget({ kind: 'remote', host: 'a.b_c-1', profile: 'tron', brain_path: '/srv/second-brain' }, { brainRoot: brain }),
    { kind: 'remote', host: 'a.b_c-1', profile: 'tron', brain_path: '/srv/second-brain' },
  );
  const bad = [
    { kind: 'remote', host: '-oProxyCommand=x' },
    { kind: 'remote', host: 'a b' },
    { kind: 'remote', host: '' },
    { kind: 'remote', host: 'x'.repeat(65) },
    { kind: 'remote', host: 'ok', profile: 'Hugo' },
    { kind: 'remote', host: 'ok', profile: 'a-b' },
    { kind: 'remote', host: 'ok', profile: 'a'.repeat(33) },
    { kind: 'remote', host: 'ok', brain_path: 'relative/path' },
    { kind: 'remote', host: 'ok', brain_path: 'meu-cerebro' },
    { kind: 'remote', host: 'ok', brain_path: '/' },
    { kind: 'remote', host: 'ok', brain_path: '~/../etc' },
    { kind: 'remote', host: 'ok', brain_path: '../x' },
    { kind: 'remote', host: 'ok', brain_path: '/a/../b' },
    { kind: 'remote', host: 'ok', brain_path: '~/a b' },
    { kind: 'remote', host: 'ok', brain_path: '~/a;rm' },
    { kind: 'remote', host: 'ok', brain_path: `~/${'a'.repeat(201)}` },
    { kind: 'other' },
    null,
  ];
  for (const input of bad) {
    assert.throws(() => validateHermesTarget(input, { brainRoot: brain }), /hermes-target-invalid/, JSON.stringify(input));
  }

  const target = { kind: 'remote', host: 'popcode-server-01', profile: 'tron', brain_path: '~/second-brain' };
  const stdout = [
    '⚠ A previous `hermes update` pulled new code but did not restart running gateways.',
    '  Gateways may still be serving pre-update modules (mixed sys.modules).',
    'brain_expanded=/Users/popcode/second-brain',
    'brain_exists=true',
    'brain_is_git=true',
    'hermes_installed=true',
    '⚠ ruido=true',
    'hermes_version=Hermes Agent v0.22.4 (2026.9.24) · stable',
    'profile_exists=true',
    'config_cwd=/Users/popcode/second-brain/',
    'skills_trusted=true',
    'codex_authenticated=true',
    'gateway_installed=true',
    'gateway_running=true',
    'telegram_token_configured=true',
    'telegram_allowlist_configured=true',
    'telegram_allow_all_disabled=false',
    'TELEGRAM_BOT_TOKEN=123456789:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'telegram_token=123456789:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'desconhecida=true',
    'gateway_running=maybe',
  ].join('\n');
  const parsed = parseRemoteStatus(stdout, target, { now: new Date('2026-10-22T12:00:00.000Z') });
  assert.deepEqual(parsed, {
    target,
    reachable: true,
    checked_at: '2026-10-22T12:00:00.000Z',
    installed: true,
    version: 'Hermes Agent v0.22.4 (2026.9.24) · stable',
    profile_exists: true,
    brain_exists: true,
    brain_is_git: true,
    codex_authenticated: true,
    project_bound: true,
    skills_trusted: true,
    telegram: { token_configured: true, allowlist_configured: true, allow_all_disabled: false },
    gateway: { installed: true, running: true },
  });
  assert.ok(!/AAAAAAAA|123456789/.test(JSON.stringify(parsed)), 'valor de .env nunca sai');
  assert.equal(parseRemoteStatus(stdout.replace('config_cwd=/Users/popcode/second-brain/', 'config_cwd=/outro'), target).project_bound, false);
  const tildeCwd = stdout.replace('config_cwd=/Users/popcode/second-brain/', 'config_cwd=~/second-brain').replace('brain_exists=true', 'brain_exists=true\nhome=/Users/popcode');
  assert.equal(parseRemoteStatus(tildeCwd, target).project_bound, true, 'cwd com ~/ é expandido antes de comparar');
  assert.equal(parseRemoteStatus(stdout.replace('config_cwd=/Users/popcode/second-brain/', 'config_cwd=~/second-brain'), target).project_bound, false, 'sem home não há como expandir');
  assert.equal(parseRemoteStatus('hermes_installed=false\nbrain_exists=false', target).installed, false);
  assert.equal(parseRemoteStatus('hermes_installed=false', target).version, null);
  const garbage = parseRemoteStatus('Permission denied\nnada util', target);
  assert.equal(garbage.reachable, false);
  assert.equal(garbage.reason_code, 'remote-output-invalid');

  assert.ok(!/AAAA|\$\{TELEGRAM_BOT_TOKEN\}|echo "?\$tok|echo "?\$users/.test(REMOTE_PROBE_SCRIPT), 'o script nunca imprime valor do .env');
  assert.ok(!/\b(rm|mv|cp|mkdir|git (clone|pull|fetch|checkout)|install|restart|tee)\b/.test(REMOTE_PROBE_SCRIPT.replace(/hermes_|brain_|gateway|profile_exists|skills_trusted/g, '')), 'o script só lê');

  const expectedArgv = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', 'popcode-server-01', 'bash', '-s', '--', 'tron', '~/second-brain'];
  const spawnCalls = [];
  const fakeSpawn = (behavior) => (command, args, options) => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stdin = Object.assign(new EventEmitter(), { received: '', end(value) { this.received += value; } });
    child.kill = () => { child.killed = true; };
    spawnCalls.push({ command, args, shell: options.shell, child });
    behavior(child);
    return child;
  };
  const fixedClock = () => new Date('2026-10-22T12:00:00.000Z');

  const ok = await readRemoteHermesStatus(target, {
    spawn: fakeSpawn((child) => setImmediate(() => { child.stdout.emit('data', stdout); child.emit('close', 0); })),
    clock: fixedClock,
  });
  assert.equal(ok.reachable, true);
  assert.equal(ok.installed, true);
  assert.equal(spawnCalls.length, 1, 'exatamente uma chamada ssh');
  assert.equal(spawnCalls[0].command, 'ssh');
  assert.deepEqual(spawnCalls[0].args, expectedArgv);
  assert.equal(spawnCalls[0].shell, false);
  assert.equal(spawnCalls[0].child.stdin.received, REMOTE_PROBE_SCRIPT);

  const unreachable = await readRemoteHermesStatus(target, {
    spawn: fakeSpawn((child) => setImmediate(() => child.emit('close', 255))), clock: fixedClock,
  });
  assert.equal(unreachable.reachable, false);
  assert.equal(unreachable.reason_code, 'ssh-unreachable');
  assert.equal(unreachable.installed, false);
  assert.deepEqual(unreachable.target, target);

  const missing = await readRemoteHermesStatus(target, {
    spawn: fakeSpawn((child) => setImmediate(() => child.emit('error', Object.assign(new Error('spawn ssh ENOENT'), { code: 'ENOENT' })))), clock: fixedClock,
  });
  assert.equal(missing.reachable, false);
  assert.equal(missing.reason_code, 'ssh-missing');

  const failed = await readRemoteHermesStatus(target, {
    spawn: fakeSpawn((child) => setImmediate(() => child.emit('close', 1))), clock: fixedClock,
  });
  assert.equal(failed.reason_code, 'ssh-command-failed');

  // O timer da sonda é unref; um filho real mantém o loop vivo, então o fake faz o mesmo.
  const hanging = fakeSpawn((child) => { const alive = setTimeout(() => {}, 5000); child.kill = () => { child.killed = true; clearTimeout(alive); }; });
  const timedOut = await readRemoteHermesStatus(target, { spawn: hanging, timeoutMs: 20, clock: fixedClock });
  assert.equal(timedOut.reachable, false);
  assert.equal(timedOut.reason_code, 'ssh-timeout');
  assert.equal(spawnCalls.at(-1).child.killed, true, 'timeout mata o filho');

  const classifyCases = [
    ['', 0, null, 'ok'],
    ['user@h: Permission denied (publickey,password).', 255, null, 'auth-required'],
    ['ssh: Could not resolve hostname nope: nodename nor servname provided, or not known', 255, null, 'host-unknown'],
    ['ssh: Could not resolve hostname nope: Name or service not known', 255, null, 'host-unknown'],
    ['Host key verification failed.', 255, null, 'host-key-unconfirmed'],
    ['@@@ WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED! @@@\nHost key verification failed.', 255, null, 'host-key-changed'],
    ['ssh: connect to host 10.0.0.9 port 22: Operation timed out', 255, null, 'offline'],
    ['ssh: connect to host 10.0.0.9 port 22: Connection timed out', 255, null, 'offline'],
    ['ssh: connect to host 10.0.0.9 port 22: No route to host', 255, null, 'offline'],
    ['ssh: connect to host 10.0.0.9 port 22: Connection refused', 255, null, 'offline'],
    ['', null, Object.assign(new Error('spawn ssh ENOENT'), { code: 'ENOENT' }), 'ssh-missing'],
    ['', null, Object.assign(new Error('t'), { code: 'ETIMEDOUT' }), 'timeout'],
    ['kex_exchange_identification: Connection closed by remote host', 255, null, 'refused'],
    ['Connection closed by remote host', 255, null, 'refused'],
    ['ssh: connect to host 10.0.0.9 port 22: Network is unreachable', 255, null, 'offline'],
    ['Connection reset by peer', 255, null, 'offline'],
    ['ssh: Could not resolve hostname nope: Temporary failure in name resolution', 255, null, 'host-unknown'],
    ['ssh: Temporary failure in name resolution', 255, null, 'host-unknown'],
    ['', 1, null, 'failed'],
    [undefined, 255, null, 'failed'],
  ];
  for (const [stderr, exitCode, error, expected] of classifyCases) {
    assert.equal(classifySshFailure(stderr, exitCode, error), expected, `${stderr} / ${exitCode}`);
  }

  const sshTestCalls = [];
  const sshTestSpawn = (behavior) => (command, args, options) => {
    const child = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => { child.killed = true; };
    sshTestCalls.push({ command, args, shell: options.shell, child });
    behavior(child);
    return child;
  };
  assert.equal(await testSshConnection('popcode-server-02', { spawn: sshTestSpawn((child) => setImmediate(() => child.emit('close', 0))) }), 'ok');
  assert.equal(sshTestCalls[0].command, 'ssh');
  assert.deepEqual(sshTestCalls[0].args, ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', 'popcode-server-02', 'true']);
  assert.equal(sshTestCalls[0].shell, false);

  if (process.platform !== 'win32') {
    const fakeHermes = `#!/bin/bash
fx="$HOME/fx"
[ -f "$fx/log" ] && true
case "$*" in
  "--version") cat "$fx/version" ;;
  "profile list") cat "$fx/profiles" ;;
  "-p "*" config path") echo "$HOME/cfg.yaml" ;;
  "-p "*" config env-path") echo "$HOME/.env" ;;
  "-p "*" auth status openai-codex") cat "$fx/auth" ;;
  "-p "*" gateway status") cat "$fx/gateway"; exit "$(cat "$fx/gateway_rc")" ;;
  *) exit 1 ;;
esac
`;
    const tokenValue = '123456789:AbCdEfGhIjKlMnOpQrStUvWxYz0123456789';
    const runProbe = ({ hermes = true, profileLine = ' ◆cerebro   gpt-5   running', gatewayText = 'Gateway service is running', gatewayRc = 0, dotenv, auth = 'openai-codex: logged in' } = {}) => {
      const home = mkdtempSync(join(sandbox, 'home-'));
      const bin = mkdtempSync(join(sandbox, 'bin-'));
      mkdirSync(join(home, 'fx'));
      mkdirSync(join(home, 'brain'));
      assert.equal(spawnSync('git', ['init', '-q', join(home, 'brain')]).status, 0);
      writeFileSync(join(home, 'fx', 'version'), 'Hermes Agent v0.22.4 (2026.9.24) · stable\n');
      writeFileSync(join(home, 'fx', 'profiles'), `  Profile   Model\n${profileLine}\n  other     gpt-5\n`);
      writeFileSync(join(home, 'fx', 'gateway'), `${gatewayText}\n`);
      writeFileSync(join(home, 'fx', 'gateway_rc'), `${gatewayRc}\n`);
      writeFileSync(join(home, 'fx', 'auth'), `${auth}\n`);
      writeFileSync(join(home, 'cfg.yaml'), `terminal:\n  cwd: ${home}/brain\nskills:\n  trusted_project_dirs:\n    - ${home}/brain\n`);
      writeFileSync(join(home, '.env'), dotenv ?? `TELEGRAM_BOT_TOKEN="${tokenValue}"\nTELEGRAM_ALLOWED_USERS=111, 222\nGATEWAY_ALLOW_ALL_USERS=false\nTELEGRAM_ALLOW_ALL_USERS=false\n`);
      if (hermes) {
        writeFileSync(join(bin, 'hermes'), fakeHermes);
        chmodSync(join(bin, 'hermes'), 0o755);
      }
      const result = spawnSync('/bin/bash', ['-s', '--', 'cerebro', '~/brain'], {
        input: REMOTE_PROBE_SCRIPT,
        env: { HOME: home, PATH: `${bin}:${process.env.PATH}` },
        encoding: 'utf8',
      });
      assert.equal(result.status, 0, result.stderr);
      const probeTarget = { kind: 'remote', host: 'h', profile: 'cerebro', brain_path: '~/brain' };
      return { stdout: result.stdout, status: parseRemoteStatus(result.stdout, probeTarget, { now: new Date('2026-10-22T12:00:00.000Z') }), probeTarget };
    };
    const base = (probeTarget) => ({
      target: probeTarget,
      reachable: true,
      checked_at: '2026-10-22T12:00:00.000Z',
      installed: true,
      version: 'Hermes Agent v0.22.4 (2026.9.24) · stable',
      profile_exists: true,
      brain_exists: true,
      brain_is_git: true,
      codex_authenticated: true,
      project_bound: true,
      skills_trusted: true,
      telegram: { token_configured: true, allowlist_configured: true, allow_all_disabled: true },
      gateway: { installed: true, running: true },
    });

    const ready = runProbe();
    assert.deepEqual(ready.status, base(ready.probeTarget));
    assert.ok(!ready.stdout.includes(tokenValue) && !ready.stdout.includes('AbCdEf'), 'o token do .env nunca chega ao stdout');

    const stopped = runProbe({ gatewayText: 'Gateway service is not running' });
    assert.deepEqual(stopped.status, { ...base(stopped.probeTarget), gateway: { installed: true, running: false } });
    const inactive = runProbe({ gatewayText: 'Gateway is inactive' });
    assert.equal(inactive.status.gateway.running, false);
    const failedGateway = runProbe({ gatewayText: 'error', gatewayRc: 1 });
    assert.deepEqual(failedGateway.status.gateway, { installed: false, running: false });
    const notInstalled = runProbe({ gatewayText: 'Gateway service not installed', gatewayRc: 0 });
    assert.deepEqual(notInstalled.status.gateway, { installed: false, running: false });

    const loggedOut = runProbe({ auth: 'openai-codex: logged out (No Codex credentials stored. Run `hermes auth` to authenticate.)' });
    assert.equal(loggedOut.status.codex_authenticated, false, 'logged out com saída 0 não conta como login');
    const noService = runProbe({ gatewayText: '✗ Gateway is not running\n\nTo start:\n  hermes gateway run      # Run in foreground\n  hermes gateway install  # Install as user service' });
    assert.deepEqual(noService.status.gateway, { installed: false, running: false }, 'sem serviço não conta como instalado');
    const manual = runProbe({ gatewayText: '✓ Gateway is running (PID: 42)\n  (Running manually, not as a system service)' });
    assert.deepEqual(manual.status.gateway, { installed: false, running: true });
    const launchd = runProbe({ gatewayText: 'Launchd plist: /x.plist\n✓ Gateway is supervised by launchd (PID 42)' });
    assert.deepEqual(launchd.status.gateway, { installed: true, running: true }, 'launchd com PID conta como rodando');
    const noFallback = runProbe({ gatewayText: 'Launchd plist: /x.plist\n✗ No fallback process is running' });
    assert.deepEqual(noFallback.status.gateway, { installed: true, running: false });

    const noProfile = runProbe({ profileLine: '  outro     gpt-5' });
    assert.equal(noProfile.status.profile_exists, false);
    assert.equal(noProfile.status.installed, true);
    assert.deepEqual(noProfile.status.gateway, { installed: false, running: false });

    const leaky = runProbe({ dotenv: `TELEGRAM_BOT_TOKEN=${tokenValue}\nTELEGRAM_ALLOWED_USERS=999888777\nSECRET_KEY=sk-live-should-not-appear\n` });
    assert.equal(leaky.status.telegram.token_configured, true);
    assert.equal(leaky.status.telegram.allow_all_disabled, false);
    assert.ok(!leaky.stdout.includes(tokenValue) && !leaky.stdout.includes('sk-live') && !leaky.stdout.includes('999888777'), 'valores do .env nunca saem');

    const absent = runProbe({ hermes: false });
    assert.equal(absent.status.installed, false);
    assert.equal(absent.status.version, null);
    assert.equal(absent.status.brain_exists, true);
    assert.equal(absent.status.brain_is_git, true);
    assert.equal(absent.status.reachable, true);
  }

  // Servidor: destino, cache do estado remoto e bloqueio das rotas locais.
  // O controlador de ativação lê o Hermes local uma vez ao nascer; depois disso, em modo remoto, o runner não pode rodar.
  const localCalls = [];
  const runner = (command, args) => {
    localCalls.push(args.join(' '));
    return { status: 1, stdout: '', stderr: '', error: Object.assign(new Error('x'), { code: 'ENOENT' }) };
  };
  let probes = 0;
  let release;
  const gate = new Promise((resolveGate) => { release = resolveGate; });
  let now = new Date('2026-10-22T12:00:00.000Z').getTime();
  const sshConfigPath = join(sandbox, 'ssh-config');
  writeFileSync(sshConfigPath, sshConfig);
  const instance = createConsoleServer({
    root: brain,
    sessionToken: 'remote-session',
    csrfToken: 'remote-csrf',
    clock: () => new Date(now),
    hermesRunner: runner,
    sshConfigPath,
    hermesRemoteProbe: async (current) => { probes += 1; await gate; return parseRemoteStatus(stdout, current, { now: new Date(now) }); },
  });
  await new Promise((resolveListen) => instance.server.listen(0, '127.0.0.1', resolveListen));
  const base = `http://127.0.0.1:${instance.server.address().port}`;
  const cookie = 'cerebro_console_session=remote-session';
  const get = (path, withCookie = true) => fetch(`${base}${path}`, { headers: withCookie ? { Cookie: cookie } : {} });
  const post = async (path, value, { csrf = 'remote-csrf', origin = base } = {}) => {
    const response = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json', ...(csrf ? { 'X-Cerebro-CSRF': csrf } : {}) },
      body: JSON.stringify({ ...value, confirm: true }),
    });
    return { status: response.status, value: await response.json() };
  };
  const targetFile = join(brain, '.cerebro', 'runtime', 'hermes-target.json');
  let baseline = 0;
  try {
    const denied = await get('/api/integrations/hermes/target', false);
    assert.equal(denied.status, 403);
    const initial = await (await get('/api/integrations/hermes/target')).json();
    assert.deepEqual(initial, { target: { kind: 'local' }, ssh_hosts: ['popcode-server-01', 'popcode-server-02', 'mac-mini'], default_brain_path: '~/meu-cerebro' });
    assert.equal(existsSync(targetFile), false);

    const noCsrf = await post('/api/integrations/hermes/target', { kind: 'remote', host: 'popcode-server-01' }, { csrf: '' });
    assert.equal(noCsrf.status, 403);
    assert.equal(noCsrf.value.reason_code, 'csrf-invalid');
    const wrongOrigin = await post('/api/integrations/hermes/target', { kind: 'remote', host: 'popcode-server-01' }, { origin: 'https://attacker.example' });
    assert.equal(wrongOrigin.status, 403);
    assert.equal(existsSync(targetFile), false);
    const invalid = await post('/api/integrations/hermes/target', { kind: 'remote', host: '-oProxyCommand=x' });
    assert.equal(invalid.status, 400);
    assert.deepEqual(invalid.value, { reason_code: 'hermes-target-invalid' });

    const localRemoteStatus = await get('/api/integrations/hermes/remote-status');
    assert.equal(localRemoteStatus.status, 409);
    assert.deepEqual(await localRemoteStatus.json(), { reason_code: 'hermes-target-local' });

    const saved = await post('/api/integrations/hermes/target', { kind: 'remote', host: 'popcode-server-01', profile: 'tron', brain_path: '~/second-brain' });
    assert.equal(saved.status, 200);
    assert.deepEqual(saved.value, { target });
    assert.deepEqual(JSON.parse(readFileSync(targetFile, 'utf8')), target);
    assert.deepEqual(readHermesTarget(brain), target);

    // Modelo principal em modo remoto: sem runner local, sem ssh, com o último estado em cache.
    baseline = localCalls.length;
    const model = await (await get('/api/console')).json();
    assert.deepEqual(model.hermes.target, target);
    assert.equal(model.hermes.remote, null);
    assert.equal(model.hermes.installed, undefined);
    assert.equal(probes, 0, 'o modelo principal não dispara ssh');

    const concurrent = [get('/api/integrations/hermes/remote-status'), get('/api/integrations/hermes/remote-status')];
    await new Promise((resolveTick) => setTimeout(resolveTick, 50));
    release();
    const [first, second] = await Promise.all(concurrent.map(async (request) => (await request).json()));
    assert.equal(probes, 1, 'pedidos simultâneos dividem uma verificação');
    assert.deepEqual(first, second);
    assert.equal(first.installed, true);
    assert.equal(first.project_bound, true);
    await (await get('/api/integrations/hermes/remote-status')).json();
    assert.equal(probes, 1, 'cache de 30 segundos');
    now += 29_000;
    await (await get('/api/integrations/hermes/remote-status')).json();
    assert.equal(probes, 1, 'cache vale aos 29 segundos');
    now += 2_000;
    await (await get('/api/integrations/hermes/remote-status')).json();
    assert.equal(probes, 2, 'cache expira');
    await (await get('/api/integrations/hermes/remote-status?refresh=1')).json();
    assert.equal(probes, 3, 'refresh ignora o cache');
    const cachedModel = await (await get('/api/console')).json();
    assert.equal(cachedModel.hermes.remote.installed, true);
    assert.equal(probes, 3);
    assert.equal(localCalls.length, baseline, 'nenhum comando local do Hermes rodou');

    const mutationRoutes = [
      '/api/integrations/hermes/activation/prepare/start',
      '/api/integrations/hermes/activation/codex/start',
      '/api/integrations/hermes/activation/telegram/start',
      '/api/integrations/hermes/activation/owner/confirm',
      '/api/integrations/hermes/activation/owner/reject',
      '/api/integrations/hermes/project/bind',
      '/api/integrations/hermes/telegram',
      '/api/integrations/hermes/telegram/disconnect',
      '/api/integrations/hermes/doctor',
      '/api/integrations/hermes/gateway/restart',
    ];
    for (const route of mutationRoutes) {
      const refused = await post(route, { token: '123456789:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', action_id: 'x' });
      assert.equal(refused.status, 409, route);
      assert.deepEqual(refused.value, { reason_code: 'hermes-target-remote' }, route);
    }
    assert.equal(localCalls.length, baseline, 'rotas locais recusadas antes de qualquer runner');
    const noSession = await fetch(`${base}/api/integrations/hermes/doctor`, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: '{"confirm":true}' });
    assert.equal(noSession.status, 403, 'sem sessão continua 403, não 409');

    // Trocar de destino invalida o cache.
    const other = await post('/api/integrations/hermes/target', { kind: 'remote', host: 'popcode-server-02' });
    assert.equal(other.status, 200);
    assert.equal((await (await get('/api/console')).json()).hermes.remote, null);

    const back = await post('/api/integrations/hermes/target', { kind: 'local' });
    assert.deepEqual(back.value, { target: { kind: 'local' } });
    assert.equal(existsSync(targetFile), false, 'local apaga o arquivo');
  } finally {
    await new Promise((resolveClose) => instance.server.close(resolveClose));
  }

  // Falha segura do probe, sem pilha nem caminho.
  let flaky = 0;
  const failing = createConsoleServer({
    root: brain,
    sessionToken: 'remote-session',
    csrfToken: 'remote-csrf',
    hermesRunner: runner,
    hermesRemoteProbe: async () => { flaky += 1; if (flaky === 1) throw new Error('boom /Users/secret/path'); return parseRemoteStatus(stdout, target); },
  });
  writeFileSync(targetFile, JSON.stringify(target));
  await new Promise((resolveListen) => failing.server.listen(0, '127.0.0.1', resolveListen));
  try {
    const url = `http://127.0.0.1:${failing.server.address().port}/api/integrations/hermes/remote-status`;
    const rejected = await fetch(url, { headers: { Cookie: cookie } });
    assert.equal(rejected.status, 503);
    const text = await rejected.text();
    assert.deepEqual(JSON.parse(text), { reason_code: 'hermes-remote-failed' });
    assert.ok(!/secret|boom/.test(text));
    assert.equal((await fetch(url, { headers: { Cookie: cookie } })).status, 200, 'falha não fica em cache');
  } finally {
    await new Promise((resolveClose) => failing.server.close(resolveClose));
  }

  // Probe que lança de forma síncrona não deixa a verificação presa.
  let syncCalls = 0;
  const syncThrow = createConsoleServer({
    root: brain,
    sessionToken: 'remote-session',
    csrfToken: 'remote-csrf',
    hermesRunner: runner,
    hermesRemoteProbe: () => { syncCalls += 1; if (syncCalls === 1) throw new Error('sync boom /Users/secret'); return Promise.resolve(parseRemoteStatus(stdout, target)); },
  });
  writeFileSync(targetFile, JSON.stringify(target));
  await new Promise((resolveListen) => syncThrow.server.listen(0, '127.0.0.1', resolveListen));
  try {
    const url = `http://127.0.0.1:${syncThrow.server.address().port}/api/integrations/hermes/remote-status`;
    const rejected = await fetch(url, { headers: { Cookie: cookie } });
    assert.equal(rejected.status, 503);
    assert.deepEqual(await rejected.json(), { reason_code: 'hermes-remote-failed' });
    const retried = await fetch(url, { headers: { Cookie: cookie } });
    assert.equal(retried.status, 200, 'a verificação não fica presa depois de um throw síncrono');
    assert.equal((await retried.json()).installed, true);
    assert.equal(syncCalls, 2);
  } finally {
    await new Promise((resolveClose) => syncThrow.server.close(resolveClose));
  }

  // Em modo remoto a rota de ativação não roda o CLI local.
  let armed = false;
  const guardRunner = () => {
    if (armed) throw new Error('runner local não pode rodar em modo remoto');
    return { status: 1, stdout: '', stderr: '', error: Object.assign(new Error('x'), { code: 'ENOENT' }) };
  };
  const guarded = createConsoleServer({ root: brain, sessionToken: 'remote-session', csrfToken: 'remote-csrf', hermesRunner: guardRunner });
  await new Promise((resolveListen) => guarded.server.listen(0, '127.0.0.1', resolveListen));
  armed = true;
  try {
    const response = await fetch(`http://127.0.0.1:${guarded.server.address().port}/api/integrations/hermes/activation`, { headers: { Cookie: cookie } });
    assert.equal(response.status, 200);
    const peeked = await response.json();
    assert.ok(peeked && typeof peeked === 'object', 'devolve o estado em memória');
    assert.equal(peeked.action.status, 'idle');
  } finally {
    await new Promise((resolveClose) => guarded.server.close(resolveClose));
  }

  // Ação local em andamento bloqueia a troca de destino.
  rmSync(targetFile, { force: true });
  const busyInstance = createConsoleServer({
    root: brain,
    sessionToken: 'remote-session',
    csrfToken: 'remote-csrf',
    hermesRunner: (command, args) => ({ status: 1, stdout: '', stderr: '', error: Object.assign(new Error('x'), { code: 'ENOENT' }) }),
    hermesFetch: (url, { signal }) => new Promise((resolveFetch, rejectFetch) => {
      signal.addEventListener('abort', () => rejectFetch(new Error('aborted')), { once: true });
    }),
    hermesSpawn: () => {
      const child = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.kill = () => {};
      return child;
    },
  });
  await new Promise((resolveListen) => busyInstance.server.listen(0, '127.0.0.1', resolveListen));
  try {
    const busyBase = `http://127.0.0.1:${busyInstance.server.address().port}`;
    const busyPost = async (path, value) => {
      const response = await fetch(`${busyBase}${path}`, {
        method: 'POST',
        headers: { Cookie: cookie, Origin: busyBase, 'Content-Type': 'application/json', 'X-Cerebro-CSRF': 'remote-csrf' },
        body: JSON.stringify({ ...value, confirm: true }),
      });
      return { status: response.status, value: await response.json() };
    };
    const started = await busyPost('/api/integrations/hermes/activation/prepare/start', {});
    assert.equal(started.status, 202);
    assert.equal(started.value.action.status, 'running');
    const refused = await busyPost('/api/integrations/hermes/target', { kind: 'remote', host: 'popcode-server-01' });
    assert.equal(refused.status, 409);
    assert.deepEqual(refused.value, { reason_code: 'hermes-action-running' });
    assert.equal(existsSync(targetFile), false);
    const cancelled = await busyPost('/api/integrations/hermes/activation/cancel', { action_id: started.value.action.id });
    assert.equal(cancelled.status, 202);
    const allowed = await busyPost('/api/integrations/hermes/target', { kind: 'remote', host: 'popcode-server-01' });
    assert.equal(allowed.status, 200, 'depois de cancelar a troca é liberada');
  } finally {
    await new Promise((resolveClose) => busyInstance.server.close(resolveClose));
  }

  // Teste de conexão: só alcançabilidade, nunca devolve o stderr cru.
  rmSync(targetFile, { force: true });
  const marker = 'MARKER-stderr-9f3a2c';
  const sshRoute = '/api/integrations/hermes/ssh-test';
  let sshBehavior;
  const sshCalls = [];
  const sshInstance = createConsoleServer({
    root: brain,
    sessionToken: 'remote-session',
    csrfToken: 'remote-csrf',
    hermesRemoteSpawn: (command, args, options) => {
      const child = new EventEmitter();
      child.stderr = new EventEmitter();
      child.kill = () => { child.killed = true; };
      sshCalls.push({ command, args, shell: options.shell, child });
      sshBehavior(child);
      return child;
    },
  });
  await new Promise((resolveListen) => sshInstance.server.listen(0, '127.0.0.1', resolveListen));
  const sshBase = `http://127.0.0.1:${sshInstance.server.address().port}`;
  const sshPost = async (value, { csrf = 'remote-csrf' } = {}) => {
    const response = await fetch(`${sshBase}${sshRoute}`, {
      method: 'POST',
      headers: { Cookie: cookie, Origin: sshBase, 'Content-Type': 'application/json', ...(csrf ? { 'X-Cerebro-CSRF': csrf } : {}) },
      body: JSON.stringify({ ...value, confirm: true }),
    });
    const text = await response.text();
    return { status: response.status, text, value: JSON.parse(text) };
  };
  try {
    const noCsrf = await sshPost({ host: 'popcode-server-02' }, { csrf: '' });
    assert.equal(noCsrf.status, 403);
    assert.equal(noCsrf.value.reason_code, 'csrf-invalid');
    for (const host of ['-oProxyCommand=x', 'a b', '', 'usuario@maquina', 'x'.repeat(65), undefined]) {
      const invalid = await sshPost({ host });
      assert.equal(invalid.status, 400, String(host));
      assert.deepEqual(invalid.value, { reason_code: 'hermes-target-invalid' });
    }
    assert.equal(sshCalls.length, 0, 'host inválido nunca chega ao ssh');

    sshBehavior = (child) => setImmediate(() => child.emit('close', 0));
    const good = await sshPost({ host: 'popcode-server-02' });
    assert.equal(good.status, 200);
    assert.deepEqual(good.value, { ok: true, reason_code: 'ok' });
    assert.deepEqual(sshCalls[0].args, ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', 'popcode-server-02', 'true']);
    assert.equal(sshCalls[0].shell, false);
    assert.equal(existsSync(targetFile), false, 'testar não salva o destino');

    sshBehavior = (child) => setImmediate(() => { child.stderr.emit('data', `${marker}: Permission denied (publickey).\n`); child.emit('close', 255); });
    const denied = await sshPost({ host: 'macbook-pro' });
    assert.equal(denied.status, 200);
    assert.deepEqual(denied.value, { ok: false, reason_code: 'auth-required' });
    assert.ok(!denied.text.includes(marker), 'stderr cru não vaza');

    sshBehavior = (child) => setImmediate(() => { child.stderr.emit('data', `${marker}: Operation timed out`); child.emit('close', 255); });
    const offline = await sshPost({ host: 'macbook-pro-14' });
    assert.deepEqual(offline.value, { ok: false, reason_code: 'offline' });
    assert.ok(!offline.text.includes(marker));

    sshBehavior = (child) => setImmediate(() => child.emit('error', Object.assign(new Error(`spawn ssh ENOENT ${marker}`), { code: 'ENOENT' })));
    const missingSsh = await sshPost({ host: 'popcode-server-02' });
    assert.deepEqual(missingSsh.value, { ok: false, reason_code: 'ssh-missing' });
    assert.ok(!missingSsh.text.includes(marker));

    sshBehavior = (child) => setImmediate(() => { child.stderr.emit('data', marker); child.emit('close', 1); });
    const other = await sshPost({ host: 'popcode-server-02' });
    assert.deepEqual(other.value, { ok: false, reason_code: 'failed' });
    assert.ok(!other.text.includes(marker));

    const timeoutCall = sshTestCalls.length;
    const alive = setTimeout(() => {}, 5000);
    const hangingChild = sshTestSpawn((child) => { child.kill = () => { child.killed = true; clearTimeout(alive); }; });
    assert.equal(await testSshConnection('popcode-server-02', { spawn: hangingChild, timeoutMs: 20 }), 'timeout');
    assert.equal(sshTestCalls[timeoutCall].child.killed, true, 'timeout mata o filho');
  } finally {
    await new Promise((resolveClose) => sshInstance.server.close(resolveClose));
  }

  console.log('hermes-remote: ok (hosts, destino, parser, ssh fixo, rotas, cache, bloqueio local)');
} finally {
  rmSync(sandbox, { recursive: true, force: true });
}
