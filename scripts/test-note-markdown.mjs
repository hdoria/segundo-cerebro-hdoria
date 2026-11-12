import assert from 'node:assert/strict';
import { createNoteDocument, serializeNoteDocument, createNotePlugins } from '../console/ui/note-markdown.js';
import { createSlateEditor } from 'platejs';

const clone = (v) => structuredClone(v);
function edit(value, from, to) {
  const copy = clone(value);
  let found = false;
  const walk = (nodes) => nodes.forEach((n) => {
    if (typeof n.text === 'string' && n.text.includes(from)) { n.text = n.text.replace(from, to); found = true; }
    if (n.children) walk(n.children);
  });
  walk(copy); assert.ok(found, `missing editable text ${from}`); return copy;
}
const original = '\uFEFF---\r\ntype: Note\r\ntags: [one, two]\r\nrelated_to: "[[Example]]"\r\n---\r\n\r\n# Demo\r\n\r\nManual original with **strong** text.\r\n\r\n<!-- ai:start -->\r\n\r\nAI original.\r\n\r\n<!-- ai:end -->\r\n';
const d = createNoteDocument(original);
assert.equal(d.editable, true);
assert.ok(Array.isArray(d.properties));
assert.equal(d.properties.find(p => p.key === 'type').value, 'Note');
assert.equal(d.value[0].type, 'h1');
assert.equal(serializeNoteDocument(d, clone(d.value)), original, 'untouched bytes must be exact');
const changed = serializeNoteDocument(d, edit(d.value, 'Manual original', 'Manual edited'));
assert.equal(changed, original.replace('Manual original', 'Manual edited'), 'only edited block is rewritten; BOM/YAML/CRLF/comments preserved');

const wiki = '# Links\n\nSee [[Delta Academy#Equipe|a equipe]] and [[Pessoal]].\n\nFinal paragraph.\n';
const w = createNoteDocument(wiki);
assert.equal(w.editable, true);
const tokens = w.value.flatMap(n => n.children || []).filter(n => n.type === 'note_wikilink');
assert.deepEqual(tokens.map(n => n.target), ['Delta Academy#Equipe', 'Pessoal']);
assert.ok(serializeNoteDocument(w, edit(w.value, 'See ', 'Open ')).includes('Open [[Delta Academy#Equipe|a equipe]] and [[Pessoal]].'));

const structures = '# Structures\n\n- Parent\n  - Child\n- [x] Done\n\n| Key | Value |\n| --- | --- |\n| A | B |\n\n```js\nconst x = 1;\n```\n\n> Quoted\n\nAfter.\n';
const s = createNoteDocument(structures);
assert.equal(s.editable, true);
assert.equal(serializeNoteDocument(s, clone(s.value)), structures);
const bodyChanged = serializeNoteDocument(s, edit(s.value, 'After.', 'After edited.'));
assert.equal(bodyChanged, structures.replace('After.', 'After edited.'));
const tableChanged = serializeNoteDocument(s, edit(s.value, 'B', 'C'));
assert.match(tableChanged, /\| A +\| C +\|/);
assert.ok(tableChanged.includes('  - Child'), 'unchanged nested list exact');
const codeChanged = serializeNoteDocument(s, edit(s.value, 'const x = 1;', 'const x = 2;'));
assert.ok(codeChanged.includes('```js\nconst x = 2;\n```'));
const listChanged = serializeNoteDocument(s, edit(s.value, 'Child', 'Descendant'));
assert.ok(listChanged.includes('Descendant'));
assert.ok(listChanged.includes('- [x] Done'));

for (const fragment of [
 '<script>alert("unsafe")</script>',
 '<img src="https://example.invalid/private.png">',
 '![private image](https://example.invalid/private.png)',
 'A note[^1].\n\n[^1]: Footnote.',
 '[reference][target]\n\n[target]: https://example.invalid',
]) {
 const text = '# Before\n\n'+ fragment +'\n\nEditable paragraph.\n';
 const doc = createNoteDocument(text);
 assert.equal(serializeNoteDocument(doc, clone(doc.value)), text);
 if (doc.editable) {
  const updated = serializeNoteDocument(doc, edit(doc.value, 'Editable paragraph.', 'Edited paragraph.'));
  assert.equal(updated, text.replace('Editable paragraph.', 'Edited paragraph.'), fragment);
 }
 assert.ok(!JSON.stringify(doc.value).includes('"type":"img"'), 'no fetching image plugin');
}
for (const bad of ['---\ntype: [broken\n---\nBody', '---\ntype: Note\nBody', '<!-- ai:start -->\nbody', '<!-- ai:end -->\nbody', '<!-- ai:start -->\n<!-- ai:start -->\n<!-- ai:end -->']) {
 const doc = createNoteDocument(bad);
 assert.equal(doc.editable, false, `must refuse unsafe structure: ${bad}`);
 assert.equal(serializeNoteDocument(doc, clone(doc.value)), bad, 'read-only no-op remains exact');
 assert.throws(() => serializeNoteDocument(doc, [{type:'p',children:[{text:'changed'}]}]), /note-markdown/);
}
const unsafe = clone(d.value); unsafe.push({type:'unknown_widget',children:[{text:'x'}]});
assert.throws(() => serializeNoteDocument(d, unsafe), /note-markdown-unsupported/);
const commentRemoved = d.value.filter(n => n.type !== 'note_raw');
assert.throws(() => serializeNoteDocument(d, commentRemoved), /note-markdown-protected/);
const editor = createSlateEditor({plugins:createNotePlugins(),value:clone(w.value)});
assert.ok(editor.api.markdown, 'real Plate Markdown API');
assert.equal(editor.api.isInline(tokens[0]), true);
assert.equal(editor.api.isVoid(tokens[0]), true);
console.log('note markdown adapter: exact round trips, safe edits, real Plate and protected structures passed');

const freshWiki = createNoteDocument('Text.\n');
const freshWikiValue = [{...freshWiki.value[0],children:[{text:'Text with [[New page|label]].'}]}];
assert.ok(serializeNoteDocument(freshWiki,freshWikiValue).includes('[[New page|label]]'));

const aligned = createNoteDocument('| Key | Value |\n| :--- | ---: |\n| A | B |\n');
const alignedChanged = serializeNoteDocument(aligned,edit(aligned.value,'B','C'));
assert.match(alignedChanged, /\| :-+ *\| -+: *\|/, 'edited tables retain alignment');
const titled = createNoteDocument('See [source](https://example.invalid "A title") and edit me.\n');
assert.ok(serializeNoteDocument(titled,edit(titled.value,'edit me','edited')).includes('"A title"'), 'link title is not lost');
const blockMeta = createNoteDocument('```js filename="x"\ncode\n```\n\nEditable.\n');
assert.equal(serializeNoteDocument(blockMeta,edit(blockMeta.value,'Editable.','Edited.')),'```js filename="x"\ncode\n```\n\nEdited.\n');

const escaped = createNoteDocument('Literal \\[\\[Example]] and editable text.\n');
assert.ok(!JSON.stringify(escaped.value).includes('note_wikilink'), 'escaped wiki brackets remain literal');
assert.ok(serializeNoteDocument(escaped,edit(escaped.value,'editable text','edited text')).includes('\\[\\[Example]]'));
const inlineCode = createNoteDocument('Code `[[Literal]]` and [[Linked]].\n');
assert.equal(inlineCode.value[0].children.filter(n=>n.type==='note_wikilink').length,1);
const escapedUrl = createNoteDocument('[title](https://example.invalid "t")\n\nRaw <b>HTML</b>.\n');
assert.ok(escapedUrl.value.some(n=>n.type==='note_raw'));
const originalView = createNoteDocument('[[A]][[B]]\n');
const normalizedView = createSlateEditor({plugins:createNotePlugins(),value:copyValue(originalView.value)});
function copyValue(value) { return structuredClone(value); }
normalizedView.tf.normalize({force:true});
assert.equal(serializeNoteDocument(originalView,normalizedView.children),'[[A]][[B]]\n','Slate normalization does not dirty notes');

for(const text of ['Bold **[[Page|label]]** and edit me.\n','- [ ] Task\n- [x] Done\n','A  \nB\n']) {
 const doc=createNoteDocument(text);
 const normalized=createSlateEditor({plugins:createNotePlugins(),value:structuredClone(doc.value)});
 normalized.tf.normalize({force:true});
 assert.equal(serializeNoteDocument(doc,normalized.children),text,'normalized opening must not rewrite '+text);
}
const boldWiki=createNoteDocument('Bold **[[Page|label]]** and edit me.\n');
assert.ok(serializeNoteDocument(boldWiki,edit(boldWiki.value,'edit me','edited')).includes('**[[Page|label]]**'));
const spacedFm='---  \ntype: Note\n--- \n\nEditable.\n';
const spacedDoc=createNoteDocument(spacedFm);
assert.equal(spacedDoc.editable,true);
assert.equal(spacedDoc.properties[0].value,'Note');
assert.equal(serializeNoteDocument(spacedDoc,edit(spacedDoc.value,'Editable.','Edited.')),spacedFm.replace('Editable.','Edited.'));
const parityDoc=createNoteDocument('Slash \\\\[[Page]] and edit me.\n');
assert.equal(parityDoc.value[0].children.filter(n=>n.type==='note_wikilink').length,1,'even escaped slash leaves active wiki');
assert.ok(serializeNoteDocument(parityDoc,edit(parityDoc.value,'edit me','edited')).includes('[[Page]]'));
