import { spawn as nodeSpawn } from 'node:child_process';
import { homedir } from 'node:os';

const ORIGINS = [
  [/^claude\.ai /, 'claude.ai', (line) => line.slice('claude.ai '.length)],
  [/^plugin:[^:]+:/, 'plugin', (line) => line.replace(/^plugin:[^:]+:/, '')],
];

const STATUS_MARKERS = [
  [/- ✔ Connected\s*$/, 'connected'],
  [/- ! Needs authentication\s*$/, 'needs-auth'],
  [/- ✘ Failed to connect/, 'failed'],
  [/- - Not configured\s*$/, 'not-configured'],
];

// O nome vai até o primeiro ":" depois do prefixo de origem. URL e texto de erro são descartados.
export function parseMcpList(stdout) {
  const servers = [];
  for (const raw of String(stdout ?? '').split('\n')) {
    const line = raw.trim();
    const status = STATUS_MARKERS.find(([re]) => re.test(line))?.[1];
    if (!status) continue;
    const [, origin, strip] = ORIGINS.find(([re]) => re.test(line)) ?? [null, 'local', (text) => text];
    const rest = strip(line);
    const colon = rest.indexOf(':');
    const name = (colon === -1 ? '' : rest.slice(0, colon)).trim();
    if (!name) continue;
    servers.push({ name, origin, status });
  }
  return servers;
}

const TOOL_STATUS = {
  connected: 'connected',
  'needs-auth': 'needs-auth',
  failed: 'failed',
  'not-configured': 'not-enabled',
};

const CONNECT_URL_FALLBACK = 'https://claude.ai/settings/connectors';
const safeConnectUrl = (url) => (typeof url === 'string' && url.startsWith('https://claude.ai/') ? url : CONNECT_URL_FALLBACK);
const safeServerUrl = (url) => (typeof url === 'string' && /^https:\/\/[a-z0-9.-]+\//i.test(url) ? url : null);
const sameName = (a, b) => a.toLocaleLowerCase('en') === b.toLocaleLowerCase('en');

export function buildToolConnections(catalog, probe, now = () => new Date()) {
  const ok = probe?.state === 'ok';
  // Plugin com o mesmo nome não conta. Conector personalizado aparece como claude.ai ou, via `claude mcp add`, como local;
  // qualquer servidor local de mesmo nome conta como a ferramenta, mesmo que seja outro servidor.
  const userServers = ok ? probe.servers.filter((server) => server.origin !== 'plugin') : [];
  const statusOf = (tool) => {
    if (!ok) return 'unknown';
    const found = userServers.filter((server) => tool.mcp_names.some((name) => sameName(name, server.name)));
    if (!found.length) return 'not-enabled';
    const best = found.find((server) => server.status === 'connected') ?? found[0];
    return TOOL_STATUS[best.status] ?? 'unknown';
  };
  return {
    catalog_version: catalog.version,
    checked_at: now().toISOString(),
    probe_state: probe?.state ?? 'failed',
    connect_url: safeConnectUrl(catalog.connect_url),
    tools: catalog.tools.map((tool) => ({
      id: tool.id, name: tool.name, purpose: tool.purpose, steps: tool.steps, server_url: safeServerUrl(tool.server_url), status: statusOf(tool),
    })),
  };
}

// cwd na home: um .mcp.json na raiz do cérebro faria o `claude mcp list` subir servidores do projeto.
export function probeClaudeMcp({ spawn = nodeSpawn, timeoutMs = 45000 } = {}) {
  return new Promise((resolvePromise) => {
    let child;
    let stdout = '';
    let settled = false;
    let timer;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolvePromise(result);
    };
    const failure = (error) => finish({ state: error?.code === 'ENOENT' ? 'claude-missing' : 'failed' });
    timer = setTimeout(() => {
      try { child?.kill(); } catch { /* processo já terminou */ }
      finish({ state: 'timeout' });
    }, timeoutMs);
    timer.unref?.();
    try {
      child = spawn('claude', ['mcp', 'list'], { shell: false, cwd: homedir(), stdio: ['ignore', 'pipe', 'ignore'] });
    } catch (error) {
      failure(error);
      return;
    }
    child.stdout?.on('data', (chunk) => { stdout += chunk; });
    child.on('error', failure);
    child.on('close', (code) => finish(code === 0 ? { state: 'ok', servers: parseMcpList(stdout) } : { state: 'failed' }));
  });
}
