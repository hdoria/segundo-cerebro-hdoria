#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import * as files from './lib/local-file-browser.mjs';

const root = fs.mkdtempSync(join(fs.realpathSync(tmpdir()), 'local-note-edit-'));
const outside = fs.mkdtempSync(join(fs.realpathSync(tmpdir()), 'local-note-outside-'));
const sha = value => createHash('sha256').update(value).digest('hex');
function write(ref, text) { const path = join(root, ref); fs.mkdirSync(dirname(path), { recursive: true }); fs.writeFileSync(path, text); return path; }
function read(ref) { return files.readLocalFile(root, ref); }
function save(ref, text, hash = read(ref).sha256) { return files.saveLocalFile(root, { ref, text, expected_sha256: hash }); }
function fails(action, code) { assert.throws(action, error => error.message === code, code); }
function intercept(name, callback, action) {
  const original = fs[name];
  fs[name] = (...args) => { const result = original(...args); callback(...args); return result; };
  syncBuiltinESMExports();
  try { return action(); } finally { fs[name] = original; syncBuiltinESMExports(); }
}
write('.cerebro/layout.json', JSON.stringify({ knowledgeRoot: '.' }));
try {
  const original = '\uFEFF---\r\ntype: Note\r\ntags: [example]\r\n---\r\n# Fictitious note\r\n\r\nManual paragraph.\r\n<!-- ai:start -->\r\nOld draft.\r\n<!-- ai:end -->\r\n';
  const path = write('notes/example.md', original);
  const current = read('notes/example.md');
  assert.equal(current.sha256, sha(Buffer.from(original)), 'read version hashes exact UTF-8 file bytes including BOM');
  assert.equal(current.text, original, 'read retains BOM and CRLF for lossless editing');
  assert.equal(current.type, 'Note', 'BOM-preserving reads still expose existing metadata');
  const stat = fs.statSync(path);
  assert.deepEqual(save('notes/example.md', original), current, 'unchanged save returns current version');
  assert.equal(fs.statSync(path).ino, stat.ino, 'no-op never replaces file');
  assert.equal(fs.statSync(path).mtimeMs, stat.mtimeMs, 'no-op never rewrites bytes');
  const changed = original.replace('Manual paragraph.', 'Edited manual paragraph.');
  const saved = save('notes/example.md', changed);
  assert.equal(saved.sha256, sha(changed));
  assert.equal(saved.text, changed);
  assert.equal(fs.readFileSync(path, 'utf8'), changed);
  fails(() => save('notes/example.md', original, current.sha256), 'local-note-conflict');
  fails(() => save('notes/example.md', changed, current.sha256), 'local-note-conflict');
  fails(() => save('notes/example.md', changed.replace('type: Note', 'type: Project')), 'local-note-metadata-immutable');
  fails(() => save('notes/example.md', changed.replace('<!-- ai:start -->', '')), 'local-note-markers-immutable');
  fails(() => save('notes/example.md', changed.replace('<!-- ai:end -->', '<!-- ai:finish -->')), 'local-note-markers-immutable');
  fails(() => save('notes/example.md', changed.replaceAll('\r\n', '\n')), 'local-note-format-immutable');
  fails(() => save('notes/example.md', changed.slice(1)), 'local-note-format-immutable');
  fails(() => save('notes/example.md', `${changed}\0`), 'local-note-invalid');
  fails(() => save('notes/example.md', `${changed}\ud800`), 'local-note-invalid');
  fails(() => save('notes/example.md', 'x'.repeat(512 * 1024 + 1)), 'local-note-invalid');
  for (const value of [null, 2, {}, Buffer.from('x')]) fails(() => save('notes/example.md', value), 'local-note-invalid');
  for (const hash of ['', 'x', null, 'A'.repeat(64)]) fails(() => save('notes/example.md', changed, hash), 'local-note-invalid');
  write('notes/plain.md', '# Plain\n');
  fails(() => save('notes/plain.md', '---\ntype: Note\n---\n# Plain\n'), 'local-note-metadata-immutable');
  write('notes/markers.md', '# Markers\n<!-- ai:start -->\nA\n<!-- ai:end -->\n<!-- ai:custom -->\n');
  fails(() => save('notes/markers.md', '# Markers\n<!-- ai:end -->\nA\n<!-- ai:start -->\n<!-- ai:custom -->\n'), 'local-note-markers-immutable');
  fails(() => save('notes/markers.md', '# Markers\n<!-- ai:start -->\nA\n<!-- ai:end -->\n'), 'local-note-markers-immutable');
  write('notes/broken.md', '---\ntype: Note\n# Broken');
  write('notes/private.md', '---\nvisibility: private\n---\n# Private');
  write('.hidden.md', '# Hidden');
  write('private/denied.md', '# Denied');
  fs.writeFileSync(join(outside, 'outside.md'), '# Untouched outside\n');
  fs.symlinkSync(join(outside, 'outside.md'), join(root, 'notes/linked.md'));
  fs.symlinkSync(outside, join(root, 'linked-directory'), 'dir');
  for (const ref of ['notes/private.md', 'notes/broken.md', '.hidden.md', 'private/denied.md', 'notes/linked.md', 'linked-directory/outside.md', '../outside.md', '/etc/passwd', 'notes/../notes/plain.md', 'notes\\plain.md', 'missing.md']) {
    fails(() => save(ref, '# Attempt\n', sha('# Untouched outside\n')), 'not-found');
  }
  assert.equal(fs.readFileSync(join(outside, 'outside.md'), 'utf8'), '# Untouched outside\n');
  write('notes/stale.md', '# Initial\n');
  const stale = read('notes/stale.md');
  write('notes/stale.md', '# External edit\n');
  fails(() => save('notes/stale.md', '# Local edit\n', stale.sha256), 'local-note-conflict');
  assert.equal(read('notes/stale.md').text, '# External edit\n');

  // Inject external edits at actual filesystem boundaries; the submitted bytes
  // are never allowed to replace a file changed after the first version check.
  write('notes/race.md', '# Before\n');
  const race = read('notes/race.md');
  let changedDuringWrite = false;
  intercept('writeSync', fd => {
    if (changedDuringWrite) return;
    const stat = fs.fstatSync(fd);
    if (stat.size !== Buffer.byteLength('# Proposed\n')) return;
    changedDuringWrite = true;
    write('notes/race.md', '# External during save\n');
  }, () => fails(() => save('notes/race.md', '# Proposed\n', race.sha256), 'local-note-conflict'));
  assert.equal(changedDuringWrite, true);
  assert.equal(read('notes/race.md').text, '# External during save\n');

  write('notes/replaced.md', '# Before replacement\n');
  const replaced = read('notes/replaced.md');
  let replacedDuringWrite = false;
  intercept('writeSync', fd => {
    if (replacedDuringWrite || fs.fstatSync(fd).size !== Buffer.byteLength('# Proposed replacement\n')) return;
    replacedDuringWrite = true;
    fs.renameSync(join(root, 'notes/replaced.md'), join(root, 'notes/previous.md'));
    fs.symlinkSync(join(outside, 'outside.md'), join(root, 'notes/replaced.md'));
  }, () => fails(() => save('notes/replaced.md', '# Proposed replacement\n', replaced.sha256), 'not-found'));
  assert.equal(replacedDuringWrite, true);
  assert.equal(fs.readFileSync(join(outside, 'outside.md'), 'utf8'), '# Untouched outside\n');

  write('notes/inode.md', '# Same bytes\n');
  const inode = read('notes/inode.md');
  let inodeReplaced = false;
  intercept('writeSync', fd => {
    if (inodeReplaced || fs.fstatSync(fd).size !== Buffer.byteLength('# Another revision\n')) return;
    inodeReplaced = true;
    write('notes/new-inode.md', '# Same bytes\n');
    fs.renameSync(join(root, 'notes/new-inode.md'), join(root, 'notes/inode.md'));
  }, () => fails(() => save('notes/inode.md', '# Another revision\n', inode.sha256), 'local-note-conflict'));
  assert.equal(inodeReplaced, true);
  assert.equal(read('notes/inode.md').text, '# Same bytes\n');

  write('notes/reentrant.md', '# Before\n');
  const reentrant = read('notes/reentrant.md');
  let nested = false;
  intercept('writeSync', fd => {
    if (nested || fs.fstatSync(fd).size !== Buffer.byteLength('# Outer\n')) return;
    nested = true;
    fails(() => save('notes/reentrant.md', '# Inner\n', reentrant.sha256), 'local-note-busy');
  }, () => save('notes/reentrant.md', '# Outer\n', reentrant.sha256));
  assert.equal(nested, true);
  assert.equal(read('notes/reentrant.md').text, '# Outer\n');

  write('changing-parent/note.md', '# Before parent race\n');
  const parent = read('changing-parent/note.md');
  let parentReplaced = false;
  intercept('writeSync', fd => {
    if (parentReplaced || fs.fstatSync(fd).size !== Buffer.byteLength('# Parent proposal\n')) return;
    parentReplaced = true;
    fs.renameSync(join(root, 'changing-parent'), join(root, 'previous-parent'));
    fs.symlinkSync(outside, join(root, 'changing-parent'), 'dir');
  }, () => fails(() => save('changing-parent/note.md', '# Parent proposal\n', parent.sha256), 'not-found'));
  assert.equal(parentReplaced, true);
  assert.equal(fs.readFileSync(join(root, 'previous-parent/note.md'), 'utf8'), '# Before parent race\n');
  assert.equal(fs.existsSync(join(outside, 'note.md')), false);

  write('notes/link-source.md', '# Source\n');
  write('notes/destination.md', '# Destination title\n');
  write('elsewhere/another.md', '# Unique visible title\n');
  const link = target => files.resolveLocalFileLink(root, { from_ref: 'notes/link-source.md', target });
  assert.deepEqual(link('destination'), { ref: 'notes/destination.md' });
  assert.deepEqual(link('DESTINATION TITLE|Alias'), { ref: 'notes/destination.md' });
  assert.deepEqual(link('destination#A heading|Alias'), { ref: 'notes/destination.md', anchor: 'A heading' });
  assert.deepEqual(link('#Local heading'), { ref: 'notes/link-source.md', anchor: 'Local heading' });
  assert.deepEqual(link('./destination.md'), { ref: 'notes/destination.md' });
  assert.deepEqual(link('../elsewhere/another'), { ref: 'elsewhere/another.md' });
  assert.deepEqual(link('/elsewhere/another.md'), { ref: 'elsewhere/another.md' });
  assert.deepEqual(link('Unique visible title'), { ref: 'elsewhere/another.md' });
  write('elsewhere/destination.md', '# Duplicate stem\n');
  fails(() => link('destination'), 'local-note-link-ambiguous');
  assert.deepEqual(link('notes/destination'), { ref: 'notes/destination.md' });
  for (const target of ['private', 'private/denied', 'notes/private', '../private/denied', '../../outside', 'https://example.com', 'file:///etc/passwd', 'notes\\destination', '.cerebro/layout.json', 'missing', 'notes/linked', 'linked-directory/outside', 'x\0', '[[destination]]']) fails(() => link(target), 'local-note-link-not-found');
  fails(() => files.resolveLocalFileLink(root, { from_ref: 'notes/private.md', target: 'destination' }), 'local-note-link-not-found');
  write('.cerebro/layout.json', JSON.stringify({ knowledgeRoot: 'notes' }));
  fails(() => link('../elsewhere/another'), 'local-note-link-not-found');
  write('.cerebro/layout.json', JSON.stringify({ knowledgeRoot: '.' }));

  // The first real child pauses inside its note temp write while holding the
  // cooperating-save claim; a second process must never enter the commit step.
  write('notes/process.md', '# Process original\n');
  const moduleUrl = new URL('./lib/local-file-browser.mjs', import.meta.url).href;
  const childSource = `
    import fs from 'node:fs';
    import { syncBuiltinESMExports } from 'node:module';
    import { saveLocalFile } from ${JSON.stringify(moduleUrl)};
    const [root, hash, hold, release] = process.argv.slice(1);
    if (hold === 'yes') {
      const original = fs.writeSync;
      let signalled = false;
      fs.writeSync = (...args) => {
        const result = original(...args);
        if (!signalled && fs.fstatSync(args[0]).isFile() && fs.fstatSync(args[0]).size === Buffer.byteLength('# Process change\\n')) {
          signalled = true;
          original(1, 'held\\n');
          while (!fs.existsSync(release)) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
        }
        return result;
      };
      syncBuiltinESMExports();
    }
    try { saveLocalFile(root, { ref:'notes/process.md', text:'# Process change\\n', expected_sha256:hash }); console.log('saved'); }
    catch (error) { console.log(error.message); }
  `;
  const release = join(root, '.release-test');
  const first = spawn(process.execPath, ['--input-type=module', '-e', childSource, root, read('notes/process.md').sha256, 'yes', release], { stdio: ['ignore', 'pipe', 'pipe'] });
  let firstOutput = '';
  let firstError = '';
  first.stdout.on('data', chunk => { firstOutput += chunk; });
  first.stderr.on('data', chunk => { firstError += chunk; });
  const firstExit = new Promise((resolve, reject) => { first.on('error', reject); first.on('exit', resolve); });
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`child did not hold: ${firstOutput} ${firstError}`)), 10000);
      const inspect = () => { if (firstOutput.includes('held')) { clearTimeout(timeout); resolve(); } };
      first.stdout.on('data', inspect); inspect();
    });
    const second = spawn(process.execPath, ['--input-type=module', '-e', childSource, root, read('notes/process.md').sha256, 'no', release], { stdio: ['ignore', 'pipe', 'pipe'] });
    let secondOutput = '';
    second.stdout.on('data', chunk => { secondOutput += chunk; });
    assert.equal(await new Promise((resolve, reject) => { second.on('error', reject); second.on('exit', resolve); }), 0);
    assert.equal(secondOutput.trim(), 'local-note-busy', 'another process cannot enter a live target save');
  } finally { fs.writeFileSync(release, 'release'); }
  assert.equal(await firstExit, 0, firstError);
  assert.equal(firstOutput.trim(), 'held\nsaved');
  assert.equal(read('notes/process.md').text, '# Process change\n');

  // An external write at the very final rename boundary must never disappear.
  const boundaryPath=write('notes/final-boundary.md','# Boundary before\n');
  const boundaryVersion=read('notes/final-boundary.md').sha256;
  const originalRename=fs.renameSync;
  let boundaryChanged=false;
  fs.renameSync=(from,to,...rest) => {
    if(!boundaryChanged && (from === boundaryPath || to === boundaryPath)) {
      boundaryChanged=true;
      fs.writeFileSync(boundaryPath,'# Boundary external edit\n');
    }
    return originalRename(from,to,...rest);
  };
  syncBuiltinESMExports();
  try { fails(() => save('notes/final-boundary.md','# Boundary proposed\n',boundaryVersion),'local-note-conflict'); }
  finally { fs.renameSync=originalRename; syncBuiltinESMExports(); }
  assert.equal(read('notes/final-boundary.md').text,'# Boundary external edit\n');
  assert.equal(boundaryChanged,true);

  const recreationPath=write('notes/recreation.md','# Recreation original\n');
  const recreationVersion=read('notes/recreation.md').sha256;
  const nativeLink=fs.linkSync;
  let recreated=false;
  fs.linkSync=(from,to,...rest) => {
    if(!recreated && to === recreationPath) { recreated=true; fs.writeFileSync(recreationPath,'# External recreation\n'); }
    return nativeLink(from,to,...rest);
  };
  syncBuiltinESMExports();
  try { fails(() => save('notes/recreation.md','# Recreation proposal\n',recreationVersion),'local-note-conflict'); }
  finally { fs.linkSync=nativeLink; syncBuiltinESMExports(); }
  assert.equal(recreated,true);
  assert.equal(read('notes/recreation.md').text,'# External recreation\n');


  const latePath=write('notes/late-published.md','# Late original\n');
  const lateHash=read('notes/late-published.md').sha256;
  const lateFd=fs.openSync(latePath,'r+');
  let changedLate=false;
  fs.linkSync=(from,to,...rest)=>{
    if(!changedLate && to===latePath) {
      changedLate=true;
      const bytes=Buffer.from('# Late captured edit\n');
      fs.writeSync(lateFd,bytes,0,bytes.length,0); fs.ftruncateSync(lateFd,bytes.length);
    }
    return nativeLink(from,to,...rest);
  };
  syncBuiltinESMExports();
  try { fails(()=>save('notes/late-published.md','# Published proposal\n',lateHash),'local-note-recovery-required'); }
  finally { fs.linkSync=nativeLink; syncBuiltinESMExports(); fs.closeSync(lateFd); }
  assert.equal(changedLate,true);
  assert.equal(read('notes/late-published.md').text,'# Published proposal\n','published result is explicit uncertainty, never claimed as ordinary blocked conflict');
  const lateBase=join(root,'.cerebro/runtime/note-edit-recovery');
  assert.ok(fs.readdirSync(lateBase).some(name=>{
    const backup=join(lateBase,name,'before.md');
    return fs.existsSync(backup) && fs.readFileSync(backup,'utf8')==='# Late captured edit\n';
  }),'displaced late revision remains available privately');

  const crashRef='notes/crash.md';
  const crashPath=write(crashRef,'# Original before interrupted save\n');
  const crashModule=new URL('./lib/local-file-browser.mjs',import.meta.url).href;
  const crashCode=`
    import fs from 'node:fs';
    import {syncBuiltinESMExports} from 'node:module';
    import {saveLocalFile} from ${JSON.stringify(crashModule)};
    const [root,hash,target]=process.argv.slice(1);
    const link=fs.linkSync;
    fs.linkSync=(from,to,...rest)=>{if(to===target)process.exit(77);return link(from,to,...rest);};
    syncBuiltinESMExports();
    saveLocalFile(root,{ref:'notes/crash.md',expected_sha256:hash,text:'# Interrupted proposal\\n'});
  `;
  const crash=spawnSync(process.execPath,['--input-type=module','-e',crashCode,root,read(crashRef).sha256,crashPath],{encoding:'utf8'});
  assert.equal(crash.status,77,crash.stderr);
  assert.equal(fs.existsSync(crashPath),false,'interruption occurred after capture before publication');
  assert.equal(typeof files.recoverLocalNoteEdits,'function');
  const recovered=files.recoverLocalNoteEdits(root);
  assert.ok(recovered.some(r=>r.ref===crashRef && r.status==='restored'));
  assert.equal(read(crashRef).text,'# Original before interrupted save\n');
  assert.deepEqual(files.recoverLocalNoteEdits(root),[],'recovery is idempotent');


  for(const phase of ['before-capture','after-capture','after-publish']) {
    const ref=`notes/crash-${phase}.md`;
    const target=write(ref,`# Original ${phase}\n`);
    const version=read(ref).sha256;
    const source=`
      import fs from 'node:fs';
      import {syncBuiltinESMExports} from 'node:module';
      import {saveLocalFile} from ${JSON.stringify(crashModule)};
      const [root,hash,ref,target,phase]=process.argv.slice(1);
      const rename=fs.renameSync, link=fs.linkSync;
      fs.renameSync=(from,to,...rest)=>{
        if(from===target && phase==='before-capture')process.exit(81);
        const result=rename(from,to,...rest);
        if(from===target && phase==='after-capture')process.exit(81);
        return result;
      };
      fs.linkSync=(from,to,...rest)=>{
        const result=link(from,to,...rest);
        if(to===target && phase==='after-publish')process.exit(81);
        return result;
      };
      syncBuiltinESMExports();
      saveLocalFile(root,{ref,expected_sha256:hash,text:'# Proposed '+phase+'\\n'});
    `;
    const result=spawnSync(process.execPath,['--input-type=module','-e',source,root,version,ref,target,phase],{encoding:'utf8'});
    assert.equal(result.status,81,result.stderr);
    const reconciled=files.recoverLocalNoteEdits(root);
    assert.equal(reconciled.find(r=>r.ref===ref)?.status,phase==='after-capture'?'restored':phase==='after-publish'?'applied':'aborted');
    assert.equal(read(ref).text,`# ${phase==='after-publish'?'Proposed':'Original'} ${phase}\n`);
    assert.deepEqual(files.recoverLocalNoteEdits(root),[]);
  }

  // A noncooperating editor can keep the old inode open after capture. Preserve
  // that displaced inode permanently, including writes after successful Save.
  const oldFdPath=write('notes/old-fd.md','# Original old FD\n');
  const oldFd=fs.openSync(oldFdPath,'r+');
  try {
    save('notes/old-fd.md','# New canonical revision\n');
    const bytes=Buffer.from('# Late external writer\n');
    fs.writeSync(oldFd,bytes,0,bytes.length,0); fs.ftruncateSync(oldFd,bytes.length);
  } finally { fs.closeSync(oldFd); }
  const base=join(root,'.cerebro/runtime/note-edit-recovery');
  const backups=fs.readdirSync(base).map(name=>join(base,name,'before.md')).filter(path=>fs.existsSync(path));
  assert.ok(backups.some(path=>fs.readFileSync(path,'utf8')==='# Late external writer\n'),'late old-FD revision remains in private recovery backup');
  assert.equal(read('notes/old-fd.md').text,'# New canonical revision\n');
  assert.ok(backups.some(path=>fs.readFileSync(path,'utf8')==='# Recreation original\n'),'displaced canonical version survives external recreation');
  assert.equal(files.listLocalFiles(root,{query:'Late external writer'}).files.length,0,'private backups are not indexed as notes');


  write('visible-traversal.md','# Traversal title\n');
  write('scan-denied/duplicate.md','# Traversal title\n');
  const nativeOpenDir=fs.opendirSync;
  fs.opendirSync=(path,...args)=>{
    if(path===join(root,'scan-denied')) { const error=new Error('synthetic denied subtree'); error.code='EACCES'; throw error; }
    return nativeOpenDir(path,...args);
  };
  syncBuiltinESMExports();
  try {
    fails(()=>link('Traversal title'),'local-note-link-incomplete');
    assert.deepEqual(link('/visible-traversal.md'),{ref:'visible-traversal.md'});
  } finally { fs.opendirSync=nativeOpenDir; syncBuiltinESMExports(); }

  write('limit-match.md', '# Unique limit title\n');
  write(Array.from({ length:34 }, (_,i) => `nested-${i}`).join('/') + '/limit-match.md', '# Duplicate outside scan budget\n');
  fails(() => link('limit-match'), 'local-note-link-incomplete');
  assert.deepEqual(link('/limit-match.md'), { ref:'limit-match.md' });
  console.log('✓ local note edit: exact versions, explicit CAS, immutable metadata/markers/format, no-op, bounded UTF-8 and path/concurrency races');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(outside, { recursive: true, force: true });
}
