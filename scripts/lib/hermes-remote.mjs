import { spawn as nodeSpawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';

const HOST_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const PROFILE_RE = /^[a-z0-9]{1,32}$/;
const BRAIN_PATH_RE = /^(~\/|\/)[A-Za-z0-9._\/-]{1,199}$/;
const DEFAULT_PROFILE = 'cerebro';
const MAX_OUTPUT_BYTES = 64 * 1024;
const SSH_TEST_TIMEOUT_MS = 15_000;
const SSH_TEST_MAX_STDERR = 8 * 1024;
const LOCAL_TARGET = Object.freeze({ kind: 'local' });

export const REMOTE_PROBE_SCRIPT = `export PATH="$HOME/.local/bin:/opt/homebrew/bin:$PATH"
profile="$1"
brain="$2"
case "$brain" in "~/"*) brain="$HOME/\${brain#\\~/}" ;; esac
brain="\${brain%/}"
echo "home=$HOME"
echo "brain_expanded=$brain"
if [ -d "$brain" ]; then
  echo "brain_exists=true"
  if git -C "$brain" rev-parse </dev/null >/dev/null 2>&1; then echo "brain_is_git=true"; else echo "brain_is_git=false"; fi
else
  echo "brain_exists=false"
  echo "brain_is_git=false"
fi
if ! command -v hermes >/dev/null 2>&1; then
  echo "hermes_installed=false"
  exit 0
fi
echo "hermes_installed=true"
h() { hermes "$@" </dev/null 2>&1; }
ver=$(h --version | grep -v '^⚠' | grep -v '^[[:space:]]' | grep -m1 . | tr -d '\\r' | cut -c1-120)
echo "hermes_version=$ver"
if [ "$profile" = "default" ]; then
  echo "profile_exists=true"
elif h profile list | awk -v p="$profile" '{ n = $1; if (n == "◆" || n == "*") n = $2; sub(/^◆/, "", n); if (n == p) f = 1 } END { exit !f }'; then
  echo "profile_exists=true"
else
  echo "profile_exists=false"
  exit 0
fi
unq() { tr -d "\\"'\\r"; }
cfg=$(h -p "$profile" config path | grep '^/' | tail -1)
cwd=""
if [ -n "$cfg" ] && [ -r "$cfg" ]; then
  cwd=$(awk '
    /^terminal:/ { t = 1; next }
    t && /^[^[:space:]#]/ { t = 0 }
    t && /^[[:space:]]+cwd:/ { v = $0; sub(/^[[:space:]]+cwd:[[:space:]]*/, "", v); sub(/[[:space:]]+#.*$/, "", v); print v; exit }
  ' "$cfg" | unq)
fi
echo "config_cwd=$cwd"
trusted=false
if [ -n "$cfg" ] && [ -r "$cfg" ]; then
  for key in trusted_project_dirs external_dirs; do
    items=$(awk -v key="$key" '
      /^skills:/ { s = 1; k = 0; next }
      s && /^[^[:space:]#]/ { s = 0; k = 0 }
      s && /^  [A-Za-z0-9_-]+:/ { k = ($1 == key ":"); next }
      s && k && /^[[:space:]]*-[[:space:]]+/ { v = $0; sub(/^[[:space:]]*-[[:space:]]+/, "", v); sub(/[[:space:]]+#.*$/, "", v); print v }
    ' "$cfg")
    while IFS= read -r item; do
      item=$(printf '%s' "$item" | unq)
      case "$item" in "~/"*) item="$HOME/\${item#\\~/}" ;; esac
      item="\${item%/}"
      if [ "$key" = "trusted_project_dirs" ] && [ "$item" = "$brain" ]; then trusted=true; fi
      if [ "$key" = "external_dirs" ] && [ "$item" = "$brain/.agents/skills" ]; then trusted=true; fi
    done <<< "$items"
  done
fi
echo "skills_trusted=$trusted"
if h -p "$profile" auth status openai-codex | grep -Eq '^openai-codex: logged in[[:space:]]*$'; then echo "codex_authenticated=true"; else echo "codex_authenticated=false"; fi
gwout=$(h -p "$profile" gateway status)
gwrc=$?
gw_installed=false
gw_running=false
if [ "$gwrc" -eq 0 ]; then
  if ! printf '%s' "$gwout" | grep -Eiq 'not installed|service.*missing|no installed|Gateway is not running|not as a system service'; then gw_installed=true; fi
  if { printf '%s' "$gwout" | grep -Eiqw 'running|active' || printf '%s' "$gwout" | grep -Eiq 'supervised by launchd \\(PID'; } && ! printf '%s' "$gwout" | grep -Eiq 'not running|inactive|stopped|no fallback process is running'; then gw_running=true; fi
fi
echo "gateway_installed=$gw_installed"
echo "gateway_running=$gw_running"
envf=$(h -p "$profile" config env-path | grep '^/' | tail -1)
envval() { if [ -n "$envf" ] && [ -r "$envf" ]; then grep -m1 "^$1=" "$envf" | cut -d= -f2- | unq; fi; }
tok=$(envval TELEGRAM_BOT_TOKEN)
if printf '%s' "$tok" | grep -Eq '^[0-9]+:[A-Za-z0-9_-]{30,}$'; then echo "telegram_token_configured=true"; else echo "telegram_token_configured=false"; fi
users=$(envval TELEGRAM_ALLOWED_USERS | tr -d ' ')
if printf '%s' "$users" | grep -Eq '^[0-9]{1,20}(,[0-9]{1,20})*$'; then echo "telegram_allowlist_configured=true"; else echo "telegram_allowlist_configured=false"; fi
if [ "$(envval GATEWAY_ALLOW_ALL_USERS)" = "false" ] && [ "$(envval TELEGRAM_ALLOW_ALL_USERS)" = "false" ]; then echo "telegram_allow_all_disabled=true"; else echo "telegram_allow_all_disabled=false"; fi
exit 0
`;

const BOOLEAN_KEYS = Object.freeze([
  'hermes_installed', 'brain_exists', 'brain_is_git', 'profile_exists', 'skills_trusted',
  'codex_authenticated', 'gateway_installed', 'gateway_running',
  'telegram_token_configured', 'telegram_allowlist_configured', 'telegram_allow_all_disabled',
]);
const STRING_KEYS = Object.freeze(['hermes_version', 'config_cwd', 'brain_expanded', 'home']);

export function validateHermesTarget(input, { brainRoot = process.cwd() } = {}) {
  if (!input || typeof input !== 'object') throw new Error('hermes-target-invalid');
  if (input.kind === 'local') return { kind: 'local' };
  if (input.kind !== 'remote') throw new Error('hermes-target-invalid');
  const host = String(input.host ?? '').trim();
  const profile = String(input.profile ?? '').trim() || DEFAULT_PROFILE;
  const brainPath = String(input.brain_path ?? '').trim() || defaultBrainPath(brainRoot);
  if (!HOST_RE.test(host) || !PROFILE_RE.test(profile)) throw new Error('hermes-target-invalid');
  if (!BRAIN_PATH_RE.test(brainPath) || brainPath.split('/').includes('..')) throw new Error('hermes-target-invalid');
  return { kind: 'remote', host, profile, brain_path: brainPath };
}

export function defaultBrainPath(brainRoot) {
  const name = basename(resolve(brainRoot)).replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 100) || 'cerebro';
  return `~/${name}`;
}

function targetFile(root) {
  return resolve(root, '.cerebro', 'runtime', 'hermes-target.json');
}

export function readHermesTarget(root) {
  try {
    const file = targetFile(root);
    if (!existsSync(file)) return { ...LOCAL_TARGET };
    return validateHermesTarget(JSON.parse(readFileSync(file, 'utf8')), { brainRoot: root });
  } catch {
    return { ...LOCAL_TARGET };
  }
}

export function writeHermesTarget(root, target) {
  const file = targetFile(root);
  if (target.kind === 'local') {
    rmSync(file, { force: true });
    return { kind: 'local' };
  }
  mkdirSync(dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(target, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, file);
  return target;
}

export function listSshHosts(configText) {
  const hosts = [];
  for (const raw of String(configText ?? '').split(/\r?\n/)) {
    const match = raw.match(/^\s*Host\s+(.+?)\s*$/i);
    if (!match) continue;
    for (const alias of match[1].replace(/#.*$/, '').split(/\s+/)) {
      if (!alias || /[*?!]/.test(alias) || alias === 'github.com') continue;
      if (!HOST_RE.test(alias) || hosts.includes(alias)) continue;
      hosts.push(alias);
    }
  }
  return hosts;
}

function emptyStatus(target, now, extra = {}) {
  return {
    target,
    reachable: false,
    checked_at: now.toISOString(),
    installed: false,
    version: null,
    profile_exists: false,
    brain_exists: false,
    brain_is_git: false,
    codex_authenticated: false,
    project_bound: false,
    skills_trusted: false,
    telegram: { token_configured: false, allowlist_configured: false, allow_all_disabled: false },
    gateway: { installed: false, running: false },
    ...extra,
  };
}

function expandHome(value, home) {
  return home && value.startsWith('~/') ? `${trimSlash(home)}/${value.slice(2)}` : value;
}

function trimSlash(value) {
  return value.length > 1 ? value.replace(/\/+$/, '') : value;
}

export function parseRemoteStatus(stdout, target, { now = new Date() } = {}) {
  const values = new Map();
  for (const line of String(stdout ?? '').split(/\r?\n/)) {
    const cut = line.indexOf('=');
    if (cut < 1) continue;
    const key = line.slice(0, cut);
    const value = line.slice(cut + 1);
    if (BOOLEAN_KEYS.includes(key)) {
      if (value === 'true' || value === 'false') values.set(key, value === 'true');
    } else if (STRING_KEYS.includes(key)) {
      values.set(key, value.slice(0, 300));
    }
  }
  if (!values.has('hermes_installed') && !values.has('brain_exists')) {
    return emptyStatus(target, now, { reason_code: 'remote-output-invalid' });
  }
  const flag = (key) => values.get(key) === true;
  const home = values.get('home') || '';
  const cwd = expandHome(values.get('config_cwd') || '', home);
  const expanded = values.get('brain_expanded') || '';
  const installed = flag('hermes_installed');
  return {
    target,
    reachable: true,
    checked_at: now.toISOString(),
    installed,
    version: installed ? (String(values.get('hermes_version') || '').slice(0, 120) || null) : null,
    profile_exists: flag('profile_exists'),
    brain_exists: flag('brain_exists'),
    brain_is_git: flag('brain_is_git'),
    codex_authenticated: flag('codex_authenticated'),
    project_bound: cwd !== '' && expanded !== '' && trimSlash(cwd) === trimSlash(expanded),
    skills_trusted: flag('skills_trusted'),
    telegram: {
      token_configured: flag('telegram_token_configured'),
      allowlist_configured: flag('telegram_allowlist_configured'),
      allow_all_disabled: flag('telegram_allow_all_disabled'),
    },
    gateway: { installed: flag('gateway_installed'), running: flag('gateway_running') },
  };
}

export function sshArgs(target) {
  return ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', target.host, 'bash', '-s', '--', target.profile, target.brain_path];
}

export function readRemoteHermesStatus(target, { spawn = nodeSpawn, timeoutMs = 30_000, clock = () => new Date() } = {}) {
  return new Promise((resolvePromise) => {
    const fail = (reason) => resolvePromise(emptyStatus(target, clock(), { reason_code: reason }));
    let child;
    try {
      child = spawn('ssh', sshArgs(target), { shell: false, stdio: ['pipe', 'pipe', 'ignore'] });
    } catch {
      fail('ssh-missing');
      return;
    }
    let output = '';
    let settled = false;
    const finish = (settle) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      settle();
    };
    const timer = setTimeout(() => {
      finish(() => {
        try { child.kill(); } catch { /* o filho já saiu */ }
        fail('ssh-timeout');
      });
    }, timeoutMs);
    timer.unref?.();
    child.stdout?.on('data', (chunk) => {
      if (output.length < MAX_OUTPUT_BYTES) output += String(chunk).slice(0, MAX_OUTPUT_BYTES - output.length);
    });
    child.on('error', (error) => finish(() => fail(error?.code === 'ENOENT' ? 'ssh-missing' : 'ssh-failed')));
    child.on('close', (code) => finish(() => {
      if (code === 255) fail('ssh-unreachable');
      else if (code !== 0) fail('ssh-command-failed');
      else resolvePromise(parseRemoteStatus(output, target, { now: clock() }));
    }));
    child.stdin?.on?.('error', () => { /* o close já reporta a falha */ });
    child.stdin?.end(REMOTE_PROBE_SCRIPT);
  });
}

export function validateSshHost(input) {
  const host = String(input ?? '').trim();
  if (!HOST_RE.test(host)) throw new Error('hermes-target-invalid');
  return host;
}

export function sshTestArgs(host) {
  return ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', host, 'true'];
}

const SSH_FAILURE_TABLE = Object.freeze([
  ['host-key-changed', /REMOTE HOST IDENTIFICATION HAS CHANGED/i],
  ['host-key-unconfirmed', /Host key verification failed/i],
  ['auth-required', /Permission denied/i],
  ['host-unknown', /Could not resolve hostname|nodename nor servname|Temporary failure in name resolution/i],
  ['refused', /kex_exchange_identification|Connection closed by remote host/i],
  ['offline', /Operation timed out|Connection timed out|No route to host|Connection refused|Network is unreachable|Connection reset by peer/i],
]);

export function classifySshFailure(stderr, exitCode, error) {
  if (error?.code === 'ENOENT') return 'ssh-missing';
  if (error?.code === 'ETIMEDOUT') return 'timeout';
  if (!error && exitCode === 0) return 'ok';
  const text = String(stderr ?? '');
  for (const [code, pattern] of SSH_FAILURE_TABLE) if (pattern.test(text)) return code;
  return 'failed';
}

export function testSshConnection(host, { spawn = nodeSpawn, timeoutMs = SSH_TEST_TIMEOUT_MS } = {}) {
  return new Promise((resolvePromise) => {
    let child;
    try {
      child = spawn('ssh', sshTestArgs(host), { shell: false, stdio: ['ignore', 'ignore', 'pipe'] });
    } catch (error) {
      resolvePromise(classifySshFailure('', null, error));
      return;
    }
    let stderr = '';
    let settled = false;
    const finish = (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolvePromise(code);
    };
    const timer = setTimeout(() => {
      try { child.kill(); } catch { /* o filho já saiu */ }
      finish(classifySshFailure(stderr, null, { code: 'ETIMEDOUT' }));
    }, timeoutMs);
    timer.unref?.();
    child.stderr?.on('data', (chunk) => {
      if (stderr.length < SSH_TEST_MAX_STDERR) stderr += String(chunk).slice(0, SSH_TEST_MAX_STDERR - stderr.length);
    });
    child.on('error', (error) => finish(classifySshFailure(stderr, null, error)));
    child.on('close', (exitCode) => finish(classifySshFailure(stderr, exitCode, null)));
  });
}
