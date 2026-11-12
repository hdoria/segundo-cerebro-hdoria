// Local Markdown browser. Metadata, explicit opening and editing share a resolver;
// no caller may use a path returned by the index as authorization for a later read.
import { closeSync, constants, fstatSync, fsyncSync, linkSync, lstatSync, mkdirSync, openSync, opendirSync, readSync, readdirSync, realpathSync, renameSync, unlinkSync, writeSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { basename, dirname, isAbsolute, relative, resolve, sep, win32 } from 'node:path';
import { parseFrontmatter } from './vault-today.mjs';
import { publicMarkdownParts } from './note-visibility.mjs';
import { createLocalNoteRelations, contentSearchMatch } from './local-note-relations.mjs';

const MAX_BYTES = 512 * 1024;
const MAX_ENTRIES = 10_000;
const MAX_SCAN_BYTES = 64 * 1024 * 1024;
const MAX_DEPTH = 32;
const BLOCKED_DIRS = new Set(['privado', 'private', 'node_modules', 'build', 'dist', 'vendor', '__pycache__']);
const CREDENTIAL_NAME = /(?:^|[-_. ])(?:credentials?|secrets?|tokens?|passwords?|passwd|id_rsa|id_ed25519|private[-_]key|api[-_]key|install-credential|acesso-email)(?:[-_. ]|$)/i;
const fail = () => { throw new Error('not-found'); };
const slash = (value) => value.split(sep).join('/');
const within = (base, target) => target === base || target.startsWith(`${base}${sep}`);
const sha = value => createHash('sha256').update(value).digest('hex');
const editFail = code => { throw new Error(code); };
const activeEdits = new Set();

function cleanRef(ref, { empty = false } = {}) {
  if (typeof ref !== 'string' || ref.length > 1024 || /[\u0000-\u001f\\:]/.test(ref) || isAbsolute(ref) || win32.isAbsolute(ref)) fail();
  if (ref === '' && empty) return '.';
  if (ref === '.') return ref;
  if (!ref || ref.split('/').some((part) => !part || part === '.' || part === '..')) fail();
  return ref;
}

function allowedName(name) {
  return !name.startsWith('.') && !BLOCKED_DIRS.has(name.toLowerCase()) && !CREDENTIAL_NAME.test(name);
}

// Include the selected root itself and its ancestors: a symlinked parent cannot
// silently turn a seemingly local configured root into a different directory.
function noSymlinks(path) {
  let current = resolve(path);
  while (true) {
    if (lstatSync(current).isSymbolicLink()) fail();
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
}

function resolveSafe(root, ref, { directory = false, internal = false, binary = false } = {}) {
  const normalized = cleanRef(ref);
  if (!internal && normalized !== '.' && normalized.split('/').some((part) => !allowedName(part))) fail();
  const path = resolve(root, normalized);
  if (!within(root, path)) fail();
  noSymlinks(path);
  const real = realpathSync(path);
  if (!within(root, real)) fail();
  const stat = lstatSync(path);
  if (directory ? !stat.isDirectory() : !stat.isFile()) fail();
  if (!directory && !internal && !binary && !/\.md$/i.test(normalized)) fail();
  return { path, stat };
}

function boundedText(root, ref, { internal = false, onRead = () => {} } = {}) {
  const { path, stat } = resolveSafe(root, ref, { internal });
  if (stat.size > MAX_BYTES) fail();
  let fd;
  try {
    fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    const opened = fstatSync(fd);
    if (!opened.isFile() || opened.size > MAX_BYTES || opened.dev !== stat.dev || opened.ino !== stat.ino) fail();
    const bytes = Buffer.alloc(MAX_BYTES + 1);
    let size = 0;
    while (size < bytes.length) {
      const count = readSync(fd, bytes, size, bytes.length - size, null);
      if (!count) break;
      size += count;
    }
    onRead(size);
    if (size > MAX_BYTES) fail();
    const checked = resolveSafe(root, ref, { internal });
    if (checked.stat.dev !== opened.dev || checked.stat.ino !== opened.ino) fail();
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes.subarray(0, size));
    if (text.includes('\0')) fail();
    return { text, bytes: size, sha256: sha(bytes.subarray(0, size)), identity: { dev: opened.dev, ino: opened.ino }, modified_at: checked.stat.mtime.toISOString() };
  } finally { if (fd !== undefined) closeSync(fd); }
}

function context(root) {
  const brain = resolve(root);
  noSymlinks(brain);
  if (!lstatSync(brain).isDirectory() || realpathSync(brain) !== brain) fail();
  let config = {};
  try {
    config = JSON.parse(boundedText(brain, '.cerebro/layout.json', { internal: true }).text);
    if (!config || typeof config !== 'object' || Array.isArray(config)) fail();
  } catch (error) { if (error.code !== 'ENOENT') fail(); }
  const knowledgeRef = cleanRef(config.knowledgeRoot ?? '01-nucleo-privado');
  if (knowledgeRef !== '.' && knowledgeRef.split('/').some((part) => !allowedName(part))) fail();
  const knowledgePath = resolve(brain, knowledgeRef);
  let available = true;
  try { resolveSafe(brain, knowledgeRef, { directory: true }); } catch (error) {
    if (error.code !== 'ENOENT') fail();
    available = false;
  }
  return { root: brain, knowledgeRef, knowledgePath, config, available };
}

function metadata(text) {
  const parts = publicMarkdownParts(text);
  return { meta: parseFrontmatter(text.replace(/^\uFEFF/, '')), ...parts };
}

function note(ctx, ref, onRead = () => {}) {
  if (!within(ctx.knowledgePath, resolve(ctx.root, ref))) fail();
  const content = boundedText(ctx.root, ref, { onRead });
  const { meta, header, body } = metadata(content.text);
  const declared = libraryMetadata(header);
  const stem = basename(ref).replace(/\.md$/i, '');
  const title = /^#\s+(.+?)\s*#*\s*$/m.exec(body)?.[1]?.trim() || stem;
  return { ref, title, type: typeof meta.type === 'string' ? meta.type : null,
    library_type: metadataLabel(declared.type), tags: declaredTags(declared.tags),
    updated: typeof meta.updated === 'string' && Number.isFinite(Date.parse(meta.updated)) ? meta.updated : null, stem, header, body, ...content };
}

function canonicalArea(value) {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function relationTargets(header) {
  const values = [];
  let selected = false;
  for (const line of header.split(/\r?\n/)) {
    if (/^\S/.test(line)) selected = /^(?:belongs_to|related_to):/.test(line);
    if (!selected) continue;
    const value = line.replace(/^(?:belongs_to|related_to):\s*/, '').replace(/^\s*-\s*/, '');
    const links = [...value.matchAll(/\[\[([^\]|#]+)(?:[^\]]*)\]\]/g)];
    if (links.length) values.push(...links.map((match) => match[1]));
    else values.push(...value.replace(/[\[\]"']/g, '').split(',').map((item) => item.trim()).filter(Boolean));
  }
  return values.map((value) => canonicalArea(basename(value.replace(/\.md$/i, '')))).filter(Boolean);
}

function scan(ctx) {
  const notes = [];
  const folders = [];
  let visited = 0;
  let bytes = 0;
  let complete = true;
  function walk(ref, depth) {
    if (depth > MAX_DEPTH || visited >= MAX_ENTRIES || bytes >= MAX_SCAN_BYTES) { complete = false; return; }
    let handle;
    const entries = [];
    try {
      handle = opendirSync(resolveSafe(ctx.root, ref, { directory: true }).path);
      let entry;
      while (entries.length < MAX_ENTRIES - visited && (entry = handle.readSync())) entries.push(entry);
      if (entries.length >= MAX_ENTRIES - visited && handle.readSync()) complete = false;
    } catch { complete = false; return; } finally { if (handle) handle.closeSync(); }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (++visited > MAX_ENTRIES || bytes >= MAX_SCAN_BYTES) { complete = false; break; }
      if (!allowedName(entry.name) || entry.isSymbolicLink()) continue;
      const child = ref === '.' ? entry.name : `${ref}/${entry.name}`;
      if (entry.isDirectory()) {
        try { resolveSafe(ctx.root, child, { directory: true }); } catch { continue; }
        folders.push({ ref: child, name: entry.name });
        walk(child, depth + 1);
      } else if (entry.isFile() && /\.md$/i.test(entry.name)) {
        try { notes.push(note(ctx, child, (size) => { bytes += size; })); } catch { /* One denied/unreadable note never cancels the index. */ }
      }
    }
  }
  walk(ctx.knowledgeRef, 0);
  if (bytes >= MAX_SCAN_BYTES) complete = false;
  return { notes, folders, complete };
}



// Library facets need only YAML string fields. Unsupported structures are
// omitted instead of guessed into category names; the original note stays intact.
function metadataScalar(raw) {
  const value=raw.trim();
  if(value.startsWith('"')) {
    const match=/^("(?:[^"\\]|\\.)*")[ \t]*(?:#.*)?$/.exec(value);
    if(!match) return null;
    try { return JSON.parse(match[1]); } catch { return null; }
  }
  if(value.startsWith("'")) {
    const match=/^'((?:[^']|'')*)'[ \t]*(?:#.*)?$/.exec(value);
    return match ? match[1].replace(/''/g,"'") : null;
  }
  const plain=value.replace(/[ \t]+#.*$/,'').trim();
  if(!plain || /^[!&*|>{\[]/.test(plain) || /^(?:null|true|false|~|[-+]?\d+(?:\.\d+)?)$/i.test(plain)) return null;
  return plain;
}
function metadataList(raw) {
  const match=/^\[([\s\S]*)\][ \t]*(?:#.*)?$/.exec(raw.trim());
  if(!match) return null;
  const values=[]; let start=0; let quote=null;
  for(let index=0;index<match[1].length;index+=1) {
    const char=match[1][index];
    if(quote) {
      if(quote==='"' && char==='\\') { index+=1; continue; }
      if(char===quote) {
        if(quote==="'" && match[1][index+1]==="'") index+=1;
        else quote=null;
      }
    } else if((char==='"' || char==="'") && !match[1].slice(start,index).trim()) quote=char;
    else if(char===',') { values.push(metadataScalar(match[1].slice(start,index))); start=index+1; }
    else if(/[\[\]{}]/.test(char)) return null;
  }
  if(quote) return null;
  values.push(metadataScalar(match[1].slice(start)));
  return values.filter(value=>value !== null);
}
function libraryMetadata(header) {
  const result={type:null,tags:[]};
  const seen=new Set(); let multiline=false;
  for(const line of header.split(/\r?\n/)) {
    const pair=/^([A-Za-z_][\w-]*)[ \t]*:[ \t]*(.*)$/.exec(line);
    if(pair) {
      multiline=false;
      const [,key,raw]=pair;
      if(key!=='type' && key!=='tags') continue;
      if(seen.has(key)) { result[key]=key==='tags'?[]:null; continue; }
      seen.add(key);
      if(key==='type') result.type=metadataScalar(raw);
      else if(!raw || raw.trimStart().startsWith('#')) multiline=true;
      else result.tags=raw.trimStart().startsWith('[') ? metadataList(raw) || [] : [metadataScalar(raw)];
    } else if(multiline) {
      const item=/^[ \t]*-[ \t]+(.*)$/.exec(line);
      if(item) result.tags.push(metadataScalar(item[1]));
      else if(line.trim() && !line.trimStart().startsWith('#')) multiline=false;
    }
  }
  return result;
}

function metadataLabel(value) {
  return typeof value === 'string' && value.trim() && value.trim().length <= 200 && !/[\u0000-\u001f]/.test(value) ? value.trim().normalize('NFC') : null;
}
function declaredTags(value) {
  const result = new Map();
  for (const candidate of Array.isArray(value) ? value : [value]) {
    const label = metadataLabel(candidate);
    if (label && !result.has(label.toLocaleLowerCase())) result.set(label.toLocaleLowerCase(),label);
  }
  return [...result.values()].sort((a,b) => a.localeCompare(b));
}
function options(value) {
  const { directory = '', query = '', area = '', type = '', tag = '', mode = '', search = 'title', sort = 'title', offset = 0, limit = 50 } = value;
  if ([query, area, type, tag].some((item) => typeof item !== 'string' || item.length > 200 || /[\u0000-\u001f]/.test(item))
    || !['','library'].includes(mode) || !['title','content'].includes(search) || (search === 'content' && mode !== 'library') || !['title','modified'].includes(sort)
    || !Number.isSafeInteger(offset) || offset < 0 || offset > MAX_ENTRIES
    || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('local-files-query-invalid');
  return { directory, query: query.trim(), area: area.trim(), type: type.trim(), tag: tag.trim(), mode, search, sort, offset, limit };
}
function valueFacets(items, values) {
  const counts = new Map();
  for (const item of items) {
    const seen = new Set();
    for (const value of values(item)) {
      if (!value) continue;
      const key=value.toLocaleLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const previous=counts.get(key);
      if (previous) previous.count += 1;
      else counts.set(key,{value,count:1});
    }
  }
  return [...counts.values()].sort((a,b) => a.value.localeCompare(b.value));
}
function libraryFacets(ctx, items, folders) {
  const counts=new Map(folders.map(folder => [folder.ref,{...folder,count:0}]));
  for(const item of items) {
    let current=dirname(resolve(ctx.root,item.ref));
    while(current !== ctx.knowledgePath && within(ctx.knowledgePath,current)) {
      const folder=counts.get(slash(relative(ctx.root,current)));
      if(folder) folder.count += 1;
      current=dirname(current);
    }
  }
  return {
    types: valueFacets(items,item => [item.type]),
    tags: valueFacets(items,item => item.tags),
    folders: [...counts.values()].filter(folder => folder.count > 0).sort((a,b) => a.ref.localeCompare(b.ref)),
  };
}

export function listLocalFiles(root, value = {}) {
  const opts = options(value);
  const library=opts.mode === 'library';
  try {
    const ctx = context(root);
    const directory = opts.directory === '' ? ctx.knowledgeRef : cleanRef(opts.directory);
    const path = resolve(ctx.root, directory);
    if (!within(ctx.knowledgePath, path)) fail();
    const result = { available: ctx.available, directory, parent_ref: directory === ctx.knowledgeRef ? null : slash(relative(ctx.root, dirname(path))) || '.', folders: [], files: [], total: 0, offset: opts.offset, limit: opts.limit };
    if(library) Object.assign(result,{complete:true,facets:{types:[],tags:[],folders:[]}});
    if (!ctx.available && directory === ctx.knowledgeRef) return result;
    resolveSafe(ctx.root, directory, { directory: true });
    const { notes, folders, complete } = scan(ctx);
    const aliases = new Map();
    const ownAreas = new Map();
    const configuredAreas = ctx.config.vault?.areas;
    for (const item of notes) {
      const type=library ? item.library_type : item.type;
      if (type?.toLowerCase() !== 'area' && (!configuredAreas || slash(dirname(item.ref)) !== configuredAreas)) continue;
      const slug = canonicalArea(item.stem);
      ownAreas.set(item.ref, slug);
      aliases.set(slug, slug);
      const titleKey = canonicalArea(item.title);
      if (!aliases.has(titleKey)) aliases.set(titleKey, slug);
      else if (aliases.get(titleKey) !== slug) aliases.set(titleKey, null); // Ambiguous labels never invent a relation.
    }
    const area = aliases.get(canonicalArea(opts.area)) ?? canonicalArea(opts.area);
    const indexed=notes.map(item => ({ ref: item.ref, title: item.title, type: library ? item.library_type : item.type, updated: item.updated,
      area_refs: [...new Set([ownAreas.get(item.ref), ...relationTargets(item.header).map((key) => aliases.has(key) ? aliases.get(key) : key)].filter(Boolean))].sort(),
      ...(library ? {tags:item.tags,modified_at:item.modified_at} : {}),
    }));
    const contentMatches=library && opts.search === 'content' && opts.query ? new Map(notes.map(item=>[item.ref,contentSearchMatch(item,opts.query)])) : null;
    const scoped=indexed.filter(item => !opts.area || item.area_refs.includes(area));
    if(library) Object.assign(result,{complete,facets:libraryFacets(ctx,scoped,folders)});
    const recursive=library || Boolean(opts.query || opts.area || opts.type);
    const titleOrder=(a,b) => a.title.localeCompare(b.title) || a.ref.localeCompare(b.ref);
    const matches=scoped.filter(item => within(path,resolve(ctx.root,item.ref)) && (recursive || dirname(resolve(ctx.root,item.ref)) === path))
      .filter(item => (!opts.query || (contentMatches ? contentMatches.get(item.ref) : item.title.toLocaleLowerCase().includes(opts.query.toLocaleLowerCase())))
        && (!opts.type || item.type?.toLowerCase() === opts.type.toLowerCase())
        && (!library || !opts.tag || item.tags.some(tag => tag.toLocaleLowerCase() === opts.tag.toLocaleLowerCase())))
      .sort(library && opts.sort === 'modified' ? (a,b) => Date.parse(b.modified_at)-Date.parse(a.modified_at) || titleOrder(a,b) : titleOrder);
    result.folders = (library ? result.facets.folders.map(({ref,name})=>({ref,name})) : folders).filter((item) => dirname(resolve(ctx.root, item.ref)) === path).slice(0, 100);
    result.total = matches.length;
    result.files = matches.slice(opts.offset, opts.offset + opts.limit).map(item=>contentMatches ? {...item,...contentMatches.get(item.ref)} : item);
    return result;
  } catch { fail(); }
}

// Notas legíveis com texto e hash, para leitores derivados (tarefas). Passa pelo mesmo
// scan da biblioteca: nota privada, negada ou ilegível nunca entra.
export function readableNotes(root) {
  try {
    const ctx = context(root);
    if (!ctx.available) return { available: false, complete: true, notes: [] };
    const { notes, complete } = scan(ctx);
    return { available: true, complete, notes: notes.map(({ ref, title, type, text, sha256 }) => ({ ref, title, type, text, sha256 })) };
  } catch { fail(); }
}

export function readLocalFile(root, ref) {
  try {
    const ctx = context(root);
    const item = note(ctx, cleanRef(ref));
    return publicNote(item);
  } catch { fail(); }
}

function publicNote(item) {
  return { ref: item.ref, title: item.title, type: item.type, text: item.text, bytes: item.bytes, sha256: item.sha256 };
}

function directoryChain(root, path) {
  noSymlinks(path);
  if (!within(root, path)) fail();
  const result = [];
  for (let current = path; ; current = dirname(current)) {
    const stat = lstatSync(current);
    if (!stat.isDirectory()) fail();
    result.push({ path: current, dev: stat.dev, ino: stat.ino });
    if (current === root) return result;
  }
}

function assertChain(root, path, expected) {
  const actual = directoryChain(root, path);
  if (actual.length !== expected.length || actual.some((item, index) => item.dev !== expected[index].dev || item.ino !== expected[index].ino)) fail();
}

function secureDirectory(root, path) {
  if (!within(root, path)) fail();
  if (path === root) { directoryChain(root, root); return; }
  secureDirectory(root, dirname(path));
  try { mkdirSync(path, { mode: 0o700 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  directoryChain(root, path);
}

function writeExclusive(path, bytes) {
  let fd;
  try {
    fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW || 0), 0o600);
    let offset = 0;
    while (offset < bytes.length) offset += writeSync(fd, bytes, offset, bytes.length - offset);
    fsyncSync(fd);
  } finally { if (fd !== undefined) closeSync(fd); }
}

function liveEditClaims(root, directory) {
  const chain = directoryChain(root, directory);
  const names = readdirSync(directory);
  assertChain(root, directory, chain);
  if (names.length > 1000) editFail('local-note-busy');
  const claims = [];
  for (const name of names) {
    if (/^\.claim-[a-f0-9-]{36}\.tmp$/.test(name)) continue;
    if (!/^claim-[a-f0-9-]{36}\.json$/.test(name)) editFail('local-note-busy');
    let value;
    try { value = JSON.parse(boundedText(root, slash(relative(root, resolve(directory, name))), { internal: true }).text); }
    catch (error) { if (error.code === 'ENOENT') continue; editFail('local-note-busy'); }
    if (!Number.isSafeInteger(value.pid) || value.pid < 1 || !/^[a-f0-9-]{36}$/.test(value.nonce || '')
      || name !== `claim-${value.nonce}.json` || typeof value.choosing !== 'boolean'
      || !Number.isSafeInteger(value.ticket) || value.ticket < 0 || (value.choosing ? value.ticket !== 0 : value.ticket === 0)) editFail('local-note-busy');
    let alive = true;
    try { process.kill(value.pid, 0); } catch (error) { if (error.code === 'ESRCH') alive = false; }
    if (!alive) { assertChain(root, directory, chain); try { unlinkSync(resolve(directory, name)); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
    else claims.push(value);
  }
  return claims;
}

function withEditLock(root, ref, action) {
  const key = `${root}\0${ref}`;
  if (activeEdits.has(key)) editFail('local-note-busy');
  activeEdits.add(key);
  let directory; let chain; let path;
  try {
    directory = resolve(root, '.cerebro/runtime/local-note-edits', sha(ref));
    secureDirectory(root, directory);
    chain = directoryChain(root, directory);
    const owner = { pid: process.pid, nonce: randomUUID(), choosing: true, ticket: 0 };
    path = resolve(directory, `claim-${owner.nonce}.json`);
    // Unique claims avoid stale-lock successor deletion. The nonblocking
    // Lamport bakery ordering lets only one cooperating process enter.
    writeExclusive(path, Buffer.from(JSON.stringify(owner)));
    owner.ticket = Math.max(0, ...liveEditClaims(root, directory).map(value => value.ticket)) + 1;
    if (!Number.isSafeInteger(owner.ticket)) editFail('local-note-busy');
    owner.choosing = false;
    const staging = resolve(directory, `.claim-${randomUUID()}.tmp`);
    try {
      assertChain(root, directory, chain);
      writeExclusive(staging, Buffer.from(JSON.stringify(owner)));
      assertChain(root, directory, chain);
      renameSync(staging, path);
    } finally { try { assertChain(root, directory, chain); unlinkSync(staging); } catch { /* Never follow a replaced parent for cleanup. */ } }
    for (const peer of liveEditClaims(root, directory)) {
      if (peer.nonce !== owner.nonce && (peer.choosing || peer.ticket < owner.ticket || (peer.ticket === owner.ticket && peer.nonce < owner.nonce))) editFail('local-note-busy');
    }
    return action();
  } finally {
    if (path) { try { assertChain(root, directory, chain); unlinkSync(path); } catch { /* A unique dead claim can be removed on the next save. */ } }
    activeEdits.delete(key);
  }
}

function frontmatter(text) {
  return /^(?:\uFEFF)?---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/.exec(text)?.[0] || '';
}

function assertNoteEdits(before, after) {
  if (before.startsWith('\uFEFF') !== after.startsWith('\uFEFF')) editFail('local-note-format-immutable');
  const endings = [...before.matchAll(/\r\n|\r|\n/g)].map(match => match[0]);
  const allowed = new Set(endings.length ? endings : ['\n']);
  if (allowed.size > 1 || allowed.has('\r') || [...after.matchAll(/\r\n|\r|\n/g)].some(match => !allowed.has(match[0]))) editFail('local-note-format-immutable');
  if (frontmatter(before) !== frontmatter(after)) editFail('local-note-metadata-immutable');
  const markers = value => [...value.matchAll(/<!--[ \t]*ai:[\s\S]*?-->/gi)].map(match => match[0]);
  if (JSON.stringify(markers(before)) !== JSON.stringify(markers(after))) editFail('local-note-markers-immutable');
  // Also use the canonical visibility parser for the candidate; edits may not
  // introduce malformed/private metadata that becomes unreadable after Save.
  metadata(after);
}


function syncDirectory(path) {
  let fd;
  try { fd=openSync(path,constants.O_RDONLY); fsyncSync(fd); }
  catch(error) { if(process.platform !== 'win32' || !['EINVAL','EPERM','EACCES','EISDIR','ENOTSUP','EBADF'].includes(error.code)) throw error; }
  finally { if(fd !== undefined) closeSync(fd); }
}
function exists(path) {
  try { return lstatSync(path); } catch(error) { if(error.code === 'ENOENT') return null; throw error; }
}
function targetForRecovery(ctx, ref) {
  const normalized=cleanRef(ref);
  if(!/\.md$/i.test(normalized) || normalized.split('/').some(part=>!allowedName(part))) fail();
  const path=resolve(ctx.root,normalized);
  if(!within(ctx.knowledgePath,path)) fail();
  const chain=directoryChain(ctx.root,dirname(path));
  return {path,chain};
}
function recoveryBase(root, {create=false}={}) {
  const path=resolve(root,'.cerebro/runtime/note-edit-recovery');
  if(create) secureDirectory(root,path);
  else if(!exists(path)) return null;
  directoryChain(root,path);
  return path;
}
function finishTransaction(root,directory,status) {
  const chain=directoryChain(root,directory);
  assertChain(root,directory,chain);
  try { writeExclusive(resolve(directory,'finished.json'),Buffer.from(JSON.stringify({status,finished_at:new Date().toISOString()}))); }
  catch(error) { if(error.code !== 'EEXIST') throw error; }
  syncDirectory(directory);
}
function transactionFile(root,directory,name) {
  return boundedText(root,slash(relative(root,resolve(directory,name))),{internal:true});
}
function sameChain(actual,expected) {
  return Array.isArray(expected) && actual.length === expected.length && actual.every((n,i)=>n.dev === expected[i].dev && n.ino === expected[i].ino);
}
function restoreCaptured(root,directory,target,chain) {
  assertChain(root,dirname(target),chain);
  const before=resolve(directory,'before.md');
  const captured=exists(before);
  if(!captured || !captured.isFile() || captured.isSymbolicLink()) return false;
  try { linkSync(before,target); syncDirectory(dirname(target)); return true; }
  catch(error) { if(error.code === 'EEXIST') return false; throw error; }
}

// Reconcile only dead, durable Save transactions. Existing canonical paths are
// never replaced. Backups remain private, including late writes via an old FD.
// Called explicitly on Console startup, never by ordinary reads or indexing.
export function recoverLocalNoteEdits(root) {
  const brain=resolve(root);
  let base;
  try { noSymlinks(brain); base=recoveryBase(brain); } catch { return [{status:'recovery-required'}]; }
  if(!base) return [];
  const results=[];
  let names;
  try { names=readdirSync(base); } catch { return [{status:'recovery-required'}]; }
  if(names.length>10000) return [{status:'recovery-required'}];
  for(const name of names) {
    if(!/^[a-f0-9-]{36}$/.test(name)) continue;
    const directory=resolve(base,name);
    let record;
    try {
      directoryChain(brain,directory);
      if(exists(resolve(directory,'finished.json'))) continue;
      record=JSON.parse(transactionFile(brain,directory,'ledger.json').text);
      if(record.schema !== 1 || !Number.isSafeInteger(record.pid) || record.pid<1 || typeof record.ref !== 'string') throw new Error('invalid-ledger');
      try { process.kill(record.pid,0); continue; } catch(error) { if(error.code !== 'ESRCH') continue; }
      const ctx=context(brain);
      const target=targetForRecovery(ctx,record.ref);
      if(!sameChain(target.chain,record.parent_chain)) throw new Error('changed-parent');
      withEditLock(brain,record.ref,()=>{
        const captured=exists(resolve(directory,'before.md'));
        let status;
        if(!captured) status='aborted';
        else if(!exists(target.path)) status=restoreCaptured(brain,directory,target.path,target.chain) ? 'restored' : 'conflict';
        else {
          const actual=exists(target.path), staged=exists(resolve(directory,'proposed.md'));
          const canonical=actual?.isFile() && !actual.isSymbolicLink() ? boundedText(brain,slash(relative(brain,target.path)),{internal:true}) : null;
          const displaced=captured.isFile() && !captured.isSymbolicLink() ? transactionFile(brain,directory,'before.md') : null;
          status=canonical && displaced && staged && actual.dev===staged.dev && actual.ino===staged.ino && canonical.sha256===record.new_sha256 && displaced.sha256===record.expected_sha256 ? 'applied' : 'conflict';
        }
        finishTransaction(brain,directory,status);
        results.push({ref:record.ref,status});
      });
    } catch { results.push({...(record?.ref ? {ref:record.ref} : {}),status:'recovery-required'}); }
  }
  return results;
}

export function saveLocalFile(root, { ref, expected_sha256, text } = {}) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > MAX_BYTES || text.includes('\0')
    || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(text)
    || typeof expected_sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(expected_sha256)) editFail('local-note-invalid');
  let ctx; let normalized;
  try { ctx = context(root); normalized = cleanRef(ref); note(ctx, normalized); } catch { fail(); }
  try {
    return withEditLock(ctx.root, normalized, () => {
      const before = note(context(ctx.root), normalized);
      if (before.sha256 !== expected_sha256) editFail('local-note-conflict');
      if (before.text === text) return publicNote(before);
      assertNoteEdits(before.text, text);
      const path = resolve(ctx.root, normalized);
      const parent = dirname(path);
      const chain = directoryChain(ctx.root, parent);
      const base=recoveryBase(ctx.root,{create:true});
      if(lstatSync(parent).dev !== lstatSync(base).dev) editFail('local-note-filesystem-unsupported');
      const directory=resolve(base,randomUUID());
      secureDirectory(ctx.root,directory);
      const recoveryChain=directoryChain(ctx.root,directory);
      const proposed=resolve(directory,'proposed.md');
      const captured=resolve(directory,'before.md');
      let capturedTarget=false, published=false;
      try {
        writeExclusive(proposed,Buffer.from(text));
        const ledger={schema:1,pid:process.pid,ref:normalized,expected_sha256,new_sha256:sha(Buffer.from(text)),parent_chain:chain.map(({dev,ino})=>({dev,ino})),created_at:new Date().toISOString()};
        writeExclusive(resolve(directory,'ledger.json'),Buffer.from(JSON.stringify(ledger)));
        syncDirectory(directory); syncDirectory(base);
        assertChain(ctx.root,parent,chain);
        const last=note(context(ctx.root),normalized);
        if(last.sha256 !== expected_sha256 || last.identity.dev !== before.identity.dev || last.identity.ino !== before.identity.ino) editFail('local-note-conflict');
        assertChain(ctx.root,parent,chain);
        assertChain(ctx.root,directory,recoveryChain);
        // Capture, then compare. Unlike rename-overwrite, an intervening external
        // edit remains in before.md and can always be restored without clobbering.
        renameSync(path,captured);
        capturedTarget=true;
        syncDirectory(parent); syncDirectory(directory);
        assertChain(ctx.root,parent,chain);
        assertChain(ctx.root,directory,recoveryChain);
        const checked=transactionFile(ctx.root,directory,'before.md');
        if(checked.sha256 !== expected_sha256 || checked.identity.dev !== before.identity.dev || checked.identity.ino !== before.identity.ino) editFail('local-note-conflict');
        // Exclusive publication cannot replace a path recreated by another editor.
        try { linkSync(proposed,path); published=true; }
        catch(error) { if(error.code === 'EEXIST') editFail('local-note-conflict'); throw error; }
        syncDirectory(parent);
        const after=note(context(ctx.root),normalized);
        const displaced=transactionFile(ctx.root,directory,'before.md');
        if(after.sha256 !== ledger.new_sha256 || displaced.sha256 !== expected_sha256) editFail('local-note-recovery-required');
        finishTransaction(ctx.root,directory,'applied');
        return publicNote(after);
      } catch(error) {
        // A platform error can follow a completed capture syscall; inspect the
        // durable slot rather than assuming the JavaScript flag was updated.
        capturedTarget ||= !!exists(captured);
        if(capturedTarget && !published) {
          try { assertChain(ctx.root,directory,recoveryChain); restoreCaptured(ctx.root,directory,path,chain); }
          catch { editFail('local-note-recovery-required'); }
        }
        try { finishTransaction(ctx.root,directory,capturedTarget ? 'conflict' : 'aborted'); }
        catch { editFail('local-note-recovery-required'); }
        if(published) editFail('local-note-recovery-required');
        throw error;
      }
    });
  } catch (error) {
    if (error.message === 'not-found' || /^local-note-(?:invalid|conflict|busy|metadata-immutable|markers-immutable|format-immutable|recovery-required|filesystem-unsupported)$/.test(error.message)) throw error;
    editFail('local-note-save-failed');
  }
}

export function resolveLocalFileLink(root, { from_ref, target } = {}) {
  const missing = () => editFail('local-note-link-not-found');
  try {
    const ctx = context(root);
    const source = note(ctx, cleanRef(from_ref));
    if (typeof target !== 'string' || !target.trim() || target.length > 1024 || /[\u0000-\u001f\\:\[\]]/.test(target)) missing();
    const destination = target.split('|', 1)[0].trim();
    const hash = destination.indexOf('#');
    const name = (hash === -1 ? destination : destination.slice(0, hash)).trim();
    const anchor = hash === -1 ? '' : destination.slice(hash + 1).trim();
    const result = ref => ({ ref, ...(anchor ? { anchor } : {}) });
    if (!name) { if (!anchor) missing(); return result(source.ref); }
    const candidates = new Set();
    if (name.includes('/') || name.startsWith('.')) {
      const withExtension = /\.md$/i.test(name) ? name : `${name}.md`;
      const paths = name.startsWith('/') ? [resolve(ctx.knowledgePath, withExtension.slice(1))]
        : name.startsWith('./') || name.startsWith('../') ? [resolve(dirname(resolve(ctx.root, source.ref)), withExtension)]
          : [resolve(ctx.root, withExtension), resolve(dirname(resolve(ctx.root, source.ref)), withExtension)];
      for (const path of paths) {
        if (!within(ctx.knowledgePath, path)) continue;
        try { candidates.add(note(ctx, cleanRef(slash(relative(ctx.root, path)))).ref); } catch { /* Denied targets never participate in link resolution. */ }
      }
    } else {
      const key = name.replace(/\.md$/i, '').normalize('NFC').toLocaleLowerCase();
      const scanned = scan(ctx);
      if (!scanned.complete) editFail('local-note-link-incomplete');
      for (const item of scanned.notes) {
        if (item.stem.normalize('NFC').toLocaleLowerCase() === key || item.title.normalize('NFC').toLocaleLowerCase() === key) candidates.add(item.ref);
      }
    }
    if (candidates.size > 1) editFail('local-note-link-ambiguous');
    if (!candidates.size) missing();
    const ref = [...candidates][0];
    note(context(ctx.root), ref); // An indexed match is never authority for a later open.
    return result(ref);
  } catch (error) {
    if (['local-note-link-ambiguous','local-note-link-incomplete'].includes(error.message)) throw error;
    missing();
  }
}

// Relations share the same authorization gates as explicit note reads.
const localRelations = createLocalNoteRelations({context,note,scan,resolveSafe,allowedName,within,cleanRef});
export const listLocalFileBacklinks = localRelations.listBacklinks;
export const listLocalNoteAttachments = localRelations.listAttachments;
export const readLocalNoteAttachment = localRelations.readAttachment;
