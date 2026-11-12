import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { lstatSync, readFileSync, readlinkSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Hash normalized, complete tokens; customer names never belong in this policy.
const CUSTOMER_TOKEN_HASHES = new Set(['84b19a07caafc4e26b2798387cc840675a3b536ee3bcc26269c42d009c1fcd8f', 'b5eb653070ca6737505f680ee006ed5c76b8b2ff417c1551c2539885175bd511', '91f9b59cd3a4c0dd360e6c2a0da92d872e9839a3792f1789811a46dca5ef0f2c']);
const ZERO = /^0+$/;
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const MAX_OUTPUT = 256 * 1024 * 1024;
const hash = (token) => createHash('sha256').update(token).digest('hex');
const tokens = (value) => value.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}\p{M}]+/gu) ?? [];
const hasCustomerToken = (value, hashes) => tokens(value).some((token) => hashes.has(hash(token)));
const githubTokens = (value) => (
  value.match(/(?<![A-Za-z0-9_])(?:gh[pousr]_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{82})(?![A-Za-z0-9_])/g) ?? []
).filter((candidate) => new Set(candidate.slice(candidate.indexOf('_') + 1)).size >= 10);

export function scanText(path, text, { bannedTokenHashes = CUSTOMER_TOKEN_HASHES } = {}) {
  // Redact customer tokens even when they occur in the filename itself.
  let displayPath = path.replace(/[\p{L}\p{N}\p{M}]+/gu, (token) => (
    hasCustomerToken(token, bannedTokenHashes) ? '[redacted]' : token
  ));
  const pathCredentials = githubTokens(path);
  for (const credential of pathCredentials) displayPath = displayPath.replaceAll(credential, '[redacted]');
  const findings = [];
  if (pathCredentials.length) findings.push({ path: displayPath, line: 1, rule: 'github-token-path' });
  if (hasCustomerToken(path, bannedTokenHashes)) {
    findings.push({ path: displayPath, line: 1, rule: 'customer-path' });
  }
  for (const [index, line] of text.split('\n').entries()) {
    const report = (rule) => findings.push({ path: displayPath, line: index + 1, rule });
    if (hasCustomerToken(line, bannedTokenHashes)) report('customer-token');
    // Repeated-character placeholders in synthetic fixtures are not plausible credentials.
    if (githubTokens(line).length) report('github-token');
  }
  const keyBlocks = /-----BEGIN ((?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY)-----[ \t]*\r?\n([A-Za-z0-9+/=\r\n]+)-----END \1-----/g;
  for (const match of text.matchAll(keyBlocks)) {
    if (match[2].replace(/\s/g, '').length < 64) continue;
    findings.push({ path: displayPath, line: text.slice(0, match.index).split('\n').length, rule: 'private-key' });
  }
  return findings;
}

function git(args, options = {}) {
  const result = spawnSync('git', args, { maxBuffer: MAX_OUTPUT, ...options });
  if (result.error || result.status !== 0) throw new Error('git-read-failed');
  return result.stdout;
}

function decodeText(buffer) {
  if (buffer.includes(0)) return '';
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
  catch { return ''; } // Binary/non-UTF-8 contents are outside this text-only guard.
}

function scanWorkingTree() {
  const root = git(['rev-parse', '--show-toplevel']).toString().trim();
  const paths = git(['-C', root, 'ls-files', '-z', '--cached']).toString().split('\0').filter(Boolean);
  const findings = [];
  for (const path of new Set(paths)) {
    let buffer;
    try {
      const absolute = resolve(root, path);
      const info = lstatSync(absolute);
      if (info.isDirectory()) throw new Error('unsupported-tracked-directory');
      buffer = info.isSymbolicLink() ? Buffer.from(readlinkSync(absolute)) : readFileSync(absolute);
    } catch (error) {
      if (error.code === 'ENOENT') continue; // A tracked deletion will not be published.
      throw error;
    }
    findings.push(...scanText(path, decodeText(buffer)));
  }
  return findings;
}

function resolveCommit(ref) {
  // The end-of-options delimiter prevents user-controlled refs becoming git options.
  return git(['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`]).toString().trim();
}

function scanCommit(ref) {
  const commit = resolveCommit(ref);
  const entries = git(['ls-tree', '-r', '-z', '--full-tree', commit]).toString().split('\0').filter(Boolean).map((entry) => {
    const tab = entry.indexOf('\t');
    const [mode, type, oid] = entry.slice(0, tab).split(' ');
    return { mode, type, oid, path: entry.slice(tab + 1) };
  });
  if (entries.some((entry) => entry.type !== 'blob')) throw new Error('unsupported-gitlink');
  if (!entries.length) return [];
  const output = git(['cat-file', '--batch'], { input: entries.map(({ oid }) => oid).join('\n') + '\n' });
  let offset = 0;
  const findings = [];
  for (const entry of entries) {
    const end = output.indexOf(10, offset);
    const header = output.subarray(offset, end).toString();
    const match = /^([a-f0-9]+) blob (\d+)$/.exec(header);
    if (!match || match[1] !== entry.oid) throw new Error('invalid-git-blob');
    const start = end + 1;
    const size = Number(match[2]);
    if (start + size >= output.length) throw new Error('incomplete-git-blob');
    findings.push(...scanText(entry.path, decodeText(output.subarray(start, start + size))));
    offset = start + size + 1;
  }
  return findings;
}

function scanPush(remote) {
  const input = readFileSync(0, 'utf8');
  const commits = new Set();
  for (const line of input.split('\n').filter(Boolean)) {
    const fields = line.trim().split(/\s+/);
    if (fields.length !== 4) throw new Error('invalid-push-input');
    const [, localOid, , remoteOid] = fields;
    if (!OID.test(localOid) || !OID.test(remoteOid)) throw new Error('invalid-push-oid');
    if (ZERO.test(localOid)) continue;
    const tip = resolveCommit(localOid);
    commits.add(tip); // Always inspect every pushed tree, even when there is no new commit.
    let args;
    if (ZERO.test(remoteOid)) {
      // Existing tracking refs describe commits already held by this remote. A new
      // repository has none, so its entire initial history is checked.
      if (!remote || /[\r\n]/.test(remote)) throw new Error('invalid-remote');
      const prefixes = git(['for-each-ref', '--format=%(objectname)', `refs/remotes/${remote}/`]).toString().trim().split('\n').filter(Boolean);
      args = ['rev-list', tip, ...prefixes.map((oid) => `^${oid}`)];
    } else {
      resolveCommit(remoteOid); // Missing advertised base must fail closed.
      args = ['rev-list', tip, `^${remoteOid}`];
    }
    const introduced = git(args).toString().trim().split('\n').filter(Boolean);
    for (const commit of introduced) commits.add(commit);
  }
  return [...commits].flatMap(scanCommit);
}

function scanHistory(ref) {
  if (git(['rev-parse', '--is-shallow-repository']).toString().trim() !== 'false') {
    throw new Error('incomplete-history');
  }
  const tip = resolveCommit(ref);
  return git(['rev-list', tip]).toString().trim().split('\n').filter(Boolean).flatMap(scanCommit);
}

export function main(args = process.argv.slice(2)) {
  try {
    let findings;
    if (!args.length) findings = scanWorkingTree();
    else if (args.length === 2 && args[0] === '--ref') findings = scanCommit(args[1]);
    else if (args.length === 2 && args[0] === '--history') findings = scanHistory(args[1]);
    else if (args.length === 2 && args[0] === '--pre-push') findings = scanPush(args[1]);
    else throw new Error('invalid-arguments');
    const unique = new Map(findings.map((finding) => [JSON.stringify(finding), finding]));
    for (const finding of unique.values()) console.error(JSON.stringify(finding));
    if (unique.size) return 1;
    console.log('Sensitive data check passed.');
    return 0;
  } catch {
    // Never print git errors, file contents, ref names, or exception messages.
    console.error('Sensitive data check failed: unable to inspect all requested tracked files.');
    return 2;
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  process.exitCode = main();
}
