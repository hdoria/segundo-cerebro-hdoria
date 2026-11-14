#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { autoImportMinutes, autoImportStatusPath, createAutoImporter, readAutoImportStatus } from './lib/auto-import.mjs';
import { createConsoleServer } from './console-server.mjs';
import { operationalInbox } from './lib/operational-inbox.mjs';

const files = (root) => {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path); else out.push(relative(root, path));
    }
  };
  walk(root);
  return out.sort();
};

const roots = [];
const scratch = () => { const root = mkdtempSync(join(realpathSync(tmpdir()), 'cerebro-auto-import-')); roots.push(root); return root; };
const brain = () => {
  const root = scratch();
  mkdirSync(join(root, '.cerebro'));
  writeFileSync(join(root, 'VERSION'), 'fixture\n');
  writeFileSync(join(root, 'COMECE-AQUI.md'), '# Fixture\n');
  return root;
};

try {
  assert.equal(autoImportMinutes({}), 30, 'padrão de 30 minutos');
  assert.equal(autoImportMinutes({ CEREBRO_AUTO_IMPORT_MINUTES: '0' }), 0, '0 desliga');
  assert.equal(autoImportMinutes({ CEREBRO_AUTO_IMPORT_MINUTES: '5' }), 5);
  assert.equal(autoImportMinutes({ CEREBRO_AUTO_IMPORT_MINUTES: 'abc' }), 30, 'valor inválido volta ao padrão');

  const root = scratch();
  let calls = 0;
  let release;
  const gate = new Promise((done) => { release = done; });
  const importer = createAutoImporter({
    root,
    minutes: 30,
    steps: [
      ['history', async () => { calls += 1; await gate; return { mode: 'vault' }; }],
      ['journal', () => { throw new Error(`falhou ao ler ${root}/journal/2026-11-14.md`); }],
    ],
    clock: () => new Date('2026-11-14T10:00:00.000Z'),
  });
  const first = importer.runOnce();
  const second = importer.runOnce();
  assert.equal(first, second, 'chamada durante uma execução recebe a mesma execução');
  release();
  const status = await first;
  assert.equal(calls, 1, 'nunca dois imports rodando ao mesmo tempo');
  assert.deepEqual(status.steps.history, { ok: true, mode: 'vault' });
  assert.deepEqual(status.steps.journal, { ok: false, error_code: 'import-failed' }, 'erro com caminho vira código curto');
  assert.doesNotMatch(JSON.stringify(readAutoImportStatus(root)), new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'estado não guarda caminho interno');
  assert.deepEqual(files(root), [relative(root, autoImportStatusPath(root))], 'só o estado no runtime foi gravado');

  const inbox = operationalInbox(root, { model: {}, decisions: { cases: [] }, autoImport: readAutoImportStatus(root) });
  const notice = inbox.notices.find((item) => item.target.kind === 'auto-import');
  assert.equal(notice?.title, 'Importação automática do journal falhou', 'falha aparece em Avisos');
  assert.equal(notice.severity, 'error');
  assert.equal(inbox.notices.some((item) => item.target.ref === 'history'), false, 'passo que deu certo não vira aviso');

  const coded = scratch();
  const status2 = await createAutoImporter({ root: coded, steps: [['journal', () => { throw new Error('journal-source-ref-invalid'); }]] }).runOnce();
  assert.equal(status2.steps.journal.error_code, 'journal-source-ref-invalid', 'código do importador é preservado');

  // Servidor real: sobe, importa no boot com os importadores de verdade, e o vault fica intocado.
  const served = brain();
  const before = files(served);
  const instance = createConsoleServer({ root: served, autoImport: true });
  await new Promise((done) => instance.server.listen(0, '127.0.0.1', done));
  for (let attempt = 0; attempt < 80 && !readAutoImportStatus(served); attempt += 1) await new Promise((done) => setTimeout(done, 100));
  await new Promise((done) => instance.server.close(done));
  const booted = readAutoImportStatus(served);
  assert(booted, 'Console importa no boot sem ação manual');
  assert.equal(booted.steps.history.ok, true);
  assert.equal(booted.steps.journal.ok, true);
  const written = files(served).filter((path) => !before.includes(path));
  assert(written.length && written.every((path) => path.startsWith(join('.cerebro', 'runtime'))), `nada fora do runtime: ${written.join(', ')}`);

  const quiet = brain();
  const plain = createConsoleServer({ root: quiet });
  await new Promise((done) => plain.server.listen(0, '127.0.0.1', done));
  await new Promise((done) => setTimeout(done, 50));
  await new Promise((done) => plain.server.close(done));
  assert.equal(readAutoImportStatus(quiet), null, 'sem a opção, o servidor não importa');
} finally {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
}

console.log('✓ Console importa histórico e journal no boot e em intervalo, uma execução por vez');
