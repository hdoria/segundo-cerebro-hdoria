#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createConsoleServer } from './console-server.mjs';
import { noteTasks, parseNoteTasks } from './lib/note-tasks.mjs';
const root = mkdtempSync(join(realpathSync(tmpdir()), 'fictional-tasks-'));
const put = (ref, text) => { const path = join(root, ref); mkdirSync(join(path, '..'), { recursive: true }); writeFileSync(path, text); };
const disk = ref => readFileSync(join(root, ref));
let instance;
try {
  put('VERSION', 'fixture'); put('COMECE-AQUI.md', '# Fixture'); put('.cerebro/layout.json', JSON.stringify({ knowledgeRoot: '.' }));
  const project = '---\ntype: Project\n---\n\n# Projeto Aurora\n\n- [ ] Escrever briefing\n- [x] Reunir referências\n  - [ ] Subtarefa aninhada\n* [ ] Enviar proposta 📅 2026-11-10\n- [ ] Revisão futura 📅 2027-01-05\n- [ ] Data impossível 📅 2026-02-31\n\n```md\n- [ ] Exemplo dentro de código\n```\n\n~~~\n- [ ] Exemplo em bloco til\n~~~\n\nTexto solto - [ ] sem início de linha\n- [ ] Último item\n';
  put('projetos/aurora.md', project);
  put('journal/2026-11-12.md', '# 2026-11-12\n\n- [ ] Ligar para o fornecedor\n- [x] Pagar boleto fictício\n');
  put('journal/2026-11-11.md', '# 2026-11-11\n\n- [ ] Tarefa de ontem sem data\n');
  put('notes/solta.md', '# Nota solta\n\n- [x] Já resolvida 📅 2026-11-01\n- [x] Concluída hoje 📅 2026-11-12\n');
  put('templates/modelo.md', '# Modelo\n\n- [ ] Tarefa de template\n');
  put('type/tipo.md', '# Tipo\n\n- [ ] Tarefa de tipo\n');
  put('privado/segredo.md', '# Privada\n\n- [ ] Tarefa em pasta privada\n');
  put('notes/oculta.md', '---\nvisibility: private\n---\n# Oculta\n\n- [ ] Tarefa de nota privada\n');
  put('notes/crlf.md', '# CRLF\r\n\r\n- [ ] Linha com retorno\r\n');

  assert.equal(parseNoteTasks('- [ ] \n- [ ]sem espaço\n-[ ] colado\n- [ ] ok').length, 1, 'only well formed checkboxes count');

  instance = createConsoleServer({ root, clock: () => new Date(2026, 10, 12, 22, 30) });
  await new Promise(r => instance.server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${instance.server.address().port}`;
  const page = await fetch(base); await page.text(); const cookie = page.headers.get('set-cookie').split(';')[0];
  const session = await (await fetch(base + '/api/session', { headers: { Cookie: cookie } })).json();
  const headers = { Cookie: cookie, Origin: base, 'Content-Type': 'application/json', 'X-Cerebro-CSRF': session.csrf_token };
  const list = async () => (await fetch(base + '/api/tasks', { headers: { Cookie: cookie } })).json();
  const toggle = (payload, overrides = {}) => fetch(base + '/api/tasks/toggle', { method: 'POST', headers: { ...headers, ...overrides }, body: JSON.stringify({ confirm: true, ...payload }) });

  assert.equal((await fetch(base + '/api/tasks')).status, 403, 'listing requires a session');
  const data = await list();
  assert.equal(data.available, true); assert.equal(data.today, '2026-11-12', 'today follows the local clock');
  const refs = data.notes.map(n => n.ref);
  assert.deepEqual(refs.filter(r => /templates|type|privado|oculta/.test(r)), [], 'templates, type, private folders and private notes are skipped');
  assert.equal(refs[0], 'projetos/aurora.md', 'project notes come first');
  const aurora = data.notes.find(n => n.ref === 'projetos/aurora.md');
  assert.equal(aurora.title, 'Projeto Aurora'); assert.equal(aurora.type, 'Project'); assert.match(aurora.sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(aurora.tasks.map(t => t.text), ['Escrever briefing', 'Reunir referências', 'Subtarefa aninhada', 'Enviar proposta', 'Revisão futura', 'Data impossível', 'Último item'], 'code blocks and inline text are not tasks');
  const byText = (n, text) => n.tasks.find(t => t.text === text);
  assert.equal(byText(aurora, 'Reunir referências').done, true);
  assert.equal(byText(aurora, 'Subtarefa aninhada').indent, 2);
  assert.equal(byText(aurora, 'Enviar proposta').due, '2026-11-10'); assert.equal(byText(aurora, 'Enviar proposta').overdue, true);
  assert.equal(byText(aurora, 'Enviar proposta').today, true, 'overdue open task is in Hoje');
  assert.equal(byText(aurora, 'Revisão futura').today, false);
  assert.equal(byText(aurora, 'Data impossível').due, null, 'invalid dates are not due dates');
  assert.equal(byText(aurora, 'Escrever briefing').line, 7);
  const daily = data.notes.find(n => n.ref === 'journal/2026-11-12.md');
  assert.equal(daily.daily, true); assert.ok(daily.tasks.every(t => t.today), 'today daily tasks are Hoje');
  assert.equal(data.notes.find(n => n.ref === 'journal/2026-11-11.md').tasks[0].today, false, 'other dailies are not Hoje');
  const solta = data.notes.find(n => n.ref === 'notes/solta.md');
  assert.equal(byText(solta, 'Já resolvida').today, false, 'done overdue task is history, not Hoje');
  assert.equal(byText(solta, 'Concluída hoje').today, true);
  assert.deepEqual(data.counts, { open: 9, today_open: 2, today_done: 2, today_total: 4 });
  assert.equal(noteTasks(root, { today: '2026-11-12', vault: { daily: 'rotina' } }).notes.some(n => n.daily), false, 'a configured daily folder replaces the default folder names');

  // Toggle: one byte, nothing else.
  const before = disk('projetos/aurora.md');
  const target = byText(aurora, 'Escrever briefing');
  const payload = { ref: aurora.ref, line: target.line, expected_sha256: aurora.sha256, done: true, text_check: target.text };
  assert.equal((await toggle(payload, { 'X-Cerebro-CSRF': '' })).status, 403, 'toggle requires CSRF');
  assert.equal((await toggle(payload, { Cookie: '' })).status, 403, 'toggle requires session');
  assert.equal((await toggle(payload, { Origin: 'https://example.invalid' })).status, 403);
  assert.equal((await toggle({ ...payload, confirm: false })).status, 400, 'toggle requires explicit confirmation');
  assert.deepEqual(disk('projetos/aurora.md'), before, 'rejected requests leave the file intact');
  const ok = await toggle(payload); assert.equal(ok.status, 200);
  const result = await ok.json(); assert.equal(result.done, true); assert.match(result.sha256, /^[a-f0-9]{64}$/); assert.notEqual(result.sha256, aurora.sha256);
  const after = disk('projetos/aurora.md');
  assert.equal(after.length, before.length);
  const changed = [...before.keys()].filter(i => before[i] !== after[i]);
  assert.equal(changed.length, 1, 'exactly one byte changes');
  assert.equal(String.fromCharCode(before[changed[0]]), ' '); assert.equal(String.fromCharCode(after[changed[0]]), 'x');
  assert.equal(before.subarray(0, changed[0]).toString().split('\n').length, target.line, 'the byte belongs to the requested line');
  assert.equal(after.toString().split('\n')[target.line - 1], '- [x] Escrever briefing', 'the changed byte is the box itself');

  // Stale hash and changed line: 409, file untouched.
  const frozen = disk('projetos/aurora.md');
  const stale = await toggle(payload);
  assert.equal(stale.status, 409); assert.equal((await stale.json()).reason_code, 'task-stale');
  const fresh = (await list()).notes.find(n => n.ref === aurora.ref);
  const wrongText = await toggle({ ...payload, expected_sha256: fresh.sha256, done: false, text_check: 'Outro texto' });
  assert.equal(wrongText.status, 409); assert.equal((await wrongText.json()).reason_code, 'task-line-changed');
  const notCheckbox = await toggle({ ...payload, expected_sha256: fresh.sha256, line: 5, text_check: 'Projeto Aurora' });
  assert.equal(notCheckbox.status, 409, 'a line that is no longer a checkbox is refused');
  const fenced = await toggle({ ...payload, expected_sha256: fresh.sha256, line: 15, text_check: 'Exemplo dentro de código' });
  assert.equal(fenced.status, 409, 'lines inside code blocks cannot be toggled');
  assert.deepEqual(disk('projetos/aurora.md'), frozen, 'conflicts never touch the file');
  assert.equal((await toggle({ ...payload, expected_sha256: fresh.sha256, ref: 'privado/segredo.md' })).status, 404);

  // Unchecking restores the original bytes; CRLF files keep their endings.
  const back = await toggle({ ...payload, expected_sha256: fresh.sha256, done: false });
  assert.equal(back.status, 200); assert.deepEqual(disk('projetos/aurora.md'), before, 'toggling back restores the original file');
  const crlf = (await list()).notes.find(n => n.ref === 'notes/crlf.md');
  const crlfBefore = disk('notes/crlf.md');
  assert.equal((await toggle({ ref: crlf.ref, line: 3, expected_sha256: crlf.sha256, done: true, text_check: 'Linha com retorno' })).status, 200);
  assert.equal([...crlfBefore.keys()].filter(i => crlfBefore[i] !== disk('notes/crlf.md')[i]).length, 1);
  // Marcadores `+`, lista numerada, cerca recuada dentro de item de lista e pedido sem efeito.
  put('notes/marcadores.md', '# Marcadores\n\n+ [ ] Com mais\n1. [ ] Numerada\n- [X] Maiúscula\n- item\n    ```\n    - [ ] Código em lista\n    ```\n');
  const marcadores = (await list()).notes.find(n => n.ref === 'notes/marcadores.md');
  assert.deepEqual(marcadores.tasks.map(t => [t.text, t.done]), [['Com mais', false], ['Numerada', false], ['Maiúscula', true]]);
  const upperBefore = disk('notes/marcadores.md');
  const noop = await toggle({ ref: marcadores.ref, line: 5, expected_sha256: marcadores.sha256, done: true, text_check: 'Maiúscula' });
  assert.equal(noop.status, 200); assert.equal((await noop.json()).sha256, marcadores.sha256);
  assert.deepEqual(disk('notes/marcadores.md'), upperBefore, 'asking for the current state writes nothing');
  assert.equal((await toggle({ ref: marcadores.ref, line: 4, expected_sha256: marcadores.sha256, done: true, text_check: 'Numerada' })).status, 200);
  assert.equal(disk('notes/marcadores.md').toString().split('\n')[3], '1. [x] Numerada');
  // Notas só com tarefas feitas ficam depois das que ainda têm tarefa aberta.
  put('notes/zebra.md', '# Zebra\n\n- [ ] Aberta numa nota de título tardio\n');
  const order = (await list()).notes.map(n => n.ref);
  assert.ok(order.indexOf('notes/zebra.md') < order.indexOf('notes/solta.md'), 'groups with open tasks come before groups with only done tasks');
  // Formato do vault do produto: fios com `type: Thread` e dailies em meu-negocio/dailies.
  const product = mkdtempSync(join(realpathSync(tmpdir()), 'fictional-product-tasks-'));
  try {
    const putP = (ref, text) => { const path = join(product, ref); mkdirSync(join(path, '..'), { recursive: true }); writeFileSync(path, text); };
    putP('.cerebro/layout.json', JSON.stringify({ knowledgeRoot: '.' }));
    putP('type/thread.md', '---\ntype: Type\n---\n# Thread\n\n- [ ] Tarefa do tipo\n');
    putP('meu-negocio/fios/fio-ficticio.md', '---\ntype: Thread\nstatus: Active\n---\n# Fio fictício\n\n- [ ] Ligar para cliente fictício\n');
    putP('meu-negocio/dailies/2026-11-12.md', '---\ntype: Daily\n---\n# 2026-11-12\n\n- [ ] Pendência fictícia\n');
    const productTasks = noteTasks(product, { today: '2026-11-12' });
    assert.deepEqual(productTasks.notes.map(n => [n.ref, n.type, n.project, n.daily]), [['meu-negocio/fios/fio-ficticio.md', 'Thread', true, false], ['meu-negocio/dailies/2026-11-12.md', 'Daily', false, true]]);
  } finally { rmSync(product, { recursive: true, force: true }); }
  console.log('✓ tasks API lists checkboxes by note, skips templates, code and private notes, and toggles exactly one byte with hash and line checks');
} finally { if (instance) await new Promise(r => instance.server.close(r)); rmSync(root, { recursive: true, force: true }); }
