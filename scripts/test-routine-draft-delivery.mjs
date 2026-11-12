#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { runModelExecutor } from './lib/model-executors.mjs';
import { registerRoutineContract, saveExecutorBinding } from './lib/routine-protocol.mjs';
import { runRoutine } from './lib/routine-runtime.mjs';
import { buildConsoleReadModel } from './lib/console-read-model.mjs';
const example = (name) => JSON.parse(readFileSync(new URL(`../protocol/examples/${name}.v1.json`, import.meta.url)));
const root = mkdtempSync(join(tmpdir(), 'fictional-routine-draft-'));
const write = (ref, content) => { mkdirSync(dirname(join(root, ref)), { recursive: true }); writeFileSync(join(root, ref), typeof content === 'string' ? content : JSON.stringify(content)); };
try {
  write('VERSION', 'fixture\n'); write('COMECE-AQUI.md', '# Fictional fixture\n');
  write('.cerebro/layout.json', { version: 3 });
  write('.cerebro/private-ignore.manifest', '.cerebro/runtime\noperacao/execucoes/\n');
  write('journal/2026-10-21.md', '# Original fictional daily\n');
  write('prompts/draft.md', 'Produce the fictional report in your response only. Do not modify notes.\n');
  const routine = { ...example('routine-contract'), routine_id: 'fictional-draft', trigger: { type: 'manual', schedule: null },
    context: { prompt_ref: 'prompts/draft.md', access_requests: [] }, permission_mode: 'read-only',
    destination: { kind: 'runtime-output', ref: 'routine-output' } };
  routine.executor = { ...routine.executor, requested_model: 'padrao-da-conta' };
  const binding = { ...example('executor-binding'), adapter: 'claude-code', workspace_path: '.', auth: { type: 'provider-session', status: 'ready' } };
  let invocations = 0;
  let observedArgs;
  const spawn = (_command, args) => {
    invocations++;
    observedArgs = args;
    return { status: 0, stdout: JSON.stringify({ result: '# Fictional draft report\n\nReady for review.\n' }) };
  };
  assert.equal(runModelExecutor(binding, routine, 'fictional input', { spawn }).ok, true);
  assert.equal(observedArgs[observedArgs.indexOf('--permission-mode') + 1], 'plan');
  assert.equal(observedArgs[observedArgs.indexOf('--tools') + 1], 'Read,Glob,Grep', 'draft executor must restrict available built-in tools');
  assert.equal(observedArgs.includes('--model'), false, 'account default must not be sent as a fake model identifier');
  const explicit = structuredClone(routine); explicit.executor.requested_model = 'sonnet';
  assert.equal(runModelExecutor(binding, explicit, 'fictional input', { spawn: (_command, args) => {
    assert.equal(args[args.indexOf('--model') + 1], 'sonnet');
    return { status: 0, stdout: JSON.stringify({ result: 'explicit output' }) };
  } }).ok, true);
  registerRoutineContract(root, routine); saveExecutorBinding(root, binding);
  const before = readFileSync(join(root, 'journal/2026-10-21.md'), 'utf8');
  const result = await runRoutine(root, routine.routine_id, { spawn, executorObserver: (_adapter, { now }) => ({ status: 'ready', observed_at: now.toISOString() }) });
  assert.equal(result.status, 'completed');
  assert.match(result.receipt.output_ref, /^\.cerebro\/runtime\/outputs\/routines\/.*\.md$/);
  assert.match(readFileSync(join(root, result.receipt.output_ref), 'utf8'), /Fictional draft report/);
  assert.equal(readFileSync(join(root, 'journal/2026-10-21.md'), 'utf8'), before);
  assert.equal(buildConsoleReadModel(root).counts.judgments, 1, 'draft enters the new delivery review queue');
  const nextVersion = structuredClone(routine); nextVersion.version = '1.0.1';
  write('.cerebro/contracts/routines/fictional-draft.json', nextVersion);
  const versionView = buildConsoleReadModel(root).routines.find(r => r.routine_id === routine.routine_id);
  assert.equal(versionView.health_reason_code, 'executor-observation-required', 'an old delivery cannot make the new routine version ready for activation');
  assert.equal(versionView.actions.can_activate, false);
  const broken = structuredClone(routine); broken.routine_id = 'fictional-directory'; broken.destination = { kind: 'local-file', ref: 'operacao/execucoes/reports' };
  mkdirSync(join(root, broken.destination.ref), { recursive: true }); registerRoutineContract(root, broken);
  const brokenView = buildConsoleReadModel(root).routines.find(r => r.routine_id === broken.routine_id);
  assert.equal(brokenView.actions.can_run, false, 'directory destination must not offer Run now');
  assert.equal(brokenView.health_reason_code, 'destination-is-directory');
  assert.equal(invocations, 2);
  console.log('✓ readonly drafts preserve the journal, use the account model and enter review; invalid destinations disable execution');
} finally { rmSync(root, { recursive: true, force: true }); }
