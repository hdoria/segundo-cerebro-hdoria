import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const app=readFileSync(new URL('../console/app.js',import.meta.url),'utf8');
const start=app.indexOf('function activeNoteWorkspace(');
assert.notEqual(start,-1,'library host needs one shared source for the active draft');
const end=app.indexOf('function metricPeriod(',start);
function fixture(){
  const state={view:'files',operatingAreaFilter:'',library:{controller:null,snapshot:null,request:0,loading:false,area:''},noteWorkspace:null};
  const host={isConnected:true};let mounts=0,disposes=0,options;const pending=[];
  const controller={getActiveNote:()=>({id:'draft'}),getSnapshot:()=>({type:'Person',listScroll:65}),dispose:()=>disposes++,setArea:async()=>true,refresh:async()=>true};
  const context={state,$:()=>host,loadLibraryWorkspace:()=>new Promise(resolve=>pending.push(resolve)),getJson:async()=>({}),mutate:async()=>({}),askConfirmation:async()=>true,toast(){},renderMarkup(){},empty:()=>'',URLSearchParams};
  const api=runInNewContext(app.slice(start,end)+'\n({activeNoteWorkspace,mountLibraryView,disposeLibraryView})',context);
  const finish=()=>pending.shift()({mountLibraryWorkspace:(h,o)=>{assert.equal(h,host);mounts++;options=o;return controller;}});
  return {state,host,api,finish,controller,pending,get mounts(){return mounts},get disposes(){return disposes},get options(){return options}};
}
{
  const f=fixture(), first=f.api.mountLibraryView(); assert.equal(f.pending.length,1);
  await f.api.mountLibraryView(); assert.equal(f.pending.length,1,'a rerender does not queue a duplicate mount');
  f.finish(); await first; assert.equal(f.mounts,1); assert.equal(f.api.activeNoteWorkspace().id,'draft');
  await f.api.mountLibraryView(); assert.equal(f.mounts,1,'the same mounted library retains its note and draft');
  f.api.disposeLibraryView(); assert.equal(f.disposes,1); assert.equal(f.state.library.snapshot.type,'Person');assert.equal(f.state.library.snapshot.listScroll,65);
}
{
  const f=fixture(), first=f.api.mountLibraryView();f.state.view='today';f.api.disposeLibraryView();f.finish();await first;assert.equal(f.mounts,0,'a late bundle cannot mount after leaving the library');
}
{
  const f=fixture(), first=f.api.mountLibraryView(); f.state.operatingAreaFilter='new-area'; f.finish();await first;assert.equal(f.options.area,'new-area','the lazy bundle opens in the current area instead of its earlier context');
}
console.log('✓ library host preserves mounted drafts/snapshots and rejects stale or duplicate mounts');
