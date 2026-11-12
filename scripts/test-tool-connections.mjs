#!/usr/bin/env node
// A tela Ferramentas só diz se o conector está ligado na conta do Claude.
// O parser guarda nome, origem e estado; URL e texto de erro nunca sobrevivem.
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createConsoleServer } from './console-server.mjs';
import { buildToolConnections, parseMcpList, probeClaudeMcp } from './lib/tool-connections.mjs';

const stdout = [
  'Checking MCP server health…',
  '',
  'claude.ai Gmail: https://mail.example.test/mcp/v1 - ✔ Connected',
  'claude.ai Google Calendar: https://cal.example.test/mcp - ! Needs authentication',
  'claude.ai DELTA CRM: https://crm.example.test/mcp - ✘ Failed to connect — HTTP 406: segredo-interno',
  'plugin:productivity:slack: https://chat.example.test/mcp (HTTP) - ! Needs authentication',
  'plugin:productivity:google calendar:  (HTTP) - - Not configured',
  'meu-local: node server.js --flag - ✔ Connected',
  'linha solta que nao e servidor',
].join('\n');

const servers = parseMcpList(stdout);
assert.deepEqual(servers, [
  { name: 'Gmail', origin: 'claude.ai', status: 'connected' },
  { name: 'Google Calendar', origin: 'claude.ai', status: 'needs-auth' },
  { name: 'DELTA CRM', origin: 'claude.ai', status: 'failed' },
  { name: 'slack', origin: 'plugin', status: 'needs-auth' },
  { name: 'google calendar', origin: 'plugin', status: 'not-configured' },
  { name: 'meu-local', origin: 'local', status: 'connected' },
]);
assert.ok(!/example\.test|segredo-interno|HTTP/.test(JSON.stringify(servers)), 'URL e erro não sobrevivem');
assert.deepEqual(parseMcpList(''), []);
assert.deepEqual(parseMcpList(undefined), []);

const catalog = JSON.parse(readFileSync(new URL('../conexoes/ferramentas.json', import.meta.url), 'utf8'));
assert.equal(catalog.version, 1);
assert.deepEqual(catalog.tools.map((tool) => tool.mcp_names[0]), ['Gmail', 'Google Calendar', 'Google Drive', 'Todoist', 'Notion', 'Granola', 'Supabase', 'HeyGen', 'Higgsfield']);
for (const tool of catalog.tools) assert.ok(!('used_by' in tool), `${tool.id} sem used_by`);
for (const tool of catalog.tools) assert.ok(tool.steps.length >= 3 && tool.steps.length <= 4, `${tool.id} steps`);

const fixed = () => new Date('2026-10-22T12:00:00.000Z');
const statuses = (probe) => buildToolConnections(catalog, probe, fixed).tools.map((tool) => `${tool.id}:${tool.status}`);

assert.deepEqual(statuses({ state: 'ok', servers }), [
  'gmail:connected', 'google-calendar:needs-auth', 'google-drive:not-enabled',
  'todoist:not-enabled', 'notion:not-enabled', 'granola:not-enabled',
  'supabase:not-enabled', 'heygen:not-enabled', 'higgsfield:not-enabled',
]);
// Servidor de plugin com o mesmo nome não conta como conector do claude.ai.
assert.deepEqual(statuses({ state: 'ok', servers: [{ name: 'Notion', origin: 'plugin', status: 'connected' }] }).filter((s) => s.startsWith('notion')), ['notion:not-enabled']);
assert.deepEqual(statuses({ state: 'ok', servers: [{ name: 'Todoist', origin: 'claude.ai', status: 'failed' }] }).filter((s) => s.startsWith('todoist')), ['todoist:failed']);
assert.deepEqual(statuses({ state: 'ok', servers: [{ name: 'Granola', origin: 'claude.ai', status: 'not-configured' }] }).filter((s) => s.startsWith('granola')), ['granola:not-enabled']);
assert.deepEqual(
  statuses({ state: 'ok', servers: [{ name: 'heygen', origin: 'local', status: 'connected' }, { name: 'higgsfield', origin: 'claude.ai', status: 'needs-auth' }] }).filter((s) => s.startsWith('h')),
  ['heygen:connected', 'higgsfield:needs-auth'],
);
assert.equal(buildToolConnections(catalog, { state: 'ok', servers: [] }).tools.find((tool) => tool.id === 'heygen').server_url, 'https://mcp.heygen.com/mcp/v1/');
assert.equal(buildToolConnections(catalog, { state: 'ok', servers: [] }).tools.find((tool) => tool.id === 'gmail').server_url, null);
assert.equal(buildToolConnections({ ...catalog, tools: [{ ...catalog.tools[0], server_url: 'javascript:alert(1)' }] }, { state: 'ok', servers: [] }).tools[0].server_url, null);
for (const bad of ['http://mcp.heygen.com/mcp', 'https://mcp.heygen.com']) {
  assert.equal(buildToolConnections({ ...catalog, tools: [{ ...catalog.tools[0], server_url: bad }] }, { state: 'ok', servers: [] }).tools[0].server_url, null, bad);
}
assert.deepEqual(statuses({ state: 'ok', servers: [{ name: 'gmail', origin: 'local', status: 'connected' }] }).filter((s) => s.startsWith('gmail')), ['gmail:connected']);

for (const state of ['claude-missing', 'timeout', 'failed']) {
  const result = buildToolConnections(catalog, { state }, fixed);
  assert.equal(result.probe_state, state);
  assert.deepEqual([...new Set(result.tools.map((tool) => tool.status))], ['unknown']);
}

const gmail = buildToolConnections(catalog, { state: 'ok', servers }, fixed);
assert.equal(gmail.catalog_version, 1);
assert.equal(gmail.checked_at, '2026-10-22T12:00:00.000Z');
assert.equal(gmail.connect_url, 'https://claude.ai/settings/connectors');
assert.deepEqual(Object.keys(gmail.tools[0]), ['id', 'name', 'purpose', 'steps', 'server_url', 'status']);

for (const url of ['javascript:alert(1)', 'http://claude.ai/x', 'https://claude.ai.evil.test/', undefined]) {
  assert.equal(buildToolConnections({ ...catalog, connect_url: url }, { state: 'ok', servers }, fixed).connect_url, 'https://claude.ai/settings/connectors', `connect_url ${url}`);
}
assert.equal(buildToolConnections({ ...catalog, connect_url: 'https://claude.ai/settings/other' }, { state: 'ok', servers }, fixed).connect_url, 'https://claude.ai/settings/other');

const fakeSpawn = (behavior) => (command, args, options) => {
  fakeSpawn.calls.push({ command, args, shell: options.shell, cwd: options.cwd });
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.kill = () => { child.killed = true; };
  fakeSpawn.last = child;
  behavior(child);
  return child;
};
fakeSpawn.calls = [];

assert.deepEqual(
  await probeClaudeMcp({ spawn: fakeSpawn((child) => setImmediate(() => child.emit('error', Object.assign(new Error('x'), { code: 'ENOENT' })))), timeoutMs: 1000 }),
  { state: 'claude-missing' },
);
assert.deepEqual(fakeSpawn.calls[0], { command: 'claude', args: ['mcp', 'list'], shell: false, cwd: homedir() });

// O timer do probe é unref; um filho real mantém o loop vivo, então o fake faz o mesmo.
assert.deepEqual(await probeClaudeMcp({ spawn: fakeSpawn((child) => { const alive = setTimeout(() => {}, 5000); child.kill = () => { child.killed = true; clearTimeout(alive); }; }), timeoutMs: 20 }), { state: 'timeout' });
assert.equal(fakeSpawn.last.killed, true);

assert.deepEqual(
  await probeClaudeMcp({ spawn: fakeSpawn((child) => setImmediate(() => { child.stdout.emit('data', 'claude.ai Gmail: https://x.test - ✔ Connected\n'); child.emit('close', 0); })), timeoutMs: 1000 }),
  { state: 'ok', servers: [{ name: 'Gmail', origin: 'claude.ai', status: 'connected' }] },
);
assert.deepEqual(
  await probeClaudeMcp({ spawn: fakeSpawn((child) => setImmediate(() => child.emit('close', 1))), timeoutMs: 1000 }),
  { state: 'failed' },
);

let probes = 0;
let release;
const gate = new Promise((resolveGate) => { release = resolveGate; });
let now = new Date('2026-10-22T12:00:00.000Z').getTime();
const instance = createConsoleServer({
  root: fileURLToPath(new URL('..', import.meta.url)),
  sessionToken: 'tools-session',
  csrfToken: 'tools-csrf',
  clock: () => new Date(now),
  toolsProbe: async () => { probes += 1; await gate; return { state: 'ok', servers }; },
});
await new Promise((resolveListen) => instance.server.listen(0, '127.0.0.1', resolveListen));
const base = `http://127.0.0.1:${instance.server.address().port}`;
const get = (path, cookie = 'cerebro_console_session=tools-session') => fetch(`${base}${path}`, { headers: cookie ? { Cookie: cookie } : {} });
try {
  const denied = await get('/api/connections/tools', null);
  assert.equal(denied.status, 403);
  assert.equal((await denied.json()).reason_code, 'session-required');
  const concurrent = [get('/api/connections/tools'), get('/api/connections/tools')];
  await new Promise((resolveTick) => setTimeout(resolveTick, 50));
  release();
  const [first, second] = await Promise.all(concurrent.map(async (request) => (await request).json()));
  assert.equal(probes, 1, 'pedidos simultâneos dividem um probe');
  assert.deepEqual(first, second);
  assert.equal(first.tools.find((tool) => tool.id === 'gmail').status, 'connected');
  await (await get('/api/connections/tools')).json();
  assert.equal(probes, 1, 'cache de 5 minutos');
  now += 240_000;
  await (await get('/api/connections/tools')).json();
  assert.equal(probes, 1, 'cache ainda vale aos 4 minutos');
  now += 61_000;
  await (await get('/api/connections/tools')).json();
  assert.equal(probes, 2, 'cache expira');
  await (await get('/api/connections/tools?refresh=1')).json();
  assert.equal(probes, 3, 'refresh ignora o cache');
} finally {
  await new Promise((resolveClose) => instance.server.close(resolveClose));
}

let flaky = 0;
const failing = createConsoleServer({
  root: fileURLToPath(new URL('..', import.meta.url)),
  sessionToken: 'tools-session',
  csrfToken: 'tools-csrf',
  toolsProbe: async () => { flaky += 1; if (flaky === 1) throw new Error('boom /Users/secret/path'); return { state: 'ok', servers }; },
});
await new Promise((resolveListen) => failing.server.listen(0, '127.0.0.1', resolveListen));
const failingBase = `http://127.0.0.1:${failing.server.address().port}/api/connections/tools`;
const failingGet = () => fetch(failingBase, { headers: { Cookie: 'cerebro_console_session=tools-session' } });
try {
  const rejected = await failingGet();
  assert.equal(rejected.status, 503);
  const body = await rejected.text();
  assert.deepEqual(JSON.parse(body), { reason_code: 'tools-probe-failed' });
  assert.ok(!/secret|boom/.test(body), 'sem caminho nem mensagem interna');
  const recovered = await failingGet();
  assert.equal(recovered.status, 200);
  assert.equal(flaky, 2, 'a falha não fica em cache; o próximo pedido roda um probe novo');
} finally {
  await new Promise((resolveClose) => failing.server.close(resolveClose));
}

console.log('tool-connections: ok (parser, status table, probe states, catalog)');
