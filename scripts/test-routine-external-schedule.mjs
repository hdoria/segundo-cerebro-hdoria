#!/usr/bin/env node
// Rotina que um agendador de fora roda (claude.ai, launchd, cron, Codex) não é rotina que
// o Console executa: ela não pede atenção por regra de execução que não se aplica, não
// oferece verificar, rodar ou ativar, e a ativação recusa para a agenda não duplicar.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { buildConsoleReadModel } from './lib/console-read-model.mjs';
import { registerRoutineContract, saveExecutorBinding } from './lib/routine-protocol.mjs';
import { activateRoutine } from './lib/routine-runtime.mjs';
import { routinePreflightMarkup } from '../console/ui/routine-preflight.js';

const root = mkdtempSync(join(tmpdir(), 'fictional-external-schedule-'));
const example = (name) => JSON.parse(readFileSync(new URL(`../protocol/examples/${name}.v1.json`, import.meta.url)));
const write = (ref, value) => {
  const path = join(root, ref);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, typeof value === 'string' ? value : JSON.stringify(value));
};
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

try {
  write('.cerebro/layout.json', { version: 3 });
  write('.cerebro/private-ignore.manifest', '.cerebro/runtime\n');
  write('prompts/report.md', 'Produce a fictional weekly report.');
  const base = { ...example('routine-contract'), context: { prompt_ref: 'prompts/report.md', access_requests: [] } };
  // Destino versionado de propósito: o motor recusaria, mas quem escreve é o agendador de fora.
  registerRoutineContract(root, {
    ...base, routine_id: 'fictional-external', destination: { kind: 'local-file', ref: 'journal' },
    extensions: { external_trigger_ref: 'trig_fictional01', external_scheduler: 'launchd' },
  });
  registerRoutineContract(root, { ...base, routine_id: 'fictional-motor', destination: { kind: 'runtime-output', ref: 'routine-output' } });
  saveExecutorBinding(root, example('executor-binding'));

  const model = buildConsoleReadModel(root, { now: new Date('2026-10-22T12:00:00Z') });
  const external = model.routines.find((routine) => routine.routine_id === 'fictional-external');
  const motor = model.routines.find((routine) => routine.routine_id === 'fictional-motor');

  assert.equal(external.health_reason_code, 'external-schedule');
  assert.deepEqual(external.external_schedule, { trigger_ref: 'trig_fictional01', scheduler: 'launchd' });
  assert.equal(model.today.needs_attention.includes('fictional-external'), false,
    'rotina de agendador externo não pede atenção por destino ou sessão que o Console não usa');
  assert.deepEqual(
    [external.actions.can_verify, external.actions.can_run, external.actions.can_activate],
    [false, false, false],
    'o Console não oferece verificar, rodar nem ativar o que outro agendador já roda');

  assert.equal(motor.external_schedule, null, 'rotina sem agendador externo segue o caminho do motor');
  assert.notEqual(motor.health_reason_code, 'external-schedule');
  assert.equal(motor.actions.can_verify, true);

  assert.throws(() => activateRoutine(root, 'fictional-external', 'routine-receipt:fictional', 'pessoa-ficticia'),
    /routine-external-schedule/, 'ativar no Console duplicaria a agenda que já roda fora');

  const markup = routinePreflightMarkup(external, { escapeHtml: esc, fmtDate: String, label: String });
  assert.match(markup, /Roda fora do Console/);
  assert.match(markup, /launchd/);
  assert.match(markup, /trig_fictional01/);
  assert.doesNotMatch(markup, /Verificação da execução/, 'a checagem de execução do motor não se aplica');

  console.log('✓ rotina de agendador externo fica fora da atenção, sem ações do motor e sem ativação duplicada');
} finally {
  rmSync(root, { recursive: true, force: true });
}
