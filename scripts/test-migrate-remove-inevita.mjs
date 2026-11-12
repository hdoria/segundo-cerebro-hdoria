#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const SCRIPT = resolve(process.cwd(), 'scripts/migrate-remove-inevita.mjs');
const SECRET = 'valor-privado-que-nao-pode-aparecer-na-saida';

function write(root, ref, text) {
  const path = join(root, ref);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

function writeJson(root, ref, value, indent = 2) {
  write(root, ref, `${JSON.stringify(value, null, indent)}\n`);
}

function digest(root, ref) {
  return createHash('sha256').update(readFileSync(join(root, ref))).digest('hex');
}

function run(root, ...flags) {
  const result = spawnSync(process.execPath, [SCRIPT, `--root=${root}`, ...flags], { encoding: 'utf8' });
  return { code: result.status, out: result.stdout, err: result.stderr };
}

function backups(root) {
  const base = join(root, '.cerebro', 'runtime', 'migration-backup');
  return existsSync(base) ? readdirSync(base).sort() : [];
}

function buildBrain() {
  const root = mkdtempSync(join(tmpdir(), 'migrate-remove-inevita-'));
  writeJson(root, '.cerebro/manifest.json', { protocol_version: 1, distribution: 'inevita', note: SECRET });
  writeJson(root, '.cerebro/contracts/routines/daily.json', {
    routine_id: 'daily', privacy: { content_shared_with_inevita: false, prompt_exposed: false },
  });
  writeJson(root, '.cerebro/contracts/systems/s.json', {
    system_id: 's', capability: { origin: 'inevita', version: '1.0.0' }, tags: ['inevita'],
  });
  writeJson(root, '.cerebro/runtime/receipts/deep.json', {
    receipt: { steps: [{ privacy: { content_shared_with_inevita: false } }, { privacy: { shared_with_inevita: false } }] },
    inventory: { inventory_shared_with_inevita: false },
  }, 4);
  write(root, '.cerebro/runtime/ledger/runs.jsonl', [
    JSON.stringify({ run_id: 'a', privacy: { content_shared_with_inevita: false } }),
    '{"run_id":"b","privacy":{"content_shared_with_community":false}}',
    JSON.stringify({ run_id: 'c', origin: 'inevita' }),
    '',
  ].join('\n'));
  writeJson(root, '.cerebro/runtime/clean.json', { ok: true });
  write(root, '.cerebro/runtime/broken.json', `{"content_shared_with_inevita": ${SECRET}`);
  write(root, '.cerebro/notes.txt', 'content_shared_with_inevita fora de JSON');
  writeJson(root, 'outside.json', { privacy: { content_shared_with_inevita: false } });
  writeJson(root, 'meu-negocio/dado.json', { privacy: { content_shared_with_inevita: false } });
  return root;
}

const roots = [];
const make = () => { const root = buildBrain(); roots.push(root); return root; };

try {
  const root = make();
  const tracked = ['.cerebro/manifest.json', '.cerebro/contracts/routines/daily.json', '.cerebro/contracts/systems/s.json',
    '.cerebro/runtime/receipts/deep.json', '.cerebro/runtime/ledger/runs.jsonl', '.cerebro/runtime/clean.json',
    '.cerebro/runtime/broken.json', '.cerebro/notes.txt', 'outside.json', 'meu-negocio/dado.json'];
  const before = Object.fromEntries(tracked.map((ref) => [ref, digest(root, ref)]));

  const dry = run(root);
  assert.equal(dry.code, 0, dry.err);
  assert.match(dry.out, /dry-run/);
  assert.match(dry.out, /manifest\.json/);
  assert.match(dry.out, /runs\.jsonl/);
  assert.match(dry.out, /broken\.json \(json-invalido\)/);
  assert.equal(dry.out.includes(SECRET), false, 'a saída nunca imprime conteúdo');
  for (const ref of tracked) assert.equal(digest(root, ref), before[ref], `dry-run não pode tocar ${ref}`);
  assert.deepEqual(backups(root), []);

  const missing = run(join(root, 'inexistente'));
  assert.equal(missing.code, 2);
  assert.equal(spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' }).status, 1);

  const applied = run(root, '--apply');
  assert.equal(applied.code, 0, applied.err);
  assert.equal(applied.out.includes(SECRET), false);
  assert.equal(backups(root).length, 1);
  const backupRef = `.cerebro/runtime/migration-backup/${backups(root)[0]}`;
  assert.match(backupRef, /remove-inevita-\d{4}-\d{2}-\d{2}T/);

  const manifest = JSON.parse(readFileSync(join(root, '.cerebro/manifest.json'), 'utf8'));
  assert.equal(manifest.distribution, 'hdoria');
  assert.equal(manifest.note, SECRET);
  const routine = JSON.parse(readFileSync(join(root, '.cerebro/contracts/routines/daily.json'), 'utf8'));
  assert.deepEqual(routine.privacy, { content_shared_with_community: false, prompt_exposed: false });
  assert.equal(readFileSync(join(root, '.cerebro/contracts/routines/daily.json'), 'utf8').startsWith('{\n  "routine_id"'), true, 'indentação original preservada');
  const system = JSON.parse(readFileSync(join(root, '.cerebro/contracts/systems/s.json'), 'utf8'));
  assert.equal(system.capability.origin, 'community');
  assert.deepEqual(system.tags, ['inevita'], 'valores fora de origin/distribution não são tocados');
  const deepText = readFileSync(join(root, '.cerebro/runtime/receipts/deep.json'), 'utf8');
  const deep = JSON.parse(deepText);
  assert.equal(deep.receipt.steps[0].privacy.content_shared_with_community, false);
  assert.equal(deep.receipt.steps[1].privacy.shared_with_community, false);
  assert.equal(deep.inventory.inventory_shared_with_community, false);
  assert.match(deepText, /^\{\n    "receipt"/, 'indentação de 4 espaços preservada');
  assert.equal(/inevita/.test(deepText), false);

  const lines = readFileSync(join(root, '.cerebro/runtime/ledger/runs.jsonl'), 'utf8').split('\n');
  assert.equal(lines.length, 4);
  assert.deepEqual(JSON.parse(lines[0]), { run_id: 'a', privacy: { content_shared_with_community: false } });
  assert.equal(lines[1], '{"run_id":"b","privacy":{"content_shared_with_community":false}}', 'linha limpa permanece byte a byte');
  assert.deepEqual(JSON.parse(lines[2]), { run_id: 'c', origin: 'community' });
  assert.equal(lines[3], '');

  for (const ref of ['.cerebro/runtime/clean.json', '.cerebro/runtime/broken.json', '.cerebro/notes.txt', 'outside.json', 'meu-negocio/dado.json']) {
    assert.equal(digest(root, ref), before[ref], `${ref} não pode mudar`);
  }

  for (const ref of ['.cerebro/manifest.json', '.cerebro/contracts/routines/daily.json', '.cerebro/contracts/systems/s.json',
    '.cerebro/runtime/receipts/deep.json', '.cerebro/runtime/ledger/runs.jsonl']) {
    assert.equal(digest(root, `${backupRef}/${ref}`), before[ref], `backup de ${ref} precisa ser o original`);
  }
  assert.equal(existsSync(join(root, backupRef, '.cerebro/runtime/clean.json')), false, 'só arquivos alterados entram no backup');

  const afterApply = Object.fromEntries(tracked.map((ref) => [ref, digest(root, ref)]));
  const again = run(root, '--apply');
  assert.equal(again.code, 0, again.err);
  assert.match(again.out, /nada a migrar/);
  assert.equal(backups(root).length, 1, 'segunda execução não cria backup');
  for (const ref of tracked) assert.equal(digest(root, ref), afterApply[ref], `idempotência: ${ref}`);

  const rootDry = run(root, '--json');
  assert.equal(JSON.parse(rootDry.out).files_to_change, 0);

  const conflict = make();
  writeJson(conflict, '.cerebro/runtime/conflict.json', { privacy: { content_shared_with_inevita: false, content_shared_with_community: true } });
  const conflictBefore = digest(conflict, '.cerebro/manifest.json');
  const refused = run(conflict, '--apply');
  assert.equal(refused.code, 2);
  assert.match(refused.err, /conflito/);
  assert.equal(digest(conflict, '.cerebro/manifest.json'), conflictBefore, 'conflito aborta sem escrever nada');
  assert.deepEqual(backups(conflict), []);

  const linked = make();
  symlinkSync(join(linked, 'outside.json'), join(linked, '.cerebro/runtime/link.json'));
  const linkedBefore = digest(linked, 'outside.json');
  const manifestBefore = digest(linked, '.cerebro/manifest.json');
  for (const flags of [[], ['--apply']]) {
    const refusedLink = run(linked, ...flags);
    assert.equal(refusedLink.code, 2);
    assert.match(refusedLink.err, /links simbólicos recusados/);
  }
  assert.equal(digest(linked, 'outside.json'), linkedBefore);
  assert.equal(digest(linked, '.cerebro/manifest.json'), manifestBefore);
  assert.deepEqual(backups(linked), []);

  const linkedDirectory = make();
  mkdirSync(join(linkedDirectory, 'externo'));
  writeJson(linkedDirectory, 'externo/x.json', { privacy: { content_shared_with_inevita: false } });
  symlinkSync(join(linkedDirectory, 'externo'), join(linkedDirectory, '.cerebro/runtime/dir-link'));
  assert.equal(run(linkedDirectory, '--apply').code, 2);
  assert.equal(JSON.parse(readFileSync(join(linkedDirectory, 'externo/x.json'), 'utf8')).privacy.content_shared_with_inevita, false);

  const linkedCerebro = mkdtempSync(join(tmpdir(), 'migrate-remove-inevita-'));
  roots.push(linkedCerebro);
  mkdirSync(join(linkedCerebro, 'real'));
  symlinkSync(join(linkedCerebro, 'real'), join(linkedCerebro, '.cerebro'));
  assert.equal(run(linkedCerebro, '--apply').code, 2);

  console.log('migrate-remove-inevita: ok (dry-run, apply, backup, idempotência, JSONL, chaves aninhadas, conflito, symlinks)');
} finally {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
}
