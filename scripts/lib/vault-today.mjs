// Leitura do "agora" de um vault de notas tipadas (frontmatter YAML + wikilinks),
// para Cérebros que não seguem o protocolo de rotinas do Cérebro. Só lê; nunca
// escreve no vault. Ativado quando .cerebro/layout.json declara a chave `vault`.
import { closeSync, constants, existsSync, fstatSync, lstatSync, openSync, opendirSync, readdirSync, readFileSync, readSync, realpathSync } from 'node:fs';
import { posix, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { publicMarkdownParts } from './note-visibility.mjs';

const DAY_MS = 86_400_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function inside(root, ref) {
  if (typeof ref !== 'string' || !ref || isAbsolute(ref)) return false;
  const target = resolve(root, ref);
  const brainRoot = resolve(root);
  return target === brainRoot || target.startsWith(`${brainRoot}${sep}`);
}

function readText(path) {
  try { return readFileSync(path, 'utf8'); } catch { return null; }
}

function markdownFiles(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md') && !entry.name.startsWith('.') && !entry.name.startsWith('_'))
      .map((entry) => entry.name);
  } catch { return []; }
}

// Subconjunto de YAML usado pelos vaults: `chave: valor`, `chave: [a, b]` e listas `  - item`.
//
// `objectLists` nomeia as chaves cuja lista é de objetos simples (`- papel: agenda` com
// continuação indentada, inclusive uma lista de texto dentro do objeto). É opt-in porque
// um bullet de texto livre pode conter dois-pontos: fora dessas chaves, item de lista
// continua sendo texto, exatamente como antes.
export function parseFrontmatter(text, { objectLists = [] } = {}) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text || '');
  if (!match) return {};
  const objectKeys = new Set(objectLists);
  const data = {};
  let listKey = null;
  let itemIndent = 0;
  let current = null;
  let nestedKey = null;
  for (const line of match[1].split(/\r?\n/)) {
    const item = /^(\s*)-\s+(.*)$/.exec(line);
    if (item && listKey) {
      const indent = item[1].length;
      if (current && nestedKey && indent > itemIndent) {
        current[nestedKey].push(unquote(item[2]));
        continue;
      }
      if (!objectKeys.has(listKey)) {
        data[listKey].push(unquote(item[2]));
        continue;
      }
      itemIndent = indent;
      current = {};
      nestedKey = null;
      data[listKey].push(current);
      const inner = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(item[2]);
      if (inner) assign(current, inner[1], inner[2], (key) => { nestedKey = key; });
      continue;
    }
    const pair = /^(\s*)([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (!pair) continue;
    const [, indentation, key, raw] = pair;
    if (indentation.length) {
      // Continuação de um objeto aberto dentro de uma lista de objetos.
      if (current) assign(current, key, raw, (nested) => { nestedKey = nested; });
      continue;
    }
    listKey = null;
    current = null;
    nestedKey = null;
    if (raw === '') { data[key] = []; listKey = key; itemIndent = 0; continue; }
    data[key] = scalar(raw);
  }
  return data;
}

function assign(target, key, raw, openList) {
  if (raw === '') {
    target[key] = [];
    openList(key);
    return;
  }
  target[key] = scalar(raw);
  openList(null);
}

function scalar(raw) {
  return raw.startsWith('[') && raw.endsWith(']')
    ? raw.slice(1, -1).split(',').map((value) => unquote(value.trim())).filter(Boolean)
    : unquote(raw);
}

// Só par de aspas que abre e fecha o valor inteiro é delimitador. Aspa solta no fim de
// uma frase (`... com a pergunta "ainda é Active?"`) é conteúdo: tirá-la truncava o texto
// que entra no contrato.
function unquote(value) {
  const text = String(value).trim();
  const paired = /^"([\s\S]*)"$/.exec(text) || /^'([\s\S]*)'$/.exec(text);
  return paired ? paired[1] : text;
}

function title(text, fallback) {
  const heading = /^#\s+(.+)$/m.exec(text || '');
  return heading ? heading[1].trim() : fallback;
}

function linkTargets(values) {
  return [].concat(values || []).flatMap((value) => [...String(value).matchAll(/\[\[([^\]|#]+)/g)].map((m) => m[1].trim()));
}

// Bullets de uma seção `## Nome` (ou da nota inteira, sem `section`), sem sintaxe de wikilink.
export function sectionBullets(text, section, limit = 8) {
  let body = (text || '').replace(/^---[\s\S]*?\n---/, '');
  if (section) {
    const start = body.search(new RegExp(`^##\\s+${section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'm'));
    if (start < 0) return [];
    body = body.slice(start).split('\n').slice(1).join('\n');
    const next = body.search(/^##\s+/m);
    if (next >= 0) body = body.slice(0, next);
  }
  return body.split('\n')
    .map((line) => /^\s*(?:[-*]|\d+\.)\s+(?:\[[ x]\]\s+)?(.+)$/.exec(line)?.[1])
    .filter(Boolean)
    .map((line) => line.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2').replace(/\[\[([^\]]+)\]\]/g, '$1').replace(/\*\*/g, '').trim())
    .slice(0, limit);
}

function focus(root, refs) {
  for (const ref of refs) {
    if (!inside(root, ref)) continue;
    const text = readText(resolve(root, ref));
    if (text === null) continue;
    const items = ref.endsWith('home.md') ? sectionBullets(text, 'Foco agora') : sectionBullets(text);
    if (items.length) return { ref, items };
  }
  return { ref: null, items: [] };
}

function daily(root, dir, today) {
  const dates = markdownFiles(resolve(root, dir)).map((name) => name.slice(0, -3)).filter((name) => DATE_RE.test(name) && name <= today).sort();
  const date = dates.at(-1);
  if (!date) return null;
  const text = readText(resolve(root, dir, `${date}.md`));
  return {
    date,
    ref: posix.join(dir, `${date}.md`),
    is_today: date === today,
    priorities: sectionBullets(text, 'Prioridades'),
  };
}

function notes(root, dir) {
  return markdownFiles(resolve(root, dir)).map((name) => {
    const text = readText(resolve(root, dir, name)) || '';
    const slug = name.slice(0, -3);
    return { slug, ref: posix.join(dir, name), title: title(text, slug), meta: parseFrontmatter(text) };
  });
}

// Declared areas use the same privacy gate as explicit file reads. Never follow
// a configured directory or note through a symlink, and bound each note read.
function declaredAreaNotes(root, config) {
  if (!config || !inside(root, config.areas)) return [];
  const base = resolve(root), directory = resolve(base, config.areas);
  const check = (path) => {
    const ref = relative(base, path);
    if (ref.startsWith('..') || isAbsolute(ref)) throw Error('not-found');
    let cursor = base;
    if (lstatSync(base).isSymbolicLink()) throw Error('not-found');
    for (const part of ref.split(sep).filter(Boolean)) {
      if (part.startsWith('.') || /^(private|privado)$/i.test(part)) throw Error('not-found');
      cursor = join(cursor, part);
      if (lstatSync(cursor).isSymbolicLink()) throw Error('not-found');
    }
    const realBase = realpathSync(base), real = realpathSync(path);
    if (real !== realBase && !real.startsWith(`${realBase}${sep}`)) throw Error('not-found');
    return lstatSync(path);
  };
  let handle;
  const result = [];
  let scannedBytes = 0;
  try {
    for (let ancestor = base; ; ) {
      if (lstatSync(ancestor).isSymbolicLink()) return [];
      const parent = resolve(ancestor, '..');
      if (parent === ancestor) break;
      ancestor = parent;
    }
    if (!check(directory).isDirectory()) return [];
    handle = opendirSync(directory);
    for (let count = 0, entry; count < 1000 && (entry = handle.readSync()); count++) {
      if (!entry.isFile() || !entry.name.endsWith('.md') || /^[._]/.test(entry.name)) continue;
      const path = join(directory, entry.name);
      let fd;
      try {
        const before = check(path);
        if (before.size > 512 * 1024 || scannedBytes + before.size > 16 * 1024 * 1024) continue;
        fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
        const opened = fstatSync(fd);
        if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino || opened.size > 512 * 1024) continue;
        const bytes = Buffer.alloc(512 * 1024 + 1);
        let size = 0;
        while (size < bytes.length) {
          const n = readSync(fd, bytes, size, bytes.length - size, null);
          if (!n) break;
          size += n;
        }
        scannedBytes += size;
        const after = check(path);
        if (size > 512 * 1024 || after.dev !== opened.dev || after.ino !== opened.ino || after.size !== opened.size || after.mtimeMs !== opened.mtimeMs) continue;
        const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, size));
        if (text.includes('\0')) continue;
        publicMarkdownParts(text);
        const meta = parseFrontmatter(text);
        if (meta.type !== 'Area') continue;
        const slug = entry.name.slice(0, -3);
        result.push({ slug, ref: join(config.areas, entry.name).split(sep).join('/'), title: title(text, slug), meta });
      } catch { /* An unavailable/private note does not hide the other areas. */ }
      finally { if (fd !== undefined) closeSync(fd); }
    }
  } catch { return []; }
  finally { if (handle) handle.closeSync(); }
  return result.sort((a, b) => a.slug.localeCompare(b.slug));
}

export function vaultAreaCatalog(root, config) {
  return declaredAreaNotes(root, config).map(({ slug, title }) => ({ slug, title }));
}

export function vaultAreaTitle(root, config, slug) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(String(slug || ''))) return null;
  return declaredAreaNotes(root, config).find((area) => area.slug === slug)?.title || null;
}

export function vaultToday(root, config, { now = new Date() } = {}) {
  if (!config || typeof config !== 'object') return { available: false };
  const dirs = {};
  for (const key of ['daily', 'inbox', 'projects', 'areas']) {
    dirs[key] = inside(root, config[key]) ? config[key] : null;
  }
  const staleDays = Number.isInteger(config.staleDays) && config.staleDays > 0 ? config.staleDays : 7;
  const today = now.toISOString().slice(0, 10);
  const projects = dirs.projects ? notes(root, dirs.projects) : [];
  const active = projects.filter((project) => project.meta.status === 'Active');
  const stale = active
    .map((project) => {
      const updated = DATE_RE.test(project.meta.updated || '') ? project.meta.updated : null;
      const days = updated ? Math.floor((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${updated}T12:00:00Z`)) / DAY_MS) : null;
      return { slug: project.slug, title: project.title, ref: project.ref, updated, days };
    })
    .filter((project) => project.days === null || project.days >= staleDays)
    .sort((left, right) => (right.days ?? Infinity) - (left.days ?? Infinity));
  const areas = declaredAreaNotes(root, config).map((area) => {
    const linked = active.filter((project) => linkTargets([project.meta.belongs_to, project.meta.related_to]).includes(area.slug));
    return { slug: area.slug, title: area.title, ref: area.ref, status: area.meta.status || null, active_projects: linked.length };
  }).sort((left, right) => right.active_projects - left.active_projects);
  return {
    available: true,
    today,
    focus: focus(root, Array.isArray(config.focus) ? config.focus : []),
    daily: dirs.daily ? daily(root, dirs.daily, today) : null,
    inbox: dirs.inbox && existsSync(resolve(root, dirs.inbox)) ? { ref: dirs.inbox, count: markdownFiles(resolve(root, dirs.inbox)).length } : null,
    projects: { active: active.length, stale_days: staleDays, stale: stale.slice(0, 10), stale_total: stale.length },
    areas,
  };
}
