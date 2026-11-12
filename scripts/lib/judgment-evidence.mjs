// Resolve the bytes a human is judging. Runtime pointers are provenance, never
// delivery content. No writes, copied source bodies or inferred execution proof.
import { createHash } from 'node:crypto';
import { closeSync, constants, existsSync, fstatSync, lstatSync, openSync, readSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { layout } from './system-protocol.mjs';
import { routineOutputDirectory } from './routine-protocol.mjs';
import { publicMarkdownParts } from './note-visibility.mjs';
import { judgmentOrigin } from './judgment-origin.mjs';

export const MAX_PRIVATE_OUTPUT_BYTES = 512 * 1024;
const HASH_RE = /^[a-f0-9]{64}$/;
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const inside = (parent, path) => { const ref = relative(parent, path); return Boolean(ref) && !ref.startsWith('..') && !isAbsolute(ref); };

function noSymlinks(root, target, reason) {
  let path = resolve(root);
  for (const part of relative(path, target).split(sep)) {
    path = join(path, part);
    if (lstatSync(path).isSymbolicLink()) throw new Error(reason);
  }
}

const sameIdentity = (left, right) => left.dev === right.dev && left.ino === right.ino && left.mode === right.mode;

function pathIdentity(root, target, prefix) {
  const base = resolve(root);
  if (!inside(base, target)) throw new Error(`${prefix}-identity-changed`);
  const paths = [base];
  let current = base;
  for (const part of relative(base, target).split(sep)) { current = join(current, part); paths.push(current); }
  const chain = paths.map((path) => {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) throw new Error(`${prefix}-symlink-blocked`);
    return { dev: stat.dev, ino: stat.ino, mode: stat.mode };
  });
  const realRoot = realpathSync(base);
  const realPath = realpathSync(target);
  if (!inside(realRoot, realPath)) throw new Error(`${prefix}-identity-changed`);
  return { chain, realRoot, realPath };
}

function assertPathIdentity(root, path, prefix, authorized, fdStat) {
  let actual;
  try { actual = pathIdentity(root, path, prefix); }
  catch { throw new Error(`${prefix}-identity-changed`); }
  if (actual.realRoot !== authorized.realRoot || actual.realPath !== authorized.realPath
    || actual.chain.length !== authorized.chain.length
    || actual.chain.some((entry, index) => !sameIdentity(entry, authorized.chain[index]))
    || !sameIdentity(fdStat, authorized.chain.at(-1))) throw new Error(`${prefix}-identity-changed`);
}

function textFile(path, prefix, root, maxBytes = MAX_PRIVATE_OUTPUT_BYTES) {
  let fd;
  try {
    const authorized = pathIdentity(root, path, prefix);
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const stat = fstatSync(fd);
    assertPathIdentity(root, path, prefix, authorized, stat);
    if (!stat.isFile()) throw new Error(`${prefix}-not-file`);
    if (stat.size > maxBytes) throw new Error(`${prefix}-too-large`);
    // Bound the read even if another writer grows the file after fstat.
    const bytes = Buffer.alloc(maxBytes + 1);
    let used = 0;
    // readFileSync on an fd is unbounded; use readSync for the enforced cap.
    while (used < bytes.length) {
      const count = readSync(fd, bytes, used, bytes.length - used, null);
      if (!count) break;
      used += count;
    }
    assertPathIdentity(root, path, prefix, authorized, fstatSync(fd));
    if (used > maxBytes) throw new Error(`${prefix}-too-large`);
    const body = bytes.subarray(0, used);
    if (body.includes(0)) throw new Error(`${prefix}-binary-blocked`);
    let content;
    try { content = new TextDecoder('utf-8', { fatal: true }).decode(body); }
    catch { throw new Error(`${prefix}-encoding-invalid`); }
    return { content, bytes: used, sha256: sha256(body) };
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error(`${prefix}-not-found`);
    if (error.code === 'ELOOP') throw new Error(`${prefix}-symlink-blocked`);
    throw error;
  } finally { if (fd !== undefined) closeSync(fd); }
}

// Keep native output restrictions and reason codes compatible with existing API.
function runtimeOutput(root, receipt) {
  const outputRoot = routineOutputDirectory(root);
  const path = resolve(root, receipt.output_ref);
  if (!inside(outputRoot, path)) throw new Error('output-outside-runtime');
  if (!existsSync(outputRoot) || !existsSync(path)) throw new Error('output-not-found');
  if (lstatSync(outputRoot).isSymbolicLink()) throw new Error('output-root-symlink-blocked');
  if (lstatSync(path).isSymbolicLink()) throw new Error('output-symlink-blocked');
  const realBrain = realpathSync(resolve(root));
  const realRoot = realpathSync(outputRoot);
  if (!inside(realBrain, realRoot)) throw new Error('output-root-outside-brain');
  noSymlinks(resolve(root), outputRoot, 'output-root-symlink-blocked');
  noSymlinks(outputRoot, path, 'output-symlink-blocked');
  if (!inside(realRoot, realpathSync(path))) throw new Error('output-outside-runtime');
  return textFile(path, 'output', root);
}

function safeJournalRef(root, ref) {
  const config = layout(root).vault;
  const daily = config && typeof config === 'object' && !Array.isArray(config) ? (config.daily || 'journal') : null;
  const valid = (value) => typeof value === 'string' && value.length > 0 && value.length <= 256
    && !isAbsolute(value) && !value.includes('\\') && !value.includes(':')
    && value.split('/').every((part) => part && !part.startsWith('.') && !/^(?:private|privado|node_modules)$/i.test(part));
  if (!valid(daily) || !valid(ref)) throw new Error('journal-source-ref-invalid');
  const base = resolve(root, daily);
  const path = resolve(root, ref);
  if (!inside(resolve(root), base) || !inside(base, path)
    || !/^(?:\d{4}-\d{2}-\d{2}|\d{4}-W\d{2}-review)\.md$/.test(relative(base, path))) {
    throw new Error('journal-source-ref-invalid');
  }
  return path;
}

// Reimport can refresh a pointer; the first reconstructed trace retains the hash
// at import time. Read it without creating the trace directory or trusting paths.
function importedHash(root, receipt, noteRef) {
  const traceRoot = resolve(root, layout(root).executionTraces || '.cerebro/runtime/traces');
  if (!inside(resolve(root, '.cerebro/runtime'), traceRoot)) throw new Error('journal-provenance-invalid');
  const tracePath = join(traceRoot, `${receipt.run_id}.jsonl`);
  if (!existsSync(tracePath)) throw new Error('journal-provenance-unavailable');
  noSymlinks(resolve(root), tracePath, 'journal-provenance-invalid');
  const records = textFile(tracePath, 'journal-provenance', root).content.split('\n').filter(Boolean).map((line) => JSON.parse(line));
  const relevant = records.filter((event) => event.run_id === receipt.run_id && event.extensions?.import_source === noteRef);
  const hashes = new Set(relevant.map((event) => /^sha256:([a-f0-9]{64})$/.exec(event.extensions?.note_hash || '')?.[1]).filter(Boolean));
  if (hashes.size !== 1) throw new Error('journal-provenance-invalid');
  return [...hashes][0];
}

export function readJudgmentEvidence(root, receipt) {
  const origin = judgmentOrigin(receipt);
  const review = { origin, source_ref: null, version_state: 'unavailable', content_sha256: null,
    expected_sha256: null, can_judge: false, reason_code: null, approval_scope: 'delivery-quality' };
  const empty = { content: '', bytes: 0, media_type: 'text/markdown; charset=utf-8' };
  if (origin === 'legacy-import') return { output: empty, review: { ...review, reason_code: 'legacy-delivery-unavailable' } };
  if (origin === 'native') {
    const value = runtimeOutput(root, receipt);
    if (!value.content.trim()) return { output: { ...empty, content: value.content, bytes: value.bytes },
      review: { ...review, source_ref: receipt.output_ref, content_sha256: value.sha256, reason_code: 'output-content-empty' } };
    return { output: { content: value.content, bytes: value.bytes, media_type: empty.media_type }, review: {
      ...review, source_ref: receipt.output_ref, version_state: 'original', content_sha256: value.sha256, can_judge: true,
    } };
  }
  try {
    const pointer = runtimeOutput(root, receipt).content;
    const refs = [...pointer.matchAll(/^- Nota no vault: (.+)\r?$/gm)].map((match) => match[1]);
    const hashes = [...pointer.matchAll(/^- Hash da nota: sha256:([a-f0-9]{64})\r?$/gm)].map((match) => match[1]);
    if (refs.length !== 1 || hashes.length !== 1 || !receipt.input_refs.includes(refs[0])) throw new Error('journal-provenance-invalid');
    const path = safeJournalRef(root, refs[0]);
    review.source_ref = refs[0];
    review.expected_sha256 = importedHash(root, receipt, refs[0]);
    noSymlinks(resolve(root), path, 'journal-source-symlink-blocked');
    if (!inside(realpathSync(resolve(root)), realpathSync(path))) throw new Error('journal-source-ref-invalid');
    const value = textFile(path, 'journal-source', root);
    try { publicMarkdownParts(value.content); } catch { throw new Error('journal-source-private'); }
    const unchanged = value.sha256 === review.expected_sha256;
    return { output: { content: value.content, bytes: value.bytes, media_type: empty.media_type }, review: {
      ...review, version_state: unchanged ? 'original' : 'changed', content_sha256: value.sha256,
      can_judge: unchanged, reason_code: unchanged ? null : 'journal-source-changed',
    } };
  } catch (error) {
    const reason = error.code === 'ENOENT' ? 'journal-source-not-found'
      : /^journal-[a-z-]+$/.test(error.message) ? error.message : 'journal-evidence-unavailable';
    return { output: empty, review: { ...review, reason_code: reason } };
  }
}

export function assertReviewedEvidence(review, reviewedSha256) {
  if (typeof reviewedSha256 !== 'string' || !HASH_RE.test(reviewedSha256)) throw new Error('judgment-reviewed-hash-required');
  if (!review.can_judge) throw new Error(review.version_state === 'changed' ? 'judgment-evidence-changed' : 'judgment-evidence-unavailable');
  if (review.content_sha256 !== reviewedSha256) throw new Error('judgment-reviewed-version-stale');
}
