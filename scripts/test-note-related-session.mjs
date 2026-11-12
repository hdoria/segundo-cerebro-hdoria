import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import { createNoteRelatedSession } from '../console/ui/note-related-session.js';
let finish; const pending = new Promise(resolve => { finish = resolve; });
const changes=[];
const model=createNoteRelatedSession({ref:'one.md',loadBacklinks:()=>pending,loadAttachments:async()=>({attachments:[]}),onChange:s=>changes.push(s)});
assert.equal(model.getState().backlinks.phase,'idle');
const loading=model.load('backlinks'); assert.equal(model.getState().backlinks.phase,'loading');
assert.equal(await model.load('backlinks'),false,'duplicate loading is ignored');
model.dispose(); const count=changes.length; finish({files:[{ref:'stale.md'}],total:1});
assert.equal(await loading,false); assert.equal(changes.length,count,'late responses after selected note unmount cannot repaint');
let offset;const fresh=createNoteRelatedSession({ref:'one.md',loadBacklinks:async value=>{offset=value.offset;return {files:[{ref:value.offset?'second.md':'first.md'}],total:2,complete:false}},loadAttachments:async()=>{throw new Error('/private/internal/path')}});
assert.equal(await fresh.load('backlinks'),true); assert.equal(fresh.getState().backlinks.complete,false);
await fresh.load('backlinks',true);assert.equal(offset,1);assert.equal(fresh.getState().backlinks.files.length,2);
await fresh.load('attachments');assert.equal(fresh.getState().attachments.phase,'error');assert.doesNotMatch(JSON.stringify(fresh.getState()),/private|internal/);
fresh.dispose(); console.log('✓ related metadata is lazy, paginated, ephemeral and ignores disposed requests');

// Execute the production capture handler: a modal must not bypass dirty shortcut guards.
const app=readFileSync(new URL('../console/app.js',import.meta.url),'utf8');
const start=app.indexOf("document.addEventListener('keydown', event => {\n  if (event.key === 'Escape' && $('#breadcrumb-navigation')?.open)");
const end=app.indexOf("}, true);",start);
let handler,closed=0,toasts=0;
const doc={querySelector:s=>s.includes('note-attachment-dialog')?{}:null,addEventListener:(type,fn)=>{handler=fn}};
const source=app.slice(start,end+9);
for(const busy of [false,true]){
runInNewContext(source,{document:doc,$:()=>null,activeNoteWorkspace:()=>({getState:()=>({dirty:!busy,busy})}),toast:()=>{toasts++},closeDrawer:()=>{closed++}});
let stopped=false;handler({key:'k',metaKey:true,ctrlKey:false,preventDefault(){},stopImmediatePropagation(){stopped=true}});assert.equal(stopped,true,'attachment dialog retains dirty/busy palette shortcut protection');
handler({key:'Escape',preventDefault(){},stopImmediatePropagation(){}});assert.equal(closed,0,'Escape belongs to the attachment dialog');
}
assert.equal(toasts,2);
