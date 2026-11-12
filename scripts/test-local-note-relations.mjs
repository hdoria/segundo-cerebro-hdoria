#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import * as api from './lib/local-file-browser.mjs';
import {createLocalNoteRelations} from './lib/local-note-relations.mjs';
const root=fs.mkdtempSync(join(fs.realpathSync(tmpdir()),'note-relations-'));
const outside=fs.mkdtempSync(join(fs.realpathSync(tmpdir()),'note-relations-outside-'));
function write(ref,text) {const path=join(root,ref); fs.mkdirSync(dirname(path),{recursive:true}); fs.writeFileSync(path,text); return path;}
const png=Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000b49444154789c636000020000050001a5f645400000000049454e44ae426082','hex');
const library=opts=>api.listLocalFiles(root,{mode:'library',...opts});
try {
 write('.cerebro/layout.json',JSON.stringify({knowledgeRoot:'kb'}));
 write('kb/target.md','# Destino\n');
 write('kb/source.md','---\ntype: Reference\ntags: [sales]\n---\n# Origem\nBusca ação comercial <b>real</b>.\n[[target|destino]] [Destino](target.md#section)\n![Figura](assets/picture.png) [PDF](assets/guide.pdf) ![[assets/wiki.gif]]\n');
 write('kb/hidden.md','---\nvisibility: private\n---\n# Oculta\nação [[target]] ![[assets/picture.png]]\n');
 write('kb/private/secret.md','# Privada\nação [[target]]\n');
 write('outside.md','# Fora\nação [[target]]\n');
 assert.equal(library({query:'acao'}).total,0);
 const found=library({query:'acao',search:'content'});
 assert.deepEqual(found.files.map(f=>f.ref),['kb/source.md']);
 assert.deepEqual(found.files[0].matches,['body']);
 assert.ok(found.files[0].snippet.includes('ação comercial'));
 assert.ok(found.files[0].snippet.length<=180 && !/<[^>]+>/.test(found.files[0].snippet));
 assert.ok(!('snippet' in library({search:'content'}).files[0]));
 assert.throws(()=>api.listLocalFiles(root,{query:'acao',search:'content'}),/local-files-query-invalid/);
 assert.throws(()=>library({search:'unknown'}),/local-files-query-invalid/);
 assert.deepEqual(library({query:'acao',search:'content',tag:'other'}).files,[]);
 write('kb/title.md','# Ação nova\nOutro corpo\n');
 assert.deepEqual(library({query:'acao',search:'content'}).files.find(f=>f.ref==='kb/title.md').matches,['title','body']);
 write('kb/false.md','# Falsos\n`[[target]]`\n```md\n[[target]]\n[Destino](target.md)\n```\n<!-- [[target]] [Destino](target.md) -->\n\\[[target]]\n');
 write('kb/ref.md','# Referência\n[link][dest]\n\n[dest]: target.md\n');
 let links=api.listLocalFileBacklinks(root,{ref:'kb/target.md',limit:1});
 assert.equal(links.complete,true); assert.equal(links.total,2); assert.equal(links.files.length,1);
 assert.deepEqual(api.listLocalFileBacklinks(root,{ref:'kb/target.md',offset:1,limit:1}).files.map(f=>f.ref),['kb/ref.md']);
 assert.ok(!JSON.stringify(links).includes('Busca ação'));
 write('kb/release.v1.md','# Release v1\n');
 write('kb/version-link.md','# Link de versão\n[[release.v1]]\n');
 assert.equal(api.listLocalFileBacklinks(root,{ref:'kb/release.v1.md'}).total,1);
 write('kb/nested-reference.md','# Definição aninhada\n[destino][nested]\n\n> [nested]: target.md\n');
 assert.ok(api.listLocalFileBacklinks(root,{ref:'kb/target.md'}).files.some(f=>f.ref==='kb/nested-reference.md'));
 write('kb/a/dup.md','# Duplicado A\n'); write('kb/b/dup.md','# Duplicado B\n');
 write('kb/ambiguous.md','# Ambígua\n[[dup]]\n');
 assert.equal(api.listLocalFileBacklinks(root,{ref:'kb/a/dup.md'}).total,0);

 // Backlinks must mean the same destination as the canonical note opener.
 write('kb/docs/linked.md','# Linked destination\n');
 write('kb/a/paths.md','# Path source\n[[docs/linked]]\n');
 assert.throws(()=>api.resolveLocalFileLink(root,{from_ref:'kb/a/paths.md',target:'docs/linked'}),/not-found/);
 assert.equal(api.listLocalFileBacklinks(root,{ref:'kb/docs/linked.md'}).files.some(f=>f.ref==='kb/a/paths.md'),false,'knowledge-root fallback cannot invent a backlink');
 for(const target of ['/docs/linked','kb/docs/linked','../docs/linked']) {
   write('kb/a/paths.md',`# Path source\n[[${target}]]\n`);
   assert.equal(api.resolveLocalFileLink(root,{from_ref:'kb/a/paths.md',target}).ref,'kb/docs/linked.md');
   assert.ok(api.listLocalFileBacklinks(root,{ref:'kb/docs/linked.md'}).files.some(f=>f.ref==='kb/a/paths.md'));
 }
 write('kb/a/duplicate.md','# Duplicate A\n'); write('kb/b/duplicate.md','# Duplicate B\n');
 write('kb/a/markdown-ambiguous.md','# Markdown ambiguity\n[ambiguous](duplicate.md)\n');
 assert.throws(()=>api.resolveLocalFileLink(root,{from_ref:'kb/a/markdown-ambiguous.md',target:'duplicate.md'}),/ambiguous/);
 for(const ref of ['kb/a/duplicate.md','kb/b/duplicate.md']) assert.equal(api.listLocalFileBacklinks(root,{ref}).files.some(f=>f.ref==='kb/a/markdown-ambiguous.md'),false,'Markdown basename does not bypass canonical ambiguity');
 // The reader adapter catches new per-link reads that would escape scan's byte budget.
 const syntheticContext={root:'/synthetic',knowledgePath:'/synthetic/kb',knowledgeRef:'kb'};
 const syntheticNotes=[
   {ref:'kb/requested.md',stem:'requested',title:'Requested',body:'# Requested'},
   {ref:'kb/large.md',stem:'large',title:'Large',body:'# Large\n'+'x'.repeat(500*1024)},
   {ref:'kb/repeated.md',stem:'repeated',title:'Repeated',body:'# Repeated\n'+'[large](large.md)\n'.repeat(1000)},
 ];
 let reads=0,scans=0;
 const synthetic=createLocalNoteRelations({context:()=>syntheticContext,note:(_ctx,ref)=>{reads++;return syntheticNotes.find(n=>n.ref===ref);},scan:()=>{scans++;return {notes:syntheticNotes,complete:true};},within:(base,path)=>path===base || path.startsWith(base+'/'),cleanRef:value=>value});
 assert.equal(synthetic.listBacklinks('/synthetic',{ref:'kb/requested.md'}).total,0);
 assert.equal(scans,1);
 assert.equal(reads,1,'1,000 links use the bounded scan snapshot, with only the requested note read separately');
 write('kb/assets/picture.png',png); write('kb/assets/guide.pdf',Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n')); write('kb/assets/wiki.gif',Buffer.from('GIF89a12345678'));
 const attachments=api.listLocalNoteAttachments(root,{from_ref:'kb/source.md'});
 assert.deepEqual(attachments.attachments.map(a=>a.target),['assets/picture.png','assets/guide.pdf','assets/wiki.gif']);
 assert.deepEqual(attachments.attachments.map(a=>a.mime),['image/png','application/pdf','image/gif']);
 assert.equal(attachments.attachments[0].bytes,png.length);
 assert.deepEqual(api.readLocalNoteAttachment(root,{from_ref:'kb/source.md',target:'assets/picture.png'}),{bytes:png,mime:'image/png',name:'picture.png'});
 write('kb/attachment-source.md','# Anexos\n![root](/assets/picture.png) ![[picture.png]] [ref][pdf]\n\n[pdf]: assets/guide.pdf\n');
 assert.equal(api.listLocalNoteAttachments(root,{from_ref:'kb/attachment-source.md'}).attachments.length,3);
 write('kb/a/picture.png',png);
 assert.equal(api.listLocalNoteAttachments(root,{from_ref:'kb/attachment-source.md'}).attachments.length,2,'ambiguous basename never grants access');
 const bad=['../outside.png','/../outside.png','private/picture.png','.hidden/picture.png','assets/forged.png','assets/vector.svg','assets/large.pdf','assets/link.png','assets/linkdir/picture.png','https://example.test/picture.png','assets/picture.png%00','assets/%2e%2e/%2e%2e/outside.png'];
 write('outside.png',png); write('kb/private/picture.png',png); write('kb/.hidden/picture.png',png); write('kb/assets/forged.png',Buffer.from('<html>bad</html>')); write('kb/assets/vector.svg','<svg/>'); write('kb/assets/large.pdf',Buffer.concat([Buffer.from('%PDF-1.7'),Buffer.alloc(20*1024*1024+1-8)]));
 fs.writeFileSync(join(outside,'picture.png'),png); fs.symlinkSync(join(outside,'picture.png'),join(root,'kb/assets/link.png')); fs.symlinkSync(outside,join(root,'kb/assets/linkdir'),'dir');
 write('kb/bad.md','# Ruins\n'+bad.map(target=>`[bad](${target})`).join('\n')+'\n`![code](assets/picture.png)`\n<!-- ![[assets/picture.png]] -->\n```md\n![[assets/picture.png]]\n```\n');
 assert.deepEqual(api.listLocalNoteAttachments(root,{from_ref:'kb/bad.md'}).attachments,[]);
 for(const target of [...bad,'assets/picture.png']) assert.throws(()=>api.readLocalNoteAttachment(root,{from_ref:'kb/bad.md',target}),/not-found/);
 assert.throws(()=>api.listLocalNoteAttachments(root,{from_ref:'kb/hidden.md'}),/not-found/);
 write('kb/assets/photo.jpg',Buffer.from('ffd8ffe000104a4649460001','hex'));
 write('kb/assets/photo.webp',Buffer.from('52494646140000005745425056503820','hex'));
 write('kb/assets/wrong.jpg',png);
 write('kb/formats.md','# Formatos\n![foto](assets/photo.jpg) ![webp](assets/photo.webp) ![falsa](assets/wrong.jpg)\n');
 assert.deepEqual(api.listLocalNoteAttachments(root,{from_ref:'kb/formats.md'}).attachments.map(a=>a.mime),['image/jpeg','image/webp']);
 assert.equal(api.readLocalNoteAttachment(root,{from_ref:'kb/formats.md',target:'assets/photo.webp'}).mime,'image/webp');
 assert.throws(()=>api.readLocalNoteAttachment(root,{from_ref:'kb/formats.md',target:'assets/wrong.jpg'}),/not-found/);
 write('kb/many.md','# Muitos\n'+Array.from({length:101},(_,i)=>`[same](assets/picture.png#${i})`).join('\n'));
 const bounded=api.listLocalNoteAttachments(root,{from_ref:'kb/many.md'});
 assert.equal(bounded.attachments.length,100); assert.equal(bounded.complete,false);
 write('kb/source.md','# Origem alterada\n');
 assert.throws(()=>api.readLocalNoteAttachment(root,{from_ref:'kb/source.md',target:'assets/picture.png'}),/not-found/);
 write(Array.from({length:34},(_,i)=>`kb/deep-${i}`).join('/')+'/note.md','# Profundo\n');
 assert.equal(library({search:'content',query:'acao'}).complete,false);
 assert.equal(api.listLocalFileBacklinks(root,{ref:'kb/target.md'}).complete,false);
 write('kb/incomplete.md','# Parcial\n![[photo.jpg]]\n');
 assert.equal(api.listLocalNoteAttachments(root,{from_ref:'kb/incomplete.md'}).complete,false,'basename resolution reports a partial traversal');
 assert.throws(()=>api.readLocalNoteAttachment(root,{from_ref:'kb/incomplete.md',target:'photo.jpg'}),/not-found/);
 console.log('✓ local search, backlinks and attachments: bounded public content, genuine links, ambiguous names, declaration revocation, binary protections');
} finally {fs.rmSync(root,{recursive:true,force:true}); fs.rmSync(outside,{recursive:true,force:true});}
