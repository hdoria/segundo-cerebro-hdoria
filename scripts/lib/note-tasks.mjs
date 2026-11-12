// Tarefas das notas: linhas `- [ ]` / `- [x]` lidas do Markdown e marcadas de volta no
// próprio arquivo. A leitura passa pelo scan da biblioteca (nota privada nunca entra) e a
// gravação passa por saveLocalFile (hash esperado, trava e recibo de recuperação).
// Só o caractere do checkbox muda. Nada aqui interpreta o vault do dono além de Markdown.
import { posix } from 'node:path';
import { readableNotes, readLocalFile, saveLocalFile } from './local-file-browser.mjs';

const TASK_LINE = /^(\s*)(?:[-*+]|\d{1,9}[.)])\s+\[([ xX])\]\s+(\S.*?)\s*$/;
const DUE = /📅\s*(\d{4})-(\d{2})-(\d{2})/u;
// Cercas dentro de itens de lista vêm recuadas além de 3 espaços; tudo que estiver nelas é código.
const FENCE = /^\s*(`{3,}|~{3,})/;
const EXCLUDED_DIRS = new Set(['templates', 'type']);
const DAILY_DIRS = new Set(['journal', 'daily', 'dailies', 'diario', 'dia']);
const PROJECT_TYPES = new Set(['project', 'thread', 'projeto']);
const fail = (code) => { throw new Error(code); };

function validDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function localDate(now) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// Linhas de tarefa de um texto Markdown. Ignora frontmatter e blocos de código.
export function parseNoteTasks(text) {
  const lines = text.split('\n');
  const tasks = [];
  let offset = 0;
  let index = 0;
  if (/^﻿?---[ \t]*\r?$/.test(lines[0] ?? '')) {
    const close = lines.findIndex((line, at) => at > 0 && /^---[ \t]*\r?$/.test(line));
    if (close > 0) {
      for (; index <= close; index += 1) offset += lines[index].length + 1;
    }
  }
  let fence = null;
  for (; index < lines.length; offset += lines[index].length + 1, index += 1) {
    const line = lines[index].replace(/\r$/, '');
    const marker = FENCE.exec(line);
    if (fence) {
      if (marker && marker[1][0] === fence.char && marker[1].length >= fence.length && !line.replace(FENCE, '').trim()) fence = null;
      continue;
    }
    if (marker) { fence = { char: marker[1][0], length: marker[1].length }; continue; }
    const match = TASK_LINE.exec(line);
    if (!match) continue;
    const due = DUE.exec(match[3]);
    const validDue = due && validDate(Number(due[1]), Number(due[2]), Number(due[3])) ? `${due[1]}-${due[2]}-${due[3]}` : null;
    const label = (due ? match[3].replace(DUE, '') : match[3]).replace(/\s{2,}/g, ' ').trim();
    if (!label) continue;
    tasks.push({
      line: index + 1, indent: match[1].replace(/\t/g, '  ').length, done: match[2] !== ' ',
      text: label, due: validDue,
      // posição do caractere entre colchetes, para a gravação mexer só nele
      box_index: offset + match[1].length + line.slice(match[1].length).indexOf('[') + 1,
    });
  }
  return tasks;
}

function excluded(ref) {
  return posix.dirname(ref).split('/').some((part) => EXCLUDED_DIRS.has(part.toLowerCase()));
}

function dailyDirOf(config) {
  return typeof config?.daily === 'string' ? config.daily.replace(/\/+$/, '') : null;
}

function isTodayDaily(ref, today, dailyDir) {
  if (posix.basename(ref) !== `${today}.md`) return false;
  const dir = posix.dirname(ref);
  return dailyDir ? dir === dailyDir : DAILY_DIRS.has(posix.basename(dir).toLowerCase());
}

export function noteTasks(root, { today, vault = null } = {}) {
  const { available, complete, notes } = readableNotes(root);
  if (!available) return { available: false };
  const dailyDir = dailyDirOf(vault);
  const groups = [];
  const counts = { open: 0, today_open: 0, today_done: 0, today_total: 0 };
  for (const note of notes) {
    if (excluded(note.ref)) continue;
    const daily = isTodayDaily(note.ref, today, dailyDir);
    const tasks = parseNoteTasks(note.text).map(({ box_index, ...task }) => {
      // Hoje: tarefa da daily de hoje, vencendo hoje (aberta ou feita) ou atrasada e ainda aberta.
      const overdue = Boolean(task.due && task.due < today && !task.done);
      const is_today = daily || task.due === today || overdue;
      return { ...task, today: is_today, overdue };
    });
    if (!tasks.length) continue;
    for (const task of tasks) {
      if (!task.done) counts.open += 1;
      if (task.today) { counts.today_total += 1; counts[task.done ? 'today_done' : 'today_open'] += 1; }
    }
    groups.push({ ref: note.ref, title: note.title, type: note.type, sha256: note.sha256, daily, project: PROJECT_TYPES.has(String(note.type || '').toLowerCase()), tasks });
  }
  // Notas com tarefas abertas fora do bloco Hoje vêm antes das que só têm tarefas feitas.
  const hasOpen = (group) => Number(group.tasks.some((task) => !task.done && !task.today));
  groups.sort((a, b) => hasOpen(b) - hasOpen(a) || Number(b.project) - Number(a.project) || a.title.localeCompare(b.title) || a.ref.localeCompare(b.ref));
  return { available: true, complete, today, counts, notes: groups };
}

// Marca ou desmarca uma tarefa. Confere hash e texto da linha antes de gravar; só o
// caractere do checkbox muda.
export function toggleNoteTask(root, { ref, line, expected_sha256, done, text_check } = {}) {
  if (!Number.isSafeInteger(line) || line < 1 || typeof done !== 'boolean' || typeof text_check !== 'string' || !text_check) fail('task-invalid');
  const file = readLocalFile(root, ref);
  if (file.sha256 !== expected_sha256) fail('task-stale');
  const task = parseNoteTasks(file.text).find((item) => item.line === line);
  if (!task || task.text !== text_check) fail('task-line-changed');
  if (task.done === done) return { ref, line, done, sha256: file.sha256 };
  const mark = done ? 'x' : ' ';
  const text = `${file.text.slice(0, task.box_index)}${mark}${file.text.slice(task.box_index + 1)}`;
  const saved = saveLocalFile(root, { ref, expected_sha256, text });
  return { ref, line, done, sha256: saved.sha256 };
}
