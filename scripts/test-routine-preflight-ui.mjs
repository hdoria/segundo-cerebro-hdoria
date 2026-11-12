#!/usr/bin/env node
import assert from 'node:assert/strict';
import { routinePreflightMarkup } from '../console/ui/routine-preflight.js';
const esc = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const helpers={escapeHtml:esc,fmtDate:String,label:String};
const blocked=routinePreflightMarkup({preflight:{can_run:false,executor:{fresh:false},checks:[{id:'executor-session',status:'blocked',reason_code:'executor-observation-required'},{id:'collection:demo',source_ref:'<img src=x>',status:'warning',reason_code:'source-collection-not-verified'}]}},helpers);
assert.match(blocked,/Verificação da execução/); assert.match(blocked,/ainda não foi|não foi verificada/); assert.match(blocked,/coleta/); assert.doesNotMatch(blocked,/<img/);
const ready=routinePreflightMarkup({preflight:{can_run:true,executor:{fresh:true,status:'ready',observed_at:'2026-10-21T12:00:00Z'},checks:[{id:'prompt',status:'passed',reason_code:'prompt-readable'}]}},helpers);
assert.match(ready,/Requisitos conferidos/); assert.match(ready,/2026-10-21/); assert.match(ready,/instruções/i);
const destination=routinePreflightMarkup({preflight:{can_run:false,executor:{fresh:false},checks:[{id:'approval',status:'passed',reason_code:'routine-approved'},{id:'prompt',status:'passed',reason_code:'prompt-readable'},{id:'destination',status:'blocked',reason_code:'destination-not-private',destination_ref:'journal'}]}},helpers);
assert.match(destination,/<div class="preflight-blocker"><strong>Bloqueado em destino da entrega<\/strong><p>O destino <code>journal<\/code> é versionado no Git\./);
const order=[...destination.matchAll(/<li class="(\w+)">/g)].map(match=>match[1]);
assert.deepEqual(order,['blocked','passed','passed'],'blocked check is listed first');
const folder=routinePreflightMarkup({preflight:{can_run:false,executor:{},checks:[{id:'destination',status:'blocked',reason_code:'destination-is-directory',destination_ref:'<b>x</b>'}]}},helpers);
assert.match(folder,/O destino <code>&lt;b&gt;x&lt;\/b&gt;<\/code> é uma pasta\./);
console.log('✓ preflight UI distinguishes verified session, blockers and collection still to be observed');
