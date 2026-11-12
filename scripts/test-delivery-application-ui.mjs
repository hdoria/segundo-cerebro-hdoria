#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createDeliveryApplicationController, deliveryApplicationMarkup } from '../console/ui/delivery-application.js';
const escapeHtml = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function setup(){
  const events=[]; let selected='receipt-demo'; let confirmation;
  const deps={
    selectedReceipt:()=>selected, isBusy:()=>false, setBusy:value=>events.push(['busy',value]),
    mutate:async(path,payload)=>{events.push(['request',path,payload]);return{plan_digest:'a'.repeat(64),previewed_at:'2026-10-21T12:00:00Z',target_date:payload.target_date,target_ref:'journal/2026-10-21.md',diff:'safe diff',after:'safe report'};},
    askConfirm:async config=>{confirmation=config;return{approvedBy:'role-founder'};},
    paint:slot=>events.push(['paint',slot?.receiptId]), toast:message=>events.push(['toast',message]),
    refresh:async()=>events.push(['refresh']), label:value=>value,
  };
  const controller=createDeliveryApplicationController(deps);
  controller.open('receipt-demo',{eligible:true,suggested_date:'2026-10-21',state:{status:'not-applied'}});
  return{controller,deps,events,setSelected:value=>{selected=value;},confirmation:()=>confirmation};
}
const valid=setup();
await valid.controller.perform('apply');
assert.equal(valid.events.some(e=>e[0]==='request'),false,'no apply without an exact preview');
await valid.controller.perform('preview');
assert(valid.controller.get().preview);
valid.controller.setField('target_date','2026-10-22');
assert.equal(valid.controller.get().preview,null,'changing the destination invalidates the reviewed preview');
const changed=setup(); await changed.controller.perform('preview');
const previous=changed.controller.get(); changed.controller.open('receipt-other',{eligible:true,suggested_date:'2026-10-21',state:{status:'not-applied'}});changed.setSelected('receipt-other');
assert.notEqual(changed.controller.get(),previous);
const escaped=deliveryApplicationMarkup({receiptId:'receipt-demo',meta:{eligible:true,state:{status:'not-applied'}},target_date:'2026-10-21',approved_by:'role-founder',preview:{target_ref:'journal/demo.md',diff:'<img src=x onerror=alert(1)>',after:'<script>bad</script>'}}, {escapeHtml,renderReviewMarkdown:escapeHtml,fmtDate:String,label:String});
assert.doesNotMatch(escaped,/class="drawer-actions"/,"inline application controls must not inherit the fixed drawer footer");
assert.doesNotMatch(escaped,/<img|<script/); assert.match(escaped,/&lt;img/);
const applied=setup();await applied.controller.perform('preview');await applied.controller.perform('apply');
assert(applied.events.some(e=>e[0]==='request'&&e[1].endsWith('/apply')));
assert.match(applied.confirmation().body,/diário|nota/);
assert(applied.events.some(e=>e[0]==='refresh'));
const changedDuringConfirm=setup(); await changedDuringConfirm.controller.perform('preview');
changedDuringConfirm.deps.askConfirm=async()=>{changedDuringConfirm.controller.setField('target_date','2026-10-22');return{approvedBy:'role-founder'};};
await changedDuringConfirm.controller.perform('apply');
assert.equal(changedDuringConfirm.events.filter(e=>e[0]==='request').length,1,'edited destination cannot retain an earlier confirmation');
const slow=setup(); let release;
slow.deps.mutate=()=>new Promise(resolve=>{release=resolve;});
const pending=slow.controller.perform('preview');
slow.setSelected('receipt-other');slow.controller.open('receipt-other',{eligible:true,suggested_date:'2026-10-22',state:{status:'not-applied'}});
release({plan_digest:'old',target_ref:'journal/old.md',diff:'old'});await pending;
assert.equal(slow.controller.get().receiptId,'receipt-other');assert.equal(slow.controller.get().preview,null,'late previews cannot migrate to another drawer');
const slowApply=setup();await slowApply.controller.perform('preview');let releaseApply;
slowApply.deps.mutate=()=>new Promise(resolve=>{releaseApply=resolve;});
const applying=slowApply.controller.perform('apply');await Promise.resolve();
slowApply.setSelected('receipt-other');slowApply.controller.open('receipt-other',{eligible:true,state:{status:'not-applied'}});
releaseApply({status:'applied'});await applying;
assert.equal(slowApply.events.some(e=>e[0]==='refresh'),false,'late apply response cannot reopen a different delivery');
const interrupted=setup(); await interrupted.controller.perform('preview');
interrupted.deps.mutate=async()=>{throw new Error('delivery-application-recovery-required');};
interrupted.deps.readState=async()=>({eligible:false,state:{status:'not-applied',recovery_required:true}});
await interrupted.controller.perform('apply');
const recoveredMarkup=deliveryApplicationMarkup(interrupted.controller.get(),{escapeHtml,renderReviewMarkdown:escapeHtml,fmtDate:String,label:String});
assert.match(recoveredMarkup,/data-delivery-action="recover"/);assert.doesNotMatch(recoveredMarkup,/data-delivery-action="preview"/);
console.log('✓ journal application UI requires exact preview, invalidates changed inputs and escapes diff content');
