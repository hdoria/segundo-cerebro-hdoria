#!/usr/bin/env node
import { createHash, randomBytes } from 'node:crypto';
import {
  closeSync,
  constants,
  copyFileSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const KEY_RENAMES = new Map([
  ['content_shared_with_inevita', 'content_shared_with_community'],
  ['shared_with_inevita', 'shared_with_community'],
  ['inventory_shared_with_inevita', 'inventory_shared_with_community'],
]);
export const VALUE_RENAMES = new Map([
  ['origin', { from: 'inevita', to: 'community' }],
  ['distribution', { from: 'inevita', to: 'hdoria' }],
]);

const BACKUP_DIR = join('runtime', 'migration-backup');
const MAX_BYTES = 64 * 1024 * 1024;

class RefusedError extends Error {}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function migrateValue(value, counts) {
  if (Array.isArray(value)) return value.map((item) => migrateValue(item, counts));
  if (!value || typeof value !== 'object') return value;
  const next = {};
  for (const [key, child] of Object.entries(value)) {
    const renamed = KEY_RENAMES.get(key);
    const migrated = migrateValue(child, counts);
    if (renamed) {
      if (Object.hasOwn(value, renamed)) {
        if (!sameJson(migrateValue(value[renamed], {}), migrated)) {
          throw new RefusedError(`conflito: ${key} e ${renamed} coexistem com valores diferentes`);
        }
        counts[key] = (counts[key] || 0) + 1;
        continue;
      }
      next[renamed] = migrated;
      counts[key] = (counts[key] || 0) + 1;
      continue;
    }
    const valueRename = VALUE_RENAMES.get(key);
    if (valueRename && migrated === valueRename.from) {
      next[key] = valueRename.to;
      counts[`${key}:${valueRename.from}`] = (counts[`${key}:${valueRename.from}`] || 0) + 1;
      continue;
    }
    next[key] = migrated;
  }
  return next;
}

function serialize(value, indent) {
  return indent ? JSON.stringify(value, null, indent) : JSON.stringify(value);
}

function migrateJsonText(text) {
  const counts = {};
  let value;
  try { value = JSON.parse(text); } catch { return { status: 'invalid' }; }
  const migrated = migrateValue(value, counts);
  if (!Object.keys(counts).length) return { status: 'unchanged' };
  const indent = /^\s*[[{]\s*\n(\s+)\S/.exec(text)?.[1] ?? null;
  const trailing = text.endsWith('\n') ? '\n' : '';
  return { status: 'changed', counts, text: `${serialize(migrated, indent)}${trailing}` };
}

function migrateJsonlText(text) {
  const counts = {};
  let invalidLines = 0;
  const lines = text.split('\n');
  const out = lines.map((line) => {
    if (!line.trim()) return line;
    let value;
    try { value = JSON.parse(line); } catch { invalidLines += 1; return line; }
    const lineCounts = {};
    const migrated = migrateValue(value, lineCounts);
    if (!Object.keys(lineCounts).length) return line;
    for (const [key, amount] of Object.entries(lineCounts)) counts[key] = (counts[key] || 0) + amount;
    return JSON.stringify(migrated);
  });
  if (!Object.keys(counts).length) return { status: 'unchanged', invalidLines };
  return { status: 'changed', counts, invalidLines, text: out.join('\n') };
}

function scan(cerebroDir) {
  const files = [];
  const symlinks = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (path === join(cerebroDir, BACKUP_DIR)) continue;
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) {
        let targetIsDirectory = true;
        try { targetIsDirectory = statSync(path).isDirectory(); } catch { /* link quebrado conta como suspeito */ }
        if (targetIsDirectory || /\.jsonl?$/.test(entry.name)) symlinks.push(path);
        continue;
      }
      if (stat.isDirectory()) { walk(path); continue; }
      if (stat.isFile() && /\.jsonl?$/.test(entry.name)) files.push(path);
    }
  };
  walk(cerebroDir);
  return { files: files.sort(), symlinks: symlinks.sort() };
}

function inside(cerebroDir, path) {
  const rel = relative(cerebroDir, path);
  return rel && !rel.startsWith('..') && !rel.startsWith(sep);
}

function sha(text) {
  return createHash('sha256').update(text).digest('hex');
}

function atomicWrite(path, text, mode) {
  const temp = `${path}.migrate-${process.pid}-${randomBytes(4).toString('hex')}.tmp`;
  const fd = openSync(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, mode);
  try {
    writeSync(fd, text);
    fsyncSync(fd);
  } catch (error) {
    closeSync(fd);
    try { unlinkSync(temp); } catch { /* temp já removido */ }
    throw error;
  }
  closeSync(fd);
  try { renameSync(temp, path); } catch (error) {
    try { unlinkSync(temp); } catch { /* temp já removido */ }
    throw error;
  }
}

export function planMigration(root) {
  const brain = resolve(root);
  const cerebroDir = join(brain, '.cerebro');
  let stat;
  try { stat = lstatSync(cerebroDir); } catch { throw new RefusedError('a pasta .cerebro não existe neste root'); }
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new RefusedError('.cerebro precisa ser uma pasta real, não um link');
  const { files, symlinks } = scan(cerebroDir);
  if (symlinks.length) {
    throw new RefusedError(`links simbólicos recusados: ${symlinks.map((path) => relative(brain, path)).join(', ')}`);
  }
  const changes = [];
  const skipped = [];
  for (const path of files) {
    const rel = relative(brain, path);
    const size = statSync(path).size;
    if (size > MAX_BYTES) { skipped.push({ file: rel, reason: 'grande-demais' }); continue; }
    const text = readFileSync(path, 'utf8');
    let result;
    try {
      result = path.endsWith('.jsonl') ? migrateJsonlText(text) : migrateJsonText(text);
    } catch (error) {
      if (error instanceof RefusedError) throw new RefusedError(`${rel}: ${error.message}`);
      throw error;
    }
    if (result.status === 'invalid') { skipped.push({ file: rel, reason: 'json-invalido' }); continue; }
    if (result.status === 'changed') {
      changes.push({ path, file: rel, counts: result.counts, before: sha(text), text: result.text, mode: statSync(path).mode & 0o777 });
    }
    if (result.invalidLines) skipped.push({ file: rel, reason: 'linhas-invalidas-preservadas', lines: result.invalidLines });
  }
  return { brain, cerebroDir, scanned: files.length, changes, skipped };
}

export function applyMigration(plan, { now = new Date() } = {}) {
  if (!plan.changes.length) return { applied: 0, backup: null };
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const backupRoot = join(plan.cerebroDir, BACKUP_DIR, `remove-inevita-${stamp}`);
  for (const change of plan.changes) {
    const original = readFileSync(change.path, 'utf8');
    if (sha(original) !== change.before) throw new Error(`arquivo mudou durante a migração: ${change.file}`);
    const target = join(backupRoot, change.file);
    if (!inside(plan.cerebroDir, target)) throw new RefusedError('destino de backup fora de .cerebro');
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(change.path, target, constants.COPYFILE_EXCL);
    if (sha(readFileSync(target, 'utf8')) !== change.before) throw new Error(`backup divergente: ${change.file}`);
  }
  for (const change of plan.changes) {
    if (!inside(plan.cerebroDir, change.path)) throw new RefusedError('arquivo fora de .cerebro');
    if (lstatSync(change.path).isSymbolicLink()) throw new RefusedError(`link simbólico recusado: ${change.file}`);
    atomicWrite(change.path, change.text, change.mode);
  }
  return { applied: plan.changes.length, backup: relative(plan.brain, backupRoot) };
}

function parseArgs(argv) {
  const options = { apply: false, json: false, root: null };
  for (const arg of argv) {
    if (arg === '--apply') options.apply = true;
    else if (arg === '--json') options.json = true;
    else if (arg.startsWith('--root=')) options.root = arg.slice('--root='.length);
    else throw new Error(`argumento desconhecido: ${arg}`);
  }
  if (!options.root) throw new Error('uso: node scripts/migrate-remove-inevita.mjs --root=<cerebro> [--apply] [--json]');
  return options;
}

function summary(plan, result, apply) {
  return {
    mode: apply ? 'apply' : 'dry-run',
    scanned: plan.scanned,
    files_to_change: plan.changes.length,
    changes: plan.changes.map((change) => ({ file: change.file, counts: change.counts })),
    skipped: plan.skipped,
    applied: result?.applied ?? 0,
    backup: result?.backup ?? null,
  };
}

export function main(argv = process.argv.slice(2), { stdout = process.stdout, stderr = process.stderr } = {}) {
  let options;
  try { options = parseArgs(argv); } catch (error) { stderr.write(`${error.message}\n`); return 1; }
  try {
    const plan = planMigration(options.root);
    const result = options.apply ? applyMigration(plan) : null;
    const data = summary(plan, result, options.apply);
    if (options.json) {
      stdout.write(`${JSON.stringify(data, null, 2)}\n`);
      return 0;
    }
    stdout.write(`${data.mode}: ${data.scanned} arquivos JSON/JSONL lidos em .cerebro\n`);
    if (!data.files_to_change) stdout.write('nada a migrar\n');
    for (const change of data.changes) {
      stdout.write(`  ${options.apply ? 'migrado' : 'migraria'}: ${change.file} (${Object.entries(change.counts).map(([key, amount]) => `${key} x${amount}`).join(', ')})\n`);
    }
    for (const item of data.skipped) stdout.write(`  ignorado: ${item.file} (${item.reason})\n`);
    if (options.apply && data.backup) stdout.write(`backup: ${data.backup}\n`);
    if (!options.apply && data.files_to_change) stdout.write('rode com --apply para aplicar; o backup é criado antes da escrita\n');
    return 0;
  } catch (error) {
    if (error instanceof RefusedError) { stderr.write(`recusado: ${error.message}\n`); return 2; }
    stderr.write(`erro: ${error.code || 'falha'} ${error.syscall || ''}\n`);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
