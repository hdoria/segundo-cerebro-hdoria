#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createLibrarySession } from '../console/ui/library-session.js';

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const file = (ref, text = `# ${ref}\n`) => ({ ref, title: ref, type: 'Note', text, bytes: Buffer.byteLength(text), sha256: 'a'.repeat(64) });
const index = (files = []) => ({ files, folders: [], total: files.length, offset: 0, limit: 50, complete: true, facets: { types: [{ value: 'Note', count: files.length }], tags: [], folders: [] } });
const edit = session => { session.startEditing(); const value = structuredClone(session.getState().value); value[0].children[0].text += ' changed'; session.change(value); };

{
  const snapshots = []; const requests = [];
  const controller = createLibrarySession({ loadFiles: async value => { requests.push(value); return index([{ ref: 'one.md', title: 'One' }]); }, readNote: async ref => file(ref), saveNote: async input => file(input.ref, input.text), resolveLink: async () => ({ ref: 'two.md' }), confirmDiscard: async () => true, onSnapshot: value => snapshots.push(value) });
  assert.equal(controller.getState().loading, true, 'the first painted frame represents the pending initial metadata load');
  await controller.refresh();
  assert.equal(requests[0].mode, 'library');
  assert.equal(requests[0].sort, 'title');
  await controller.openNote('one.md');
  const active = controller.getActiveNote();
  assert.equal(active.getState().file.ref, 'one.md');
  controller.setListScroll(173);
  edit(active);
  await active.save();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(controller.getActiveNote(), active, 'metadata refresh after Save never remounts the editor/session');
  assert.equal(active.getState().file.text, '# one.md changed\n');
  assert.equal(controller.getSnapshot().listScroll, 173);
  for (const snapshot of snapshots) assert.doesNotMatch(JSON.stringify(snapshot), /sha256|children|changed|"text"|document/, 'snapshots never include note bodies/drafts');
  const snapshot = controller.getSnapshot();
  controller.dispose();
  const restored = createLibrarySession({ loadFiles: async () => index(), readNote: async ref => file(ref), initialSnapshot: snapshot });
  assert.equal(restored.getSnapshot().selectedRef, 'one.md');
  assert.equal(restored.getSnapshot().listScroll, 173);
  await restored.restore();
  assert.equal(restored.getActiveNote().getState().file.ref, 'one.md');
  restored.dispose();
}

{
  const ask = deferred();
  const controller = createLibrarySession({ loadFiles: async () => index(), readNote: async ref => file(ref), confirmDiscard: () => ask.promise });
  await controller.openNote('one.md');
  const first = controller.getActiveNote(); edit(first);
  const changing = controller.setFilters({ type: 'Company' });
  edit(first); ask.resolve(true);
  assert.equal(await changing, false, 'a discard confirmation is tied to the exact draft revision');
  assert.equal(controller.getState().filters.type, '');
  assert.equal(controller.getActiveNote(), first);
  controller.dispose();
}

{
  const pending = deferred(); let loads = 0;
  const controller = createLibrarySession({ loadFiles: async () => index(), readNote: async ref => ++loads === 1 ? file(ref) : pending.promise, confirmDiscard: async () => true });
  await controller.openNote('one.md');
  const active = controller.getActiveNote();
  const opening = controller.openNote('two.md');
  await Promise.resolve(); await Promise.resolve();
  edit(active); pending.resolve(file('two.md'));
  assert.equal(await opening, false, 'typing after navigation started prevents an old response replacing the draft');
  assert.equal(controller.getActiveNote(), active);
  assert.equal(controller.getSnapshot().selectedRef, 'one.md');
  controller.dispose();
}

{
  let reads = 0;
  const controller = createLibrarySession({ loadFiles: async () => index(), readNote: async ref => { reads++; return file(ref); }, confirmDiscard: async () => true });
  await controller.openNote('one.md');
  const original = controller.getActiveNote();
  const opening = controller.openNote('two.md');
  edit(original);
  assert.equal(await opening, false, 'an initially clean note becoming dirty during the initial leave await is never authorized for discard');
  assert.equal(reads, 1, 'invalidated navigation is rejected before fetching another note');
  assert.equal(controller.getActiveNote(), original);
  controller.dispose();
}

{
  const slow = deferred();
  const controller = createLibrarySession({ loadFiles: async () => index(), readNote: ref => ref === 'slow.md' ? slow.promise : Promise.resolve(file(ref)) });
  const first = controller.openNote('slow.md');
  await Promise.resolve(); await Promise.resolve();
  await controller.openNote('new.md');
  slow.resolve(file('slow.md')); await first;
  assert.equal(controller.getActiveNote().getState().file.ref, 'new.md', 'late note reads never replace the newer selection');
  controller.dispose();
}

{
  const slow = deferred();
  const controller = createLibrarySession({ loadFiles: async () => index(), readNote: ref => ref === 'two.md' ? slow.promise : Promise.resolve(file(ref)) });
  await controller.openNote('one.md');
  const original = controller.getActiveNote();
  const opening = controller.openNote('two.md');
  await Promise.resolve(); await Promise.resolve();
  await controller.openNote('one.md');
  slow.resolve(file('two.md')); await opening;
  assert.equal(controller.getActiveNote(), original, 'reselecting the current note invalidates a pending different-note response');
  assert.equal(controller.getState().noteLoading, false);
  assert.equal(controller.getSnapshot().selectedRef, 'one.md');
  controller.dispose();
}

{
  const slow = deferred();
  const controller = createLibrarySession({ loadFiles: async () => index(), readNote: ref => ref === 'two.md' ? slow.promise : Promise.resolve(file(ref)) });
  await controller.openNote('one.md');
  const original = controller.getActiveNote();
  const opening = controller.openNote('two.md');
  await Promise.resolve(); await Promise.resolve();
  await controller.setFilters({ directory: '', type: '', tag: '', query: '', sort: 'title' });
  slow.resolve(file('two.md')); await opening;
  assert.equal(controller.getActiveNote(), original, 'reselecting the current collection invalidates a pending note read while retaining its session');
  assert.equal(controller.getSnapshot().panel, 'list');
  assert.equal(controller.getState().noteLoading, false);
  assert.equal(controller.getSnapshot().selectedRef, 'one.md');
  controller.dispose();
}

for (const panel of ['categories', 'list']) {
  const slow = deferred();
  const controller = createLibrarySession({ loadFiles: async () => index(), readNote: ref => ref === 'two.md' ? slow.promise : Promise.resolve(file(ref)) });
  await controller.openNote('one.md');
  const original = controller.getActiveNote();
  const opening = controller.openNote('two.md');
  await Promise.resolve(); await Promise.resolve();
  controller.setPanel(panel);
  slow.resolve(file('two.md')); await opening;
  assert.equal(controller.getActiveNote(), original, 'an explicit panel choice cancels an older pending note read');
  assert.equal(controller.getSnapshot().panel, panel);
  assert.equal(controller.getState().noteLoading, false);
  assert.equal(controller.getSnapshot().selectedRef, 'one.md');
  controller.dispose();
}

{
  const wiki = deferred();
  const controller = createLibrarySession({ loadFiles: async () => index(), readNote: async ref => file(ref), resolveLink: () => wiki.promise, confirmDiscard: async () => true });
  await controller.openNote('one.md');
  const active = controller.getActiveNote();
  const lookup = controller.followLink('Other#Heading');
  edit(active); wiki.resolve({ ref: 'two.md', anchor: 'Heading' });
  assert.equal(await lookup, false);
  assert.equal(controller.getActiveNote(), active, 'late wikilink lookup cannot discard a newer draft');
  controller.dispose();
}

{
  const pendingSave = deferred(); let confirmations = 0;
  const controller = createLibrarySession({ loadFiles: async () => index(), readNote: async ref => file(ref), saveNote: () => pendingSave.promise, confirmDiscard: async () => { confirmations++; return true; } });
  await controller.openNote('one.md');
  const active = controller.getActiveNote(); edit(active);
  const saving = active.save();
  assert.equal(await controller.setArea('another'), false);
  assert.equal(await controller.closeNote(), false);
  assert.equal(await controller.requestLeave(), false);
  assert.equal(confirmations, 0, 'Save blocks navigation without offering a misleading discard');
  pendingSave.resolve(file('one.md', '# Saved\n')); await saving;
  assert.equal(await controller.setArea('another'), true);
  assert.equal(controller.getActiveNote(), null);
  assert.equal(controller.getState().area, 'another');
  controller.dispose();
}

{
  const slow = deferred();
  const controller = createLibrarySession({ loadFiles: query => query.type === 'Person' ? slow.promise : Promise.resolve(index([{ ref: 'latest.md', title: 'Latest' }])), readNote: async ref => file(ref) });
  await controller.refresh();
  const pending = controller.setFilters({ type: 'Person' });
  await Promise.resolve(); await Promise.resolve();
  assert.equal(controller.getState().result.files.length, 0, 'a new category never displays clickable rows from the previous filter while loading');
  await controller.setFilters({ type: 'Company' });
  slow.resolve(index([{ ref: 'old.md', title: 'Old' }])); await pending;
  assert.equal(controller.getState().filters.type, 'Company');
  assert.equal(controller.getState().result.files[0].ref, 'latest.md', 'stale list responses do not enter newer filters');
  controller.dispose();
}

{
  const controller = createLibrarySession({ loadFiles: async () => index(), readNote: async ref => file(ref), confirmDiscard: async () => false });
  await controller.openNote('one.md'); edit(controller.getActiveNote());
  assert.equal(await controller.closeNote(), false);
  assert.equal(await controller.closeNote({ force: true }), true);
  assert.equal(controller.getActiveNote(), null);
  controller.dispose();
}

{
  const pending = deferred(); let listCalls = 0, reads = 0;
  const controller = createLibrarySession({ loadFiles: () => ++listCalls === 1 ? pending.promise : Promise.resolve(index()), readNote: async ref => { reads++; return file(ref); }, initialSnapshot: { selectedRef: 'old.md' } });
  const restoring = controller.restore();
  await controller.setFilters({ type: 'Company' });
  pending.resolve(index()); await restoring;
  assert.equal(reads, 0, 'snapshot restoration cannot reopen an old note after a newer category choice');
  assert.equal(controller.getActiveNote(), null);
  controller.dispose();
}

for (const oldArea of ['', 'previous-area']) {
  const controller = createLibrarySession({ area: 'current-area', initialSnapshot: { area: oldArea, selectedRef: 'old.md', panel: 'note' }, loadFiles: async () => index(), readNote: async ref => file(ref) });
  assert.equal(controller.getSnapshot().selectedRef, '', 'global or different-area snapshots never restore a note into a scoped area');
  assert.equal(controller.getSnapshot().panel, 'list', 'mobile cannot restore an empty reader with no back control');
  controller.dispose();
}
{
  const controller = createLibrarySession({ initialSnapshot: { selectedRef: 'deleted.md', panel: 'note' }, loadFiles: async () => index(), readNote: async () => { throw new Error('not-found'); } });
  await controller.restore();
  assert.equal(controller.getSnapshot().selectedRef, '');
  assert.equal(controller.getSnapshot().panel, 'list', 'a deleted restored selection falls back to the usable list on mobile');
  assert.equal(controller.getState().noteError, 'not-found', 'the reason remains available in the visible list');
  controller.dispose();
}
console.log('✓ library session: metadata-only snapshots, preserved editor saves, revision-sensitive guards, busy exits and stale note/wiki/filter responses');
