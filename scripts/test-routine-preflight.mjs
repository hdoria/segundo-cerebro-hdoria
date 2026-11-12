#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { registerRoutineContract, saveCollectorBinding, saveExecutorBinding } from './lib/routine-protocol.mjs';
import { inspectRoutinePreflight, verifyRoutinePreflight } from './lib/routine-preflight.mjs';
import { registerAccessGrant } from './lib/access-runtime.mjs';
import { readExecutionTrace } from './lib/execution-trace-runtime.mjs';
import { runRoutine } from './lib/routine-runtime.mjs';
const root = mkdtempSync(join(tmpdir(), 'fictional-preflight-'));
const example = name => JSON.parse(readFileSync(new URL(`../protocol/examples/${name}.v1.json`, import.meta.url)));
const write = (ref, value) => { const path = join(root, ref); mkdirSync(dirname(path), {recursive:true}); writeFileSync(path, typeof value === 'string' ? value : JSON.stringify(value)); };
const now = new Date('2026-10-21T12:00:00Z');
const routine = {...example('routine-contract'), routine_id:'fictional-preflight', context:{prompt_ref:'prompts/report.md',access_requests:[]}, destination:{kind:'runtime-output',ref:'routine-output'}};
const binding = example('executor-binding');
try {
  write('.cerebro/layout.json', {version:3}); write('.cerebro/private-ignore.manifest','.cerebro/runtime\n'); write('prompts/report.md','Produce a fictional report.');
  registerRoutineContract(root,routine); saveExecutorBinding(root,binding);
  const before = readdirSync(join(root,'.cerebro/runtime'),{recursive:true});
  const unread = inspectRoutinePreflight(root,routine.routine_id,{now});
  assert.equal(unread.can_run,false); assert.equal(unread.reason_code,'executor-observation-required');
  assert.deepEqual(readdirSync(join(root,'.cerebro/runtime'),{recursive:true}),before,'inspect must not write');
  let observations=0;
  const executorObserver = (_adapter, options) => { observations++; return {status:'ready',observed_at:options.now.toISOString(),stdout:'PRIVATE_AUTH_RESPONSE'}; };
  const verified = await verifyRoutinePreflight(root,routine.routine_id,{clock:()=>now,executorObserver});
  assert.equal(verified.can_run,true); assert.equal(observations,1);
  assert.equal(inspectRoutinePreflight(root,routine.routine_id,{now}).can_run,true);
  const files=readdirSync(join(root,'.cerebro/runtime/executor-observations'));
  assert.equal(files.length,1); assert.equal(readFileSync(join(root,'.cerebro/runtime/executor-observations',files[0]),'utf8').includes('PRIVATE_AUTH_RESPONSE'),false);
  assert.equal(inspectRoutinePreflight(root,routine.routine_id,{now:new Date(now.getTime()+16*60_000)}).reason_code,'executor-observation-stale');
  const changed=structuredClone(routine); changed.version='1.0.1'; write('.cerebro/contracts/routines/fictional-preflight.json',changed);
  assert.equal(inspectRoutinePreflight(root,routine.routine_id,{now}).reason_code,'executor-observation-required','new contract version invalidates old observation');
  write('.cerebro/contracts/routines/fictional-preflight.json',routine);
  write('prompts/report.md',' ');
  assert(inspectRoutinePreflight(root,routine.routine_id,{now}).blocking_reason_codes.includes('prompt-empty'));
  let modelCalls=0;
  const denied = await runRoutine(root,routine.routine_id,{clock:()=>now,executorObserver,spawn:()=>{modelCalls++;throw Error('must not run');}});
  assert.equal(denied.receipt.reason_code,'prompt-empty'); assert.equal(modelCalls,0); assert.equal(observations,1,'invalid local prompt must block before client observation');
  write('prompts/report.md','Produce a fictional report.');
  const expiredSession = await runRoutine(root,routine.routine_id,{clock:()=>now,executorObserver:(_adapter,options)=>({status:'authentication-required',observed_at:options.now.toISOString()}),spawn:()=>{modelCalls++;}});
  assert.equal(expiredSession.receipt.reason_code,'executor-authentication-required'); assert.equal(modelCalls,0,'cached ready state cannot bypass live auth gate');
  write('prompts/report.md','Produce a fictional report.');
  const destinationCheck = () => inspectRoutinePreflight(root,routine.routine_id,{now}).checks.find(check=>check.id==='destination');
  mkdirSync(join(root,'journal'),{recursive:true});
  write('.cerebro/contracts/routines/fictional-preflight.json',{...routine,destination:{kind:'local-file',ref:'journal'}});
  assert.deepEqual(destinationCheck(),{id:'destination',status:'blocked',reason_code:'destination-not-private',destination_ref:'journal'},'versioned folder is reported as not private');
  write('.cerebro/private-ignore.manifest','.cerebro/runtime\njournal\n');
  assert.deepEqual(destinationCheck(),{id:'destination',status:'blocked',reason_code:'destination-is-directory',destination_ref:'journal'},'private folder is reported as a folder, not as not private');
  write('.cerebro/private-ignore.manifest','.cerebro/runtime\n');
  write('.cerebro/contracts/routines/fictional-preflight.json',routine);
  const linkedPrompt = join(root,'prompts/linked.md');
  try {
    const {symlinkSync}=await import('node:fs'); symlinkSync(join(root,'prompts/report.md'),linkedPrompt,'file');
    const unsafe=structuredClone(routine); unsafe.context.prompt_ref='prompts/linked.md'; write('.cerebro/contracts/routines/fictional-preflight.json',unsafe);
    assert(inspectRoutinePreflight(root,routine.routine_id,{now}).blocking_reason_codes.includes('prompt-read-failed'),'symlink prompts cannot make private external contents eligible');
  } catch(error) { if(process.platform!=='win32'||!['EPERM','EACCES'].includes(error.code)) throw error; }
  write('.cerebro/contracts/routines/fictional-preflight.json',routine);
  const grant=example('access-grant'); grant.grant_id='grant-funnel-local-read'; grant.assurance='receipt-audited'; grant.custody='agent-direct'; grant.credential_ref=null; grant.expires_at=null; registerAccessGrant(root,grant);
  const sourced=structuredClone(routine); sourced.context.access_requests=example('routine-contract').context.access_requests;
  write('.cerebro/contracts/routines/fictional-preflight.json',sourced);
  const grantRef='.cerebro/contracts/access-grants/grant-funnel-local-read.json'; const grantBefore=readFileSync(join(root,grantRef),'utf8');
  const accessView=inspectRoutinePreflight(root,routine.routine_id,{now});
  assert(accessView.checks.some(item=>item.reason_code==='access-authorized'&&item.status==='passed'));
  assert(accessView.checks.some(item=>item.reason_code==='source-collection-not-verified'&&item.status==='warning'));
  assert.equal(readFileSync(join(root,grantRef),'utf8'),grantBefore,'inspection cannot append use receipts');
  grant.expires_at='2026-08-24T00:00:00Z'; write(grantRef,grant);
  assert(inspectRoutinePreflight(root,routine.routine_id,{now}).blocking_reason_codes.includes('grant-expired'));
  write('.cerebro/contracts/routines/fictional-preflight.json',routine);
  const collector=example('collector-binding'); saveCollectorBinding(root,collector);
  const collected=structuredClone(routine); collected.extensions={preparation:{kind:'trusted-local-command',binding_ref:collector.binding_id,output_ref:collector.output_ref}};
  write('.cerebro/contracts/routines/fictional-preflight.json',collected);
  assert(inspectRoutinePreflight(root,routine.routine_id,{now}).blocking_reason_codes.includes('collector-script-unavailable'));
  write('.automacao/funil_diario.py','# fictional collector script');
  assert.equal(inspectRoutinePreflight(root,routine.routine_id,{now}).blocking_reason_codes.includes('collector-script-unavailable'),false);
  collected.extensions.preparation.source_selections=[{source_ref:'unknown-fictional-source',selected_pointers:['/records'],freshness_pointer:null}];
  write('.cerebro/contracts/routines/fictional-preflight.json',collected);
  assert(inspectRoutinePreflight(root,routine.routine_id,{now}).blocking_reason_codes.includes('context-system-contract-invalid'));
  write('.cerebro/contracts/routines/fictional-preflight.json',routine);
  try {
    const {symlinkSync,unlinkSync}=await import('node:fs');
    const cached=join(root,'.cerebro/runtime/executor-observations',files[0]); unlinkSync(cached); symlinkSync(join(root,'prompts/report.md'),cached,'file');
    const contentBefore=readFileSync(join(root,'prompts/report.md'),'utf8');
    const blockedCache=await verifyRoutinePreflight(root,routine.routine_id,{clock:()=>now,executorObserver});
    assert.equal(blockedCache.can_run,false); assert.equal(blockedCache.reason_code,'executor-observation-unavailable');
    assert.equal(readFileSync(join(root,'prompts/report.md'),'utf8'),contentBefore,'observation cache cannot overwrite symlink target');
  } catch(error) { if(process.platform!=='win32'||!['EPERM','EACCES'].includes(error.code)) throw error; }
  const {routineStatePath}=await import('./lib/routine-protocol.mjs');
  mkdirSync(dirname(routineStatePath(root,routine.routine_id)), { recursive: true });
  writeFileSync(`${routineStatePath(root,routine.routine_id)}.lock`,'fictional lock');
  assert(inspectRoutinePreflight(root,routine.routine_id,{now:new Date()}).blocking_reason_codes.includes('routine-already-running'));
  // A previous run can release its lock after inspection. This invocation must still skip,
  // rather than turn a busy observation into an execution that bypasses live authentication.
  const fsDefault=(await import('node:fs')).default;
  const {syncBuiltinESMExports}=await import('node:module');
  const originalLstat=fsDefault.lstatSync;
  const lockPath=`${routineStatePath(root,routine.routine_id)}.lock`;
  let lockRemoved=false; let racedObservations=0; let racedModelCalls=0;
  fsDefault.lstatSync=(path,...args)=>{
    const stat=originalLstat(path,...args);
    if(String(path)===lockPath&&!lockRemoved) {fsDefault.unlinkSync(path);lockRemoved=true;}
    return stat;
  };
  syncBuiltinESMExports();
  try {
    const raced=await runRoutine(root,routine.routine_id,{
      executorObserver:(_adapter,{now})=>{racedObservations++;return {status:'authentication-required',observed_at:now.toISOString()};},
      spawn:()=>{racedModelCalls++;return {status:1,stdout:'',stderr:''};}, wait:async()=>{},
    });
    assert.equal(lockRemoved,true,'the prior lock disappears after its occupied state is inspected');
    assert.equal(racedModelCalls,0,'a disappearing lock must never skip the live authentication gate and invoke the model');
    assert.equal(raced.status,'skipped');
    assert.equal(raced.receipt.reason_code,'routine-already-running');
    assert.equal(raced.receipt.attempts,0); assert.equal(racedObservations,0,'occupied invocation terminates before auth probing');
    const racedTrace=readExecutionTrace(root,raced.receipt.run_id);
    assert.equal(racedTrace.at(-1).state,'skipped');
    assert.equal(racedTrace.at(-1).reason_code,'routine-already-running');
    assert.equal(racedTrace.some(event=>event.step_type==='model'),false);
  } finally {fsDefault.lstatSync=originalLstat;syncBuiltinESMExports();}
  console.log('✓ preflight is read-only, caches only safe session metadata, invalidates stale/version observations and gates model invocation');
} finally {rmSync(root,{recursive:true,force:true});}
