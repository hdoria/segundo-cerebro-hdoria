#!/usr/bin/env node
// Execute production transports with synthetic roots and injected fetch: no network or credentials.
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { activate } from '../.agents/scripts/activate.mjs';

const endpoint = 'https://cerebro.vibemakers.com.br';
const sandbox = fs.mkdtempSync(join(tmpdir(), 'agent-endpoints-'));
const write = (ref, text) => { const path = join(sandbox, ref); fs.mkdirSync(dirname(path), { recursive: true }); fs.writeFileSync(path, text); };
const ping = fs.readFileSync(new URL('../.agents/scripts/ping.mjs', import.meta.url), 'utf8')
  .replace(/^#!.*\n/, '').replace(/^import .+;\n/gm, '')
  .replace(/^const ROOTS = .+;$/m, `const ROOTS = ${JSON.stringify({ vault: sandbox, motor: sandbox, mode: 'legacy' })};`);
async function runPing(env = {}) {
  const calls = []; let flushes = 0;
  await runInNewContext(`(async () => {${ping}\n})()`, {
    ...fs, dirname, join, resolve, randomUUID, platform: () => 'synthetic',
    process: { env, argv: ['node', 'ping.mjs', 'sessao'] }, console,
    readOperatorRuntime: () => 'codex',
    productVersion: () => '0.0.0',
    DEFAULT_ENDPOINT: endpoint,
    flushPendingActivation: async (options) => { flushes++; calls.push({ activation: options.endpoint }); },
    fetch: async (url) => { calls.push({ url }); return { ok: true, status: 200 }; },
    AbortController, setTimeout, clearTimeout,
  });
  return { calls, flushes };
}
try {
  write('.cerebro/id', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa\n');
  write('VERSION', '0.0.0\n');
  const defaultPing = await runPing();
  assert.equal(defaultPing.calls[0].activation, endpoint);
  assert.equal(defaultPing.calls[1].url, `${endpoint}/cerebro-ping`);
  const override = await runPing({ CEREBRO_API_URL: 'https://transport.test/v1///' });
  assert.equal(override.calls[0].activation, 'https://transport.test/v1');
  assert.equal(override.calls[1].url, 'https://transport.test/v1/cerebro-ping');
  assert.equal((await runPing({ CEREBRO_TELEMETRY: 'off' })).calls.length, 0);
  write('.cerebro/sem-telemetria', '');
  assert.equal((await runPing()).calls.length, 0, 'file opt-out blocks ping and pending activation');

  const activationRoot = join(sandbox, 'activation');
  for (const ref of ['COMECE-AQUI.md', 'VERSION', 'CLAUDE.md', '.agents/skills/comecar/SKILL.md', '.agents/scripts/ping.mjs']) write(`activation/${ref}`, 'fixture\n');
  const urls = [];
  const previous = process.env.CEREBRO_API_URL;
  const previousTelemetry = process.env.CEREBRO_TELEMETRY;
  delete process.env.CEREBRO_API_URL;
  delete process.env.CEREBRO_TELEMETRY;
  try {
    await activate({ root: activationRoot, claim: 'A'.repeat(43), runtime: 'codex', fetchImpl: async (url, options) => {
      urls.push(url);
      const body = JSON.parse(options.body);
      return new Response(JSON.stringify(body.action === 'start' ? { ok: true, status: 'started', credential: 'C'.repeat(43) } : { ok: true }), { status: 200 });
    } });
  } finally {
    if (previous !== undefined) process.env.CEREBRO_API_URL = previous;
    if (previousTelemetry !== undefined) process.env.CEREBRO_TELEMETRY = previousTelemetry;
  }
  assert.equal(urls.length, 2);
  assert(urls.every((url) => url === `${endpoint}/cerebro-install-activation`));
  console.log('✓ agent endpoints: stable defaults, injected transport, overrides and telemetry opt-outs');
} finally { fs.rmSync(sandbox, { recursive: true, force: true }); }
