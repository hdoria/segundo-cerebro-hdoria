#!/usr/bin/env node
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sandbox = mkdtempSync(join(tmpdir(), 'product-portability-'));
const fixture = join(sandbox, 'product');

function run(script, args = [], { nodeArgs = [], ...options } = {}) {
  return spawnSync(process.execPath, [...nodeArgs, script, ...args], { cwd: fixture, encoding: 'utf8', ...options });
}
function succeeds(result, label) {
  assert.equal(result.status, 0, `${label}\n${result.stderr || result.stdout}`);
}
function write(relative, content) {
  const path = join(fixture, relative);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

try {
  cpSync(ROOT, fixture, {
    recursive: true,
    filter: (path) => !['.git', 'node_modules'].some((name) => path === join(ROOT, name)),
  });
  // Each side has different runtime debris; none belongs to the skill contract.
  write('.claude/skills/comecar/__pycache__/runtime.pyc', 'source cache');
  write('.agents/skills/comecar/.pytest_cache/cache', 'target cache');
  write('.claude/skills/comecar/.DS_Store', 'metadata');
  write('.agents/skills/comecar/generated.pyc', 'bytecode');
  succeeds(run(join(fixture, 'scripts/sync-agent-skills.mjs'), ['--check']), 'skill sync ignores runtime debris');

  for (const side of ['.claude', '.agents']) {
    const skillPath = join(fixture, side, 'skills/comecar/SKILL.md');
    writeFileSync(skillPath, readFileSync(skillPath, 'utf8').replace(/\r?\n/g, '\r\n'));
  }
  succeeds(run(join(fixture, 'scripts/validate-product.mjs')), 'validator accepts CRLF frontmatter and ignores runtime debris');
  write('.agents/skills/comecar/real-change.md', 'real contract difference');
  assert.equal(run(join(fixture, 'scripts/sync-agent-skills.mjs'), ['--check']).status, 1,
    'real skill differences must still fail validation');
  rmSync(join(fixture, '.agents/skills/comecar/real-change.md'));

  // Exercise the Windows command selection on every CI host. On Unix, only the
  // unavailable tar.exe process is replaced; archive creation still uses real zip.
  const output = join(sandbox, 'company-brain-starter-en');
  const archivePath = `${output}.zip`;
  const archiveCommand = join(sandbox, 'archive-command.json');
  const preload = join(sandbox, 'windows-archive.mjs');
  writeFileSync(preload, `
import childProcess from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
const nativeSpawn = childProcess.spawnSync;
const nativePlatform = process.platform;
Object.defineProperty(process, 'platform', { value: 'win32' });
childProcess.spawnSync = (command, args, options) => {
  if (command !== 'tar.exe') throw new Error('Windows archive must use tar.exe');
  writeFileSync(${JSON.stringify(archiveCommand)}, JSON.stringify({ command, args }));
  return nativePlatform === 'win32'
    ? nativeSpawn(command, args, options)
    : nativeSpawn('zip', ['-qr', args[3], args[4]], options);
};
syncBuiltinESMExports();
`);
  succeeds(run(join(fixture, 'scripts/build-company-brain-starter.mjs'), ['--output', output, '--zip', archivePath], {
    nodeArgs: ['--import', pathToFileURL(preload).href],
  }), 'starter builds with the Windows archive command');
  assert.deepEqual(JSON.parse(readFileSync(archiveCommand)), {
    command: 'tar.exe', args: ['-a', '-c', '-f', archivePath, 'company-brain-starter-en'],
  });
  // Read ZIP central-directory entries without adding an unzip dependency.
  const zip = readFileSync(archivePath);
  const names = [];
  for (let offset = 0; offset + 46 <= zip.length; offset += 1) {
    if (zip.readUInt32LE(offset) !== 0x02014b50) continue;
    const nameBytes = zip.readUInt16LE(offset + 28);
    names.push(zip.subarray(offset + 46, offset + 46 + nameBytes).toString('utf8'));
    offset += 45 + nameBytes + zip.readUInt16LE(offset + 30) + zip.readUInt16LE(offset + 32);
  }
  for (const name of ['START-HERE.md', '.cerebro/layout.json', 'skills/company-brain-sprint/SKILL.md', 'protocol/run-record.schema.json']) {
    assert(names.includes(`company-brain-starter-en/${name}`), `archive missing ${name}`);
  }
  assert(names.every((name) => name.startsWith('company-brain-starter-en/')), 'archive must contain only the starter folder');

  // node:path is native to the host; inject only Windows relative separators so
  // persisted/API references are exercised on Unix without emulating a filesystem.
  const windowsPaths = join(sandbox, 'windows-relative.mjs');
  writeFileSync(windowsPaths, `
import path from 'node:path';
import { syncBuiltinESMExports } from 'node:module';
const nativeRelative = path.relative;
path.relative = (...args) => nativeRelative(...args).replaceAll('/', '\\\\');
syncBuiltinESMExports();
`);
  succeeds(run(join(fixture, 'scripts/test-decision-case.mjs'), [], {
    nodeArgs: ['--import', pathToFileURL(windowsPaths).href],
  }), 'decision references use protocol separators with Windows relative paths');
  console.log('✓ product portability: runtime debris, CRLF skills, Windows archives and POSIX decision references');
} finally {
  rmSync(sandbox, { recursive: true, force: true });
}
