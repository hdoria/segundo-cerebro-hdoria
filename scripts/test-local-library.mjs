#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { listLocalFiles, readLocalFile } from './lib/local-file-browser.mjs';

const root=fs.mkdtempSync(join(fs.realpathSync(tmpdir()),'local-library-'));
const outside=fs.mkdtempSync(join(fs.realpathSync(tmpdir()),'local-library-outside-'));
function write(ref,text,time='2026-10-01T12:00:00.000Z') {
  const path=join(root,ref); fs.mkdirSync(dirname(path),{recursive:true}); fs.writeFileSync(path,text); fs.utimesSync(path,new Date(time),new Date(time)); return path;
}
const library=(params={})=>listLocalFiles(root,{mode:'library',...params});
const refs=result=>result.files.map(file=>file.ref);
try {
 write('.cerebro/layout.json',JSON.stringify({knowledgeRoot:'.',vault:{areas:'areas'}}));
 write('areas/area-alpha.md','---\ntype: Area\ntags: [scope]\n---\n# Alpha scope\n');
 write('areas/area-beta.md','---\ntype: Area\n---\n# Beta scope\n');
 write('projects/alpha.md','---\ntype: Project\ntags: [shared, alpha, shared]\nupdated: 2099-01-01\nbelongs_to: "[[Alpha scope]]"\n---\n# Alpha title\nBODY-ONLY-SECRET-SNIPPET\n','2026-10-10T12:00:00.000Z');
 write('projects/sub/beta.md','---\ntype: Reference\ntags:\n  - shared\n  - review\nrelated_to: "[[area-alpha]]"\n---\n# Beta title\n','2026-10-20T12:00:00.000Z');
 write('projects/zeta.md','---\ntype: Project\ntags: beta\nbelongs_to: "[[area-beta]]"\n---\n# Zeta title\n','2026-10-15T12:00:00.000Z');
 write('root.md','# Untyped note\n','2026-10-12T12:00:00.000Z');
 write('projects/loose.md','---\ntags: [loose]\n---\n# Loose title\n[[area-alpha]]\n','2026-10-20T12:00:00.000Z');
 write('private-only/note.md','---\nvisibility: private\ntype: HiddenType\ntags: [hidden-tag]\n---\n# Hidden title\n');
 for(const ref of ['.hidden.md','credentials.md','private/secret.md','.cerebro/internal.md']) write(ref,'---\ntype: HiddenType\ntags: [hidden-tag]\n---\n# Hidden title\n');
 write('projects/private.md','---\nvisibility: private\ntype: HiddenType\ntags: [hidden-tag]\n---\n# Hidden title\n');
 fs.writeFileSync(join(outside,'note.md'),'---\ntype: OutsideType\ntags: [outside-tag]\n---\n# Outside title\n');
 fs.symlinkSync(join(outside,'note.md'),join(root,'linked.md'));
 fs.symlinkSync(outside,join(root,'linked-folder'),'dir');
 fs.mkdirSync(join(root,'empty-folder'));
 const legacy=listLocalFiles(root);
 assert.deepEqual(refs(legacy),['root.md']);
 assert.ok(!('facets' in legacy) && !('complete' in legacy),'legacy response shape unchanged');
 assert.deepEqual(Object.keys(legacy.files[0]).sort(),['area_refs','ref','title','type','updated']);
 const all=library();
 assert.equal(all.total,7,'all allowed notes are recursively included by default');
 assert.equal(all.complete,true);
 assert.deepEqual(refs(all),['areas/area-alpha.md','projects/alpha.md','areas/area-beta.md','projects/sub/beta.md','projects/loose.md','root.md','projects/zeta.md']);
 assert.deepEqual(all.facets.types,[{value:'Area',count:2},{value:'Project',count:2},{value:'Reference',count:1}]);
 assert.deepEqual(all.facets.tags,[{value:'alpha',count:1},{value:'beta',count:1},{value:'loose',count:1},{value:'review',count:1},{value:'scope',count:1},{value:'shared',count:2}]);
 assert.deepEqual(all.facets.folders,[{ref:'areas',name:'areas',count:2},{ref:'projects',name:'projects',count:4},{ref:'projects/sub',name:'sub',count:1}]);
 assert.deepEqual(all.files.find(f=>f.ref==='projects/alpha.md').tags,['alpha','shared']);
 assert.equal(all.files.find(f=>f.ref==='projects/alpha.md').modified_at,'2026-10-10T12:00:00.000Z');
 assert.ok(!JSON.stringify(all).includes('BODY-ONLY-SECRET-SNIPPET'));
 for(const forbidden of ['HiddenType','hidden-tag','Hidden title','OutsideType','outside-tag','Outside title','private-only','empty-folder']) assert.ok(!JSON.stringify(all).includes(forbidden),forbidden);
 assert.deepEqual(refs(library({sort:'modified'})),['projects/sub/beta.md','projects/loose.md','projects/zeta.md','root.md','projects/alpha.md','areas/area-alpha.md','areas/area-beta.md'],'mtime desc, stable title/ref ties; frontmatter updated does not override');
 assert.deepEqual(refs(library({type:'project',tag:'SHARED'})),['projects/alpha.md']);
 assert.equal(library({query:'BODY-ONLY'}).total,0,'search is title only');
 assert.deepEqual(refs(library({directory:'projects'})),['projects/alpha.md','projects/sub/beta.md','projects/loose.md','projects/zeta.md']);
 assert.deepEqual(library({directory:'projects',type:'Project',query:'Alpha',tag:'shared'}).facets,all.facets,'facets precede folder/search/type/tag filters');
 const area=library({area:'Alpha scope'});
 assert.deepEqual(refs(area),['areas/area-alpha.md','projects/alpha.md','projects/sub/beta.md']);
 assert.deepEqual(area.facets.types,[{value:'Area',count:1},{value:'Project',count:1},{value:'Reference',count:1}]);
 assert.deepEqual(area.facets.tags,[{value:'alpha',count:1},{value:'review',count:1},{value:'scope',count:1},{value:'shared',count:2}]);
 assert.deepEqual(area.facets.folders,[{ref:'areas',name:'areas',count:1},{ref:'projects',name:'projects',count:2},{ref:'projects/sub',name:'sub',count:1}]);
 assert.deepEqual(library({area:'Alpha scope',type:'Project',tag:'shared',query:'Alpha',directory:'projects'}).facets,area.facets);
 assert.deepEqual(refs(library({offset:2,limit:2})),refs(all).slice(2,4));
 assert.equal(library({offset:100,limit:2}).total,7);
 assert.deepEqual(library({offset:100,limit:2}).files,[]);
 write('new.md','# Newest addition\n','2026-10-21T12:00:00.000Z');
 assert.equal(library({sort:'modified'}).files[0].ref,'new.md','no cached metadata');
 fs.utimesSync(join(root,'projects/alpha.md'),new Date('2026-10-22T00:00:00Z'),new Date('2026-10-22T00:00:00Z'));
 assert.equal(library({sort:'modified'}).files[0].ref,'projects/alpha.md','fresh actual mtime after external update');
 const read=readLocalFile(root,'projects/alpha.md');
 assert.ok(read.text.includes('BODY-ONLY-SECRET-SNIPPET'),'explicit reads remain available');
 for(const params of [{mode:'unknown'},{sort:'unknown'},{tag:'x'.repeat(201)},{tag:'bad\0tag'},{tag:[]},{sort:[]},{mode:[]}]) assert.throws(()=>listLocalFiles(root,params),/local-files-query-invalid/);
 for(const directory of ['private','linked-folder','../outside','.cerebro']) assert.throws(()=>library({directory}),/not-found/);
 write('quoted-tags.md',`---  \ntype: Reference # comment\ntags: ["sales, marketing", 'Client''s note', plain] # comment\n--- \n# Quoted metadata\n`);
 const quoted=library({query:'Quoted metadata'}).files[0];
 assert.equal(quoted.type,'Reference');
 assert.deepEqual(quoted.tags,["Client's note",'plain','sales, marketing']);
 assert.deepEqual(refs(library({tag:'sales, marketing'})),['quoted-tags.md']);
 // Scan budget must be visible instead of presenting partial counts as complete.
 write(Array.from({length:34},(_,i)=>`depth-${i}`).join('/')+'/unseen.md','# Unseen deep note\n');
 assert.equal(library().complete,false);
 assert.ok(!refs(library()).some(ref=>ref.endsWith('/unseen.md')));
 // Library remains scoped to the configured knowledge directory.
 write('.cerebro/layout.json',JSON.stringify({knowledgeRoot:'projects'}));
 const scoped=library();
 assert.equal(scoped.directory,'projects');
 assert.ok(scoped.files.every(file=>file.ref.startsWith('projects/')));
 assert.deepEqual(scoped.facets.folders,[{ref:'projects/sub',name:'sub',count:1}]);
 write('.cerebro/layout.json',JSON.stringify({knowledgeRoot:'absent'}));
 const unavailable=library();
 assert.equal(unavailable.available,false);
 assert.equal(unavailable.complete,true);
 assert.deepEqual(unavailable.facets,{types:[],tags:[],folders:[]});
 console.log('✓ library metadata: recursive scope, declared facets, title/tag/type filters, actual mtime, pagination, privacy, partial scan and legacy compatibility');
} finally { fs.rmSync(root,{recursive:true,force:true}); fs.rmSync(outside,{recursive:true,force:true}); }
