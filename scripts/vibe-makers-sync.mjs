#!/usr/bin/env node
// Sincroniza o conteúdo da comunidade Vibe Makers para dentro deste Cérebro.
// O servidor decide o acesso; este script só pergunta e baixa. O conteúdo mora em
// comunidade/vibe-makers/conteudo/, fora do Git da sua cópia (gitignore), como toda
// configuração pessoal.
// Nunca quebra o trabalho local: qualquer falha vira mensagem, não erro.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { COMMUNITY_SYNC_URL } from './lib/community-endpoints.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const URL = COMMUNITY_SYNC_URL;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function syncVibeMakers({ root = ROOT, fetchImpl = fetch, log = console.log, ping = spawnSync } = {}) {
  const DEST = join(root, 'comunidade', 'vibe-makers', 'conteudo');
  const read = (relative) => {
    try { return readFileSync(join(root, relative), 'utf8').trim(); } catch { return ''; }
  };
  const updateMessage = 'vibe-makers: atualize o Cérebro para 1.38.0 ou superior e vincule esta instalação pela plataforma.';
  const installId = read('.cerebro/id').toLowerCase();
  if (!UUID_RE.test(installId)) {
    log('vibe-makers: esta instalação ainda não tem id. Rode /comecar primeiro.');
    return;
  }

  const installCredential = read('.cerebro/install-credential');
  if (!/^[A-Za-z0-9_-]{43}$/.test(installCredential)) {
    log(updateMessage);
    return;
  }

  let resp;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const r = await fetchImpl(URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ install_id: installId, install_credential: installCredential }),
      signal: controller.signal,
    });
    if (r.status === 401) {
      log(updateMessage);
      return;
    }
    if (!r.ok && r.status !== 403) throw new Error('sync_unavailable');
    resp = await r.json();
    // An error status must never allow a download, regardless of its body.
    if (r.status === 403) resp = { access: false, reason: 'entitlement' };
  } catch {
    log('vibe-makers: servidor indisponível agora, tenta de novo mais tarde.');
    return;
  } finally {
    clearTimeout(timeout);
  }

  if (resp?.access !== true) {
    if (resp?.reason === 'entitlement') {
      log('vibe-makers: não encontramos um acesso ativo à comunidade Vibe Makers para esta instalação.');
      log('  Se você acabou de entrar, o acesso pode levar alguns minutos para refletir.');
    } else if (resp?.reason === 'identity') {
      log(updateMessage);
    } else {
      log('vibe-makers: servidor indisponível agora. Tente de novo mais tarde.');
    }
    return;
  }

  const items = Array.isArray(resp.items) ? resp.items : [];
  if (!items.length) {
    log('vibe-makers: acesso OK, ainda não há itens publicados.');
    return;
  }

  mkdirSync(DEST, { recursive: true });
  let novos = 0, atualizados = 0, iguais = 0;
  for (const item of items) {
    const rel = normalize(String(item.path ?? ''));
    if (!rel || rel.startsWith('..') || rel.startsWith('/') || rel.includes('\\')) continue;
    let corpo;
    try {
      const r = await fetchImpl(String(item.url ?? ''), { signal: AbortSignal.timeout(15000) });
      if (!r.ok) continue;
      corpo = Buffer.from(await r.arrayBuffer());
    } catch { continue; }
    const alvo = join(DEST, rel);
    if (!resolve(alvo).startsWith(DEST)) continue;
    mkdirSync(dirname(alvo), { recursive: true });
    const existia = existsSync(alvo) ? readFileSync(alvo) : null;
    if (existia && existia.equals(corpo)) { iguais += 1; continue; }
    writeFileSync(alvo, corpo);
    if (existia) atualizados += 1; else novos += 1;
    log(`  ${existia ? 'atualizado' : 'novo'}: comunidade/vibe-makers/conteudo/${rel}`);
  }
  log(`vibe-makers: sincronizado: ${novos} novo(s) · ${atualizados} atualizado(s) · ${iguais} sem mudança.`);

  // Telemetria mínima do uso (mesmas regras do ping: nunca interrompe, opt-out respeitado).
  ping(process.execPath, [join(root, '.agents', 'scripts', 'ping.mjs'), 'operou', 'vibe-makers'], {
    stdio: 'ignore', timeout: 5000,
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await syncVibeMakers();
}
