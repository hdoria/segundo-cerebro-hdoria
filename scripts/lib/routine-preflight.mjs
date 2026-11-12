import { createHash, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { evaluateAccess, loadAccessGrant } from './access-runtime.mjs';
import { observeExecutor } from './model-executors.mjs';
import { loadCollectorBinding, loadExecutorBinding, loadRoutineContract, loadRoutineState, routineStatePath, routineOutputDirectory, safeRoutineDestination, DESTINATION_REASON_CODES } from './routine-protocol.mjs';
import { layout, safeRelativePath, validateSourceContract, validateSystemContract } from './system-protocol.mjs';

const OBSERVATION_TTL = 15 * 60_000;
const OBSERVED_STATUSES = new Set(['ready', 'missing', 'authentication-required', 'degraded']);
const unavailableProvider = {available:false,status:()=>({reason_code:'secret-provider-unavailable'})};
function dateValue(value) { const date = new Date(typeof value === 'function' ? value() : value || Date.now()); if (!Number.isFinite(date.getTime())) throw new Error('clock-invalid'); return date; }
function fingerprint(contract,binding) { return createHash('sha256').update(JSON.stringify({contract,binding})).digest('hex'); }
function safeLocalPath(root, ref, {mustExist = false} = {}) {
  const normalized = safeRelativePath(root, ref, {mustExist});
  let current = resolve(root);
  for (const segment of normalized.split('/')) {
    current = join(current, segment);
    try { if (lstatSync(current).isSymbolicLink()) throw new Error('local-path-symlink'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return current;
}
function observationPath(root,id) {
  return safeLocalPath(root, `.cerebro/runtime/executor-observations/${id}.json`);
}
function safeObservation(root,contract,binding,provided) {
  const key=fingerprint(contract,binding);
  if (provided) return provided.fingerprint === key ? provided : null;
  try { const value=JSON.parse(readFileSync(observationPath(root,contract.routine_id),'utf8')); return value.fingerprint === key ? value : null; } catch { return null; }
}
function insideWorkspace(root,ref) {
  const brain=realpathSync(resolve(root)); const absolute=resolve(root,ref); const actual=realpathSync(absolute); const rel=relative(brain,actual);
  if (rel.startsWith('..') || rel.startsWith(sep)) throw new Error('executor-workspace-outside-brain');
  if (!statSync(actual).isDirectory()) throw new Error('executor-workspace-missing');
  return actual;
}

function structuralContextChecks(root, contract) {
  const selections = contract.extensions?.preparation?.source_selections;
  const readContract = (directory, fallback, id, validate, reason) => {
    try {
      const path = safeLocalPath(root, join(directory || fallback, `${id}.json`), {mustExist:true});
      if (statSync(path).size > 2 * 1024 * 1024) throw new Error(reason);
      const value = JSON.parse(readFileSync(path, 'utf8'));
      if (validate(value).length) throw new Error(reason);
      return value;
    } catch { throw new Error(reason); }
  };
  const configured = layout(root);
  const system = readContract(configured.systemContracts, '.cerebro/contracts/systems', contract.system_ref, validateSystemContract, 'context-system-contract-invalid');
  if (system.system_id !== contract.system_ref) return 'context-system-ref-mismatch';
  if (system.protocol_version !== 2) return null;
  const selected = new Set(selections.map(item => item.source_ref));
  if (selected.size !== selections.length) return 'context-selection-duplicate';
  const sources = new Set(system.sources.map(source => source.source_id));
  if (selections.some(item => !sources.has(item.source_ref))) return 'context-selection-source-unknown';
  for (const source of system.sources) {
    if (!system.retrieval.source_roles.some(item => item.role === source.role)) return 'context-retrieval-role-missing';
    if (!contract.context.access_requests.some(item => item.source_ref === source.source_id)) {
      if (source.required) return 'context-access-missing';
      continue;
    }
    if (!selected.has(source.source_id)) {
      if (source.required) return 'context-required-selection-missing';
      continue;
    }
    const sourceValue = readContract(configured.sourceContracts, '.cerebro/contracts/sources', source.source_id, validateSourceContract, 'context-source-contract-invalid');
    if (sourceValue.source_id !== source.source_id) return 'context-source-contract-invalid';
  }
  return null;
}

// Reading the Console never invokes a client, writes access receipts or claims source collection.
export function inspectRoutinePreflight(root,routineId,{now=new Date(),trigger='manual',executorObservation,secretProvider=unavailableProvider}={}) {
  const checked=dateValue(now); const checks=[];
  let configurationSha256 = null;
  const add=(id,status,reason_code,extra={})=>checks.push({id,status,reason_code,...extra});
  const finish=executor=>{ const blockers=checks.filter(item=>item.status==='blocked').map(item=>item.reason_code); return {can_run:!blockers.length,status:blockers.length?'blocked':checks.some(item=>item.status==='warning')?'warning':'ready',checked_at:checked.toISOString(),configuration_sha256:configurationSha256,reason_code:blockers[0]||'preflight-ready',blocking_reason_codes:[...new Set(blockers)],checks,executor}; };
  let contract,binding;
  try { contract=loadRoutineContract(root,routineId).contract; } catch { add('contract','blocked','routine-contract-invalid'); return finish({status:'unknown',observed_at:null,fresh:false}); }
  if (contract.lifecycle!=='approved') add('approval','blocked','routine-not-approved');
  else if (Date.parse(contract.approval.approved_at)>checked.getTime()) add('approval','blocked','routine-approval-not-active');
  else add('approval','passed','routine-approved');
  try { binding=loadExecutorBinding(root,contract.executor.binding_ref).binding; } catch { add('binding','blocked','executor-binding-missing'); return finish({status:'missing',observed_at:null,fresh:false}); }
  configurationSha256 = fingerprint(contract, binding);
  if (binding.auth.status!=='ready') add('executor-declaration','blocked',`executor-${binding.auth.status}`); else add('executor-declaration','passed','executor-declared-ready');
  if (binding.host_ref!==contract.placement.host_ref) add('placement','blocked','executor-host-mismatch');
  if (binding.workspace_ref!==contract.placement.workspace_ref) add('placement','blocked','executor-workspace-mismatch');
  if (!(binding.permission_profile==='workspace-write'||contract.permission_mode==='read-only')) add('permissions','blocked','executor-permission-insufficient'); else add('permissions','passed','executor-permission-valid');
  if (binding.model_policy.allowed_models.length && !binding.model_policy.allowed_models.includes(contract.executor.requested_model)) add('model-policy','blocked','executor-model-not-allowed'); else add('model-policy','passed','executor-model-policy-valid');
  let workspace;
  try { workspace=insideWorkspace(root,binding.workspace_path); add('workspace','passed','executor-workspace-valid'); } catch(error) {add('workspace','blocked',error.message==='executor-workspace-outside-brain'?error.message:'executor-workspace-missing');}
  if (trigger==='schedule') { try { const {state}=loadRoutineState(root,routineId); if (state.status!=='active') add('schedule','blocked',state.status==='paused'?'routine-paused':'routine-not-active'); } catch {add('schedule','blocked','routine-state-invalid');} }
  const destinationExtra=contract.destination.kind==='local-file'?{destination_ref:contract.destination.ref}:{};
  try {
    if (contract.destination.kind==='local-file') safeRoutineDestination(root,contract.destination.ref);
    else safeLocalPath(root, relative(resolve(root), join(routineOutputDirectory(root), 'preflight.md')));
    add('destination','passed','destination-valid',destinationExtra);
  } catch(error) {add('destination','blocked',DESTINATION_REASON_CODES.has(error.message)?error.message:'destination-check-failed',destinationExtra);}
  if (checks.some(check => check.status === 'blocked')) return finish({status:'unknown',observed_at:null,fresh:false});
  for (const request of contract.context.access_requests) {
    try {
      const grant=loadAccessGrant(root,request.grant_ref.replace(/^access-grant:/,'')).grant;
      const result=evaluateAccess(grant,{...request,subject_ref:contract.system_ref,system_ref:contract.system_ref},secretProvider,checked);
      const extra={source_ref:request.source_ref,grant_ref:request.grant_ref,assurance:grant.assurance};
      if (!['allowed','file-only'].includes(result.decision)) add(`access:${request.source_ref}`,'blocked',result.reason_code,extra);
      else if (grant.assurance==='runtime-enforced') add(`access:${request.source_ref}`,'blocked','runtime-connector-not-bound',extra);
      else add(`access:${request.source_ref}`,'passed','access-authorized',extra);
      if (grant.assurance!=='runtime-enforced') add(`collection:${request.source_ref}`,'warning','source-collection-not-verified',extra);
    } catch {add(`access:${request.source_ref}`,'blocked','access-check-failed',{source_ref:request.source_ref});}
  }
  if (checks.some(check => check.status === 'blocked')) return finish({status:'unknown',observed_at:null,fresh:false});
  try { const path=safeLocalPath(root,contract.context.prompt_ref,{mustExist:true}); const stat=statSync(path); if (!stat.isFile()||stat.size>1024*1024) throw new Error('prompt-read-failed'); const prompt=readFileSync(path,'utf8'); add('prompt',prompt.trim()?'passed':'blocked',prompt.trim()?'prompt-readable':'prompt-empty'); } catch {add('prompt','blocked','prompt-read-failed');}
  const preparation=contract.extensions?.preparation;
  if (preparation) {
    try {
      const collector=loadCollectorBinding(root,preparation.binding_ref).binding;
      if (collector.status!=='ready') add('collector','blocked',`collector-${collector.status}`);
      else if (collector.workspace_ref!==contract.placement.workspace_ref || insideWorkspace(root,collector.workspace_path)!==workspace) add('collector','blocked','collector-workspace-mismatch');
      else if (collector.output_ref!==preparation.output_ref) add('collector','blocked','collector-output-mismatch');
      else {
        safeLocalPath(root,collector.output_ref);
        let scriptReady=false;
        try {
          const script=collector.args.find(argument=>!argument.startsWith('-'));
          const scriptPath=safeLocalPath(root,relative(resolve(root),resolve(root,collector.workspace_path,script||'')),{mustExist:true});
          scriptReady=statSync(scriptPath).isFile();
        } catch { /* A missing or symlinked script cannot be declared ready. */ }
        if(!scriptReady) add('collector','blocked','collector-script-unavailable',{binding_ref:preparation.binding_ref});
        else add('collector','passed','collector-configuration-valid',{binding_ref:preparation.binding_ref});
        add('collector-freshness','warning','collector-freshness-checked-on-run');
      }
    } catch(error) { add('collector','blocked',error?.message==='executor-workspace-outside-brain'?'collector-workspace-mismatch':'collector-binding-missing'); }
    if (preparation.source_selections) {
      let contextIssue;
      try { contextIssue = structuralContextChecks(root, contract); }
      catch(error) { contextIssue = error.message === 'context-source-contract-invalid' ? error.message : 'context-system-contract-invalid'; }
      if (contextIssue) add('context','blocked',contextIssue);
      else add('context','warning','context-evidence-checked-on-run');
    }
  }
  const lockPath=`${routineStatePath(root,routineId)}.lock`;
  try { if(existsSync(lockPath) && checked.getTime()-lstatSync(lockPath).mtimeMs <= (contract.operations.timeout_seconds+60)*1000) add('concurrency','blocked','routine-already-running'); else add('concurrency','passed','routine-lock-available'); } catch {add('concurrency','blocked','routine-lock-unavailable');}
  const observation=safeObservation(root,contract,binding,executorObservation);
  const age=observation ? checked.getTime()-Date.parse(observation.observed_at) : Infinity;
  const fresh=Number.isFinite(age)&&age>=0&&age<=OBSERVATION_TTL;
  const executor={status:observation?.status||'unknown',observed_at:observation?.observed_at||null,fresh};
  if (!observation || !OBSERVED_STATUSES.has(observation.status)) add('executor-session','blocked','executor-observation-required');
  else if(!fresh) add('executor-session','blocked','executor-observation-stale');
  else if(observation.status!=='ready') add('executor-session','blocked',`executor-${observation.status}`);
  else add('executor-session','passed','executor-session-ready');
  return finish(executor);
}

export async function verifyRoutinePreflight(root,routineId,{executorObserver=observeExecutor,clock=()=>new Date(),env=process.env,...options}={}) {
  const now=dateValue(clock); const contract=loadRoutineContract(root,routineId).contract;
  let binding;
  try {binding=loadExecutorBinding(root,contract.executor.binding_ref).binding;} catch {return inspectRoutinePreflight(root,routineId,{...options,now});}
  let observed;
  try { observed=await executorObserver(binding.adapter,{env,now}); } catch {observed={status:'degraded',observed_at:now.toISOString()};}
  const validDate=Number.isFinite(Date.parse(observed?.observed_at||''));
  const observation={protocol_version:1,routine_id:routineId,routine_version:contract.version,binding_ref:binding.binding_id,fingerprint:fingerprint(contract,binding),status:OBSERVED_STATUSES.has(observed?.status)&&validDate?observed.status:'degraded',observed_at:validDate?new Date(observed.observed_at).toISOString():now.toISOString()};
  const result = inspectRoutinePreflight(root,routineId,{...options,now,executorObservation:observation});
  try {
    const path = observationPath(root,routineId);
    mkdirSync(dirname(path), {recursive:true,mode:0o700});
    const temporary = `${path}.${randomUUID()}.tmp`;
    writeFileSync(temporary, JSON.stringify(observation)+'\n', {mode:0o600,flag:'wx'});
    renameSync(temporary,path);
    return result;
  } catch {
    return {
      ...result, can_run:false, status:'blocked', reason_code:'executor-observation-unavailable',
      blocking_reason_codes:['executor-observation-unavailable',...result.blocking_reason_codes],
      checks:[...result.checks,{id:'executor-observation-cache',status:'blocked',reason_code:'executor-observation-unavailable'}],
    };
  }
}
