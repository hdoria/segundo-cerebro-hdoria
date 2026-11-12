const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENT_RE = /^[a-z][a-z_]{0,40}$/;
const LABEL_RE = /^[0-9A-Za-z][0-9A-Za-z.+_-]{0,31}$/;
const SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const RUNTIMES = new Set(['claude-code', 'codex', 'gemini-cli', 'antigravity', 'outro']);
const DECISIONS = new Set(['approved', 'changes_requested', 'rejected']);
const MAX_BODY = 4096;

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8' },
});

const pick = (value, re) => (typeof value === 'string' && re.test(value) ? value : null);

export function technicalPing(body) {
  const installId = pick(body?.install_id, UUID_RE)?.toLowerCase();
  const event = pick(body?.event, EVENT_RE);
  if (!installId || !event) return null;
  const duration = Number.isInteger(body.duration_ms) && body.duration_ms >= 0 && body.duration_ms <= 86_400_000
    ? body.duration_ms : null;
  return {
    install_id: installId,
    event,
    version: pick(body.version, LABEL_RE),
    os: pick(body.os, LABEL_RE),
    runtime: RUNTIMES.has(body.runtime) ? body.runtime : null,
    system_id: pick(body.system_id, SLUG_RE),
    run_id: pick(body.run_id, UUID_RE),
    release_version: pick(body.release_version, LABEL_RE),
    eval_version: pick(body.eval_version, LABEL_RE),
    eval_passed: typeof body.eval_passed === 'boolean' ? Number(body.eval_passed) : null,
    human_decision: DECISIONS.has(body.human_decision) ? body.human_decision : null,
    reason_code: pick(body.reason_code, SLUG_RE),
    duration_ms: duration,
  };
}

async function readJson(request) {
  if (Number(request.headers.get('content-length') || 0) > MAX_BODY) return null;
  const text = await request.text();
  if (text.length > MAX_BODY) return null;
  try { return JSON.parse(text); } catch { return null; }
}

async function handlePing(request, env) {
  const ping = technicalPing(await readJson(request));
  if (!ping) return json(400, { ok: false, reason: 'invalid_ping' });
  const columns = Object.keys(ping);
  await env.DB.prepare(
    `INSERT INTO pings (received_at, ${columns.join(', ')}) VALUES (?, ${columns.map(() => '?').join(', ')})`,
  ).bind(new Date().toISOString(), ...columns.map((key) => ping[key])).run();
  return new Response(null, { status: 204 });
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === '/health') return json(200, { ok: true });
    if (request.method !== 'POST') return json(405, { ok: false, reason: 'method_not_allowed' });
    try {
      if (pathname === '/cerebro-ping') return await handlePing(request, env);
      if (pathname === '/cerebro-install-activation') return json(403, { ok: false, reason: 'activation_not_available' });
      if (pathname === '/api/system-distribution') return json(403, { error: 'catalog_not_available' });
      if (pathname === '/api/library-sync') return json(403, { access: false, reason: 'entitlement' });
      return json(404, { ok: false, reason: 'not_found' });
    } catch {
      return json(500, { ok: false, reason: 'internal_error' });
    }
  },
};
