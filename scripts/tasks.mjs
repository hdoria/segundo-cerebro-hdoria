#!/usr/bin/env node
// Tarefas das notas para agentes: lista as abertas e fecha uma de cada vez com a mesma gravação
// conferida do Console (hash da nota e texto da linha; só o caractere do checkbox muda).
//
// uso, a partir do vault:
//   node .cerebro/bin/cerebro.mjs tasks list [--json]
//   node .cerebro/bin/cerebro.mjs tasks close <id> --confirm
// O id sai do list e resume nota, linha e texto: fechar não exige passar texto livre pelo shell.
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveRootsOrExit } from './lib/installation.mjs';
import { localDate, noteTasks, toggleNoteTask } from './lib/note-tasks.mjs';
import { layout } from './lib/system-protocol.mjs';

const ROOT = resolveRootsOrExit({ scriptRoot: resolve(dirname(fileURLToPath(import.meta.url)), '..') }).vault;

const taskId = (ref, task) => createHash('sha256').update(`${ref}\n${task.line}\n${task.text}`).digest('hex').slice(0, 12);

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function vaultConfig() {
  try {
    const value = layout(ROOT).vault;
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function read() {
  let data;
  try { data = noteTasks(ROOT, { today: localDate(new Date()), vault: vaultConfig() }); } catch { data = null; }
  if (!data?.available) fail('as notas deste vault não estão disponíveis para leitura');
  return data;
}

const positional = process.argv.slice(2).filter((argument) => !argument.startsWith('--'));
const [action = 'list', id = ''] = positional;

if (action === 'list') {
  const data = read();
  const open = data.notes.flatMap((note) => note.tasks.filter((task) => !task.done)
    .map((task) => ({ id: taskId(note.ref, task), ref: note.ref, note: note.title, line: task.line, text: task.text, due: task.due, today: task.today })));
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ complete: data.complete !== false, open }, null, 2));
  } else {
    for (const task of open) console.log(`${task.id} · ${task.ref}:${task.line}${task.due ? ` · 📅 ${task.due}` : ''} · ${task.text}`);
    console.log(`${open.length} ${open.length === 1 ? 'tarefa aberta' : 'tarefas abertas'}${data.complete === false ? ' (leitura parcial)' : ''}`);
  }
} else if (action === 'close') {
  if (!/^[a-f0-9]{12}$/.test(id)) fail('uso: tasks close <id> --confirm (o id sai de tasks list)');
  const data = read();
  const match = data.notes.flatMap((note) => note.tasks.map((task) => ({ note, task }))).find(({ note, task }) => taskId(note.ref, task) === id);
  if (!match) fail('nenhuma tarefa com esse id; a nota pode ter mudado. Rode tasks list de novo');
  const { note, task } = match;
  const label = `${note.ref}:${task.line} · ${task.text}`;
  if (task.done) { console.log(`já estava feita: ${label}`); process.exit(0); }
  if (!process.argv.includes('--confirm')) {
    console.log(`Prévia: marcaria como feita ${label}. Rode de novo com --confirm.`);
    process.exit(0);
  }
  try {
    toggleNoteTask(ROOT, { ref: note.ref, line: task.line, expected_sha256: note.sha256, done: true, text_check: task.text });
  } catch (error) {
    const reason = String(error?.message || '');
    fail(['task-stale', 'task-line-changed', 'local-note-conflict', 'local-note-busy'].includes(reason)
      ? 'a nota mudou enquanto gravava; nada foi alterado. Rode tasks list de novo e use o id novo'
      : 'não foi possível marcar a tarefa; nada foi alterado');
  }
  console.log(`✓ feita: ${label}`);
} else {
  fail(`ação desconhecida: ${action.slice(0, 20)}. Use list ou close.`);
}
