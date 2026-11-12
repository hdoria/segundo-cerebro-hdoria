#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createNoteSession } from '../console/ui/note-session.js';
function setup(){let writes=[];let change;let confirm=async()=>true;const file={ref:'notes/demo.md',text:'original',sha256:'a'.repeat(64)};
 const deps={file,parse:text=>({value:[{text}],editable:true}),serialize:(_doc,value)=>value[0].text,
 save:async payload=>{writes.push(payload);return{...file,text:payload.text,sha256:'b'.repeat(64)};},confirmDiscard:()=>confirm(),onChange:state=>{change=state;}};
 const session=createNoteSession(deps);
 return{session,deps,writes,get state(){return change||session.getState();},confirm:fn=>{confirm=fn;}};}
const noEdit=setup();noEdit.session.startEditing();await noEdit.session.save();assert.equal(noEdit.writes.length,0);assert.equal(noEdit.session.getState().editing,false);
const edited=setup();edited.session.startEditing();edited.session.change([{text:'updated'}]);assert.equal(edited.session.getState().dirty,true);await edited.session.save();assert.equal(edited.writes[0].expected_sha256,'a'.repeat(64));assert.equal(edited.session.getState().dirty,false);assert.equal(edited.session.getState().file.text,'updated');
const cancelled=setup();cancelled.session.startEditing();cancelled.session.change([{text:'draft'}]);cancelled.confirm(async()=>false);assert.equal(await cancelled.session.requestLeave(),false);assert.equal(cancelled.session.getState().value[0].text,'draft');cancelled.confirm(async()=>true);await cancelled.session.cancel();assert.equal(cancelled.session.getState().value[0].text,'original');
const conflict=setup();conflict.session.startEditing();conflict.session.change([{text:'draft'}]);conflict.deps.save=async()=>{throw Error('local-note-conflict');};await conflict.session.save();assert.equal(conflict.session.getState().dirty,true);assert.equal(conflict.session.getState().error,'local-note-conflict');assert.equal(conflict.session.getState().value[0].text,'draft');
const slow=setup();slow.session.startEditing();slow.session.change([{text:'slow'}]);let resolve;slow.deps.save=()=>new Promise(r=>{resolve=r;});const saving=slow.session.save();assert.equal(await slow.session.requestLeave(),false,'no leaving an in-flight save');slow.session.dispose();resolve({ref:'notes/demo.md',text:'slow',sha256:'b'.repeat(64)});await saving;assert.equal(slow.session.getState().file.text,'original','late save response cannot update a disposed workspace');
const pending=setup();pending.session.startEditing();pending.session.change([{text:'first'}]);let approve;pending.confirm(()=>new Promise(r=>{approve=r;}));const leaving=pending.session.requestLeave();pending.session.change([{text:'newer'}]);approve(true);assert.equal(await leaving,false,'a prior discard confirmation cannot discard a newer draft');
console.log('✓ note sessions preserve drafts on conflict, require discard consent, avoid no-op writes and reject stale responses');
