import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanText } from './check-sensitive-data.mjs';

const digest = (value) => createHash('sha256').update(value).digest('hex');
const bannedTokenHashes = new Set([digest('fixtureclient')]);
assert.deepEqual(scanText('notes.txt', 'safe\nFixtureClient is private', { bannedTokenHashes }), [
  { path: 'notes.txt', line: 2, rule: 'customer-token' },
]);
assert.deepEqual(scanText('notes.txt', 'fixtureclientish otherfixtureclient', { bannedTokenHashes }), []);
assert.deepEqual(scanText('FixtureClient/notes.txt', '', { bannedTokenHashes }), [
  { path: '[redacted]/notes.txt', line: 1, rule: 'customer-path' },
]);
assert.equal(scanText('a', 'ＦＩＸＴＵＲＥＣＬＩＥＮＴ', { bannedTokenHashes }).length, 1);

// Generated synthetic formats exercise detection without storing a credential.
const githubToken = ['gh', 'p_'].join('') + '0123456789abcdefghijklmnopqrstuvwxyz';
const fineGrainedToken = ['github', '_pat_'].join('') + 'aB2cD3eF4g'.repeat(8) + 'h5';
const keyHeader = ['-----BEGIN', 'PRIVATE KEY-----'].join(' ');
const keyFooter = ['-----END', 'PRIVATE KEY-----'].join(' ');
const privateKey = `${keyHeader}\n${Buffer.from('fictitious key material for a regression test only'.repeat(3)).toString('base64')}\n${keyFooter}`;
assert.equal(scanText('a', githubToken)[0].rule, 'github-token');
assert.deepEqual(scanText(`${githubToken}.txt`, ''), [
  { path: '[redacted].txt', line: 1, rule: 'github-token-path' },
]);
assert.equal(scanText('a', fineGrainedToken)[0].rule, 'github-token');
assert.deepEqual(scanText('a', privateKey), [{ path: 'a', line: 1, rule: 'private-key' }]);
assert.deepEqual(scanText('a', keyHeader), []);
assert.deepEqual(scanText('a', ['gh', 'p_'].join('') + 'x'.repeat(36)), []);
assert.deepEqual(scanText('a', `${keyHeader}\nshort\n${keyFooter}`), []);

const root = mkdtempSync(join(tmpdir(), 'sensitive-data-regression-'));
function git(...args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, 'temporary git operation failed');
  return result.stdout.trim();
}
function check(args = [], options = {}) {
  return spawnSync(process.execPath, ['scripts/check-sensitive-data.mjs', ...args], {
    cwd: root, encoding: 'utf8', ...options,
  });
}
function commit(message) {
  git('add', '.');
  git('commit', '-qm', message);
  return git('rev-parse', 'HEAD');
}
const zero = '0'.repeat(40);
const pushLine = (name, oid, old = zero) => `refs/heads/${name} ${oid} refs/heads/${name} ${old}\n`;
function hook(input) {
  return spawnSync('sh', ['.githooks/pre-push', 'origin'], { cwd: root, encoding: 'utf8', input });
}
try {
  git('init', '-q', '-b', 'main');
  git('config', 'user.name', 'Fixture Writer');
  git('config', 'user.email', 'fixture@example.invalid');
  mkdirSync(join(root, 'scripts'));
  mkdirSync(join(root, '.githooks'));
  copyFileSync(fileURLToPath(new URL('./check-sensitive-data.mjs', import.meta.url)), join(root, 'scripts/check-sensitive-data.mjs'));
  copyFileSync(fileURLToPath(new URL('../.githooks/pre-push', import.meta.url)), join(root, '.githooks/pre-push'));
  writeFileSync(join(root, 'notes.txt'), 'safe fixture\n');
  const clean = commit('clean initial tree');
  assert.equal(check().status, 0);
  assert.equal(check(['--history', clean]).status, 0);

  // Untracked files are never read, even if they contain a credential format.
  writeFileSync(join(root, 'untracked.txt'), githubToken);
  assert.equal(check().status, 0);
  git('add', 'untracked.txt');
  const staged = check();
  assert.equal(staged.status, 1, 'new tracked text must be scanned');
  assert.ok(!staged.stderr.includes(githubToken), 'diagnostics must omit matched values');
  assert.deepEqual(JSON.parse(staged.stderr.trim()), { path: 'untracked.txt', line: 1, rule: 'github-token' });
  const fromSubdirectory = spawnSync(process.execPath, [join(root, 'scripts/check-sensitive-data.mjs')], {
    cwd: join(root, 'scripts'), encoding: 'utf8',
  });
  assert.equal(fromSubdirectory.status, 1, 'running in a subdirectory must still inspect the whole tracked tree');
  assert.equal(check(['--ref', clean]).status, 0, 'commit scan must not read dirty worktree');
  git('reset', '-q', 'HEAD', 'untracked.txt');
  rmSync(join(root, 'untracked.txt'));

  writeFileSync(join(root, 'notes.txt'), privateKey);
  assert.equal(check().status, 1, 'plausible key blocks must fail');
  writeFileSync(join(root, 'notes.txt'), 'safe fixture\n');
  assert.equal(hook(pushLine('main', clean)).status, 0);
  git('update-ref', 'refs/remotes/origin/main', clean);

  git('switch', '-qc', 'unsafe');
  writeFileSync(join(root, 'notes.txt'), githubToken);
  const unsafe = commit('synthetic unsafe credential');
  assert.equal(check(['--ref', unsafe]).status, 1);
  writeFileSync(join(root, 'notes.txt'), 'safe fixture again\n');
  const cleaned = commit('remove synthetic credential');
  assert.equal(check(['--ref', cleaned]).status, 0);
  assert.equal(check(['--history', cleaned]).status, 1, 'history scan must inspect leaked ancestors of a safe tip');
  git('switch', '-q', 'main');

  assert.equal(hook(pushLine('main', clean) + pushLine('unsafe', unsafe)).status, 1,
    'must inspect another pushed ref even when the active branch is safe');
  assert.equal(hook(pushLine('cleaned', cleaned)).status, 1,
    'new refs must reject an unsafe intermediate commit followed by cleanup');
  assert.equal(hook(pushLine('cleaned', cleaned, clean)).status, 1,
    'existing refs must reject an unsafe intermediate commit followed by cleanup');
  assert.equal(hook(pushLine('deleted', zero, unsafe)).status, 0, 'ref deletions must be allowed');
  assert.equal(hook(pushLine('main', clean, '1'.repeat(40))).status, 2, 'missing bases must fail closed');
  assert.equal(check(['--ref', 'does-not-exist']).status, 2);

  rmSync(join(root, 'scripts/check-sensitive-data.mjs'));
  assert.notEqual(hook(pushLine('main', clean)).status, 0, 'missing scanner must block push');
} finally {
  rmSync(root, { recursive: true, force: true });
}
console.log('sensitive-data regression tests passed');
