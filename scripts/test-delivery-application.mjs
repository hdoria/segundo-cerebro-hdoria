#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { basename, dirname, join } from 'node:path';
import { deliveryApplicationState, previewDeliveryApplication, applyDeliveryApplication, rollbackDeliveryApplication, recoverDeliveryApplication } from './lib/delivery-application.mjs';
import { writeRoutineRunReceipt, registerRoutineContract } from './lib/routine-protocol.mjs';
import { writeJudgmentReceipt } from './lib/judgment-protocol.mjs';
const root = fs.mkdtempSync(join(tmpdir(), 'delivery-application-'));
const fixture = JSON.parse(fs.readFileSync(new URL('../protocol/examples/routine-run-receipt.v1.json', import.meta.url)));
const contract = JSON.parse(fs.readFileSync(new URL('../protocol/examples/routine-contract.v1.json', import.meta.url)));
const sha = value => createHash('sha256').update(value).digest('hex');
const now = () => new Date('2026-10-21T12:00:00.000Z');
const opts = { clock: now };
const actor = 'role-owner';
function put(ref, text) { fs.mkdirSync(dirname(join(root, ref)), { recursive: true }); fs.writeFileSync(join(root, ref), text); }
function delivery(id, body = '# Relatório fictício\n\n- Verificar marco de exemplo.\n', approve = true) {
  const item = { ...fixture, receipt_id: `receipt-${id}`, run_id: `routine-run-${id}`, slot_key: `slot-${id}`,
    started_at: '2026-10-20T01:30:00.000Z', completed_at: '2026-10-20T01:31:00.000Z', scheduled_for: null,
    output_ref: `.cerebro/runtime/outputs/routines/${id}.md` };
  writeRoutineRunReceipt(root, item); put(item.output_ref, body);
  if (approve) writeJudgmentReceipt(root, item.receipt_id, { verdict: 'approved', actorRef: actor, reviewedSha256: sha(body), clock: now });
  return item;
}
const params = target_date => ({ target_date, approved_by: actor });
function preview(item, date = '2026-10-19') { return previewDeliveryApplication(root, item.receipt_id, params(date), opts); }
function apply(item, plan) { return applyDeliveryApplication(root, item.receipt_id, { ...params(plan.target_date), previewed_at: plan.previewed_at, plan_digest: plan.plan_digest }, opts); }
function rollback(item, value) { return rollbackDeliveryApplication(root, item.receipt_id, { application_id: value.application_id, approved_by: actor, reason: 'user-requested' }, opts); }
try {
  put('.cerebro/layout.json', JSON.stringify({ version: 3, vault: { daily: 'journal' } }));
  registerRoutineContract(root, { ...contract, destination: { kind: 'runtime-output', ref: 'private-draft' } });
  const item = delivery('primary');
  const initial = deliveryApplicationState(root, item.receipt_id, opts);
  assert.equal(initial.eligible, true, JSON.stringify(initial));
  assert.equal(initial.suggested_date, '2026-10-19', 'date uses execution timezone, not current day');
  assert.equal(initial.state.status, 'not-applied');
  const original = '---\ntitle: Exemplo\n---\n\n## Manual\nNão apagar.\n\n<!-- ai:start -->\nversão antiga\n<!-- ai:end -->\n\n## Depois\nAnotação manual.\n';
  put('journal/2026-10-19.md', original);
  const plan = preview(item);
  assert.equal(fs.readFileSync(join(root, plan.target_ref), 'utf8'), original, 'preview is read-only');
  assert.equal(plan.before, original);
  assert.ok(plan.after.startsWith(original.split('<!-- ai:start -->')[0]));
  assert.ok(plan.after.endsWith(original.split('<!-- ai:end -->')[1]));
  assert.ok(plan.diff.includes('-versão antiga'));
  assert.equal(plan.before_sha256, sha(original));
  const applied = apply(item, plan);
  assert.equal(applied.status, 'applied');
  assert.equal(fs.readFileSync(join(root, plan.target_ref), 'utf8'), plan.after);
  assert.equal(deliveryApplicationState(root, item.receipt_id, opts).state.application_id, applied.application_id);
  assert.equal(apply(item, plan).application_id, applied.application_id, 'retry is idempotent');
  const reverted = rollback(item, applied);
  assert.equal(reverted.status, 'rolled-back');
  assert.equal(fs.readFileSync(join(root, plan.target_ref), 'utf8'), original, 'rollback restores all exact bytes');
  assert.equal(rollback(item, applied).status, 'rolled-back', 'rollback retry is idempotent');
  const reapplied = apply(item, preview(item));
  assert.notEqual(reapplied.application_id, applied.application_id);
  put(plan.target_ref, `${plan.after}\nNova edição manual\n`);
  assert.throws(() => rollback(item, reapplied), /delivery-application-target-changed/);
  const missing = delivery('missing'); const missingPlan = preview(missing, '2026-10-18');
  assert.equal(missingPlan.before, ''); assert.equal(missingPlan.before_sha256, null);
  assert.equal(fs.existsSync(join(root, missingPlan.target_ref)), false);
  const created = apply(missing, missingPlan);
  rollback(missing, created);
  assert.equal(fs.existsSync(join(root, missingPlan.target_ref)), false, 'rollback removes only the unchanged newly created note');
  // The daily directory may not exist yet. Preview must not create it.
  const renamedJournal = join(root, 'journal-existing');
  fs.renameSync(join(root, 'journal'), renamedJournal);
  const firstNote = delivery('first-note');
  const firstPlan = preview(firstNote, '2026-10-07');
  assert.equal(fs.existsSync(join(root, 'journal')), false);
  const firstApplied = apply(firstNote, firstPlan);
  assert.equal(fs.readFileSync(join(root, firstPlan.target_ref), 'utf8'), firstPlan.after);
  rollback(firstNote, firstApplied);
  fs.rmdirSync(join(root, 'journal'));
  fs.renameSync(renamedJournal, join(root, 'journal'));
  const unapproved = delivery('unapproved', 'Unapproved', false);
  assert.equal(deliveryApplicationState(root, unapproved.receipt_id, opts).eligible, false);
  assert.throws(() => preview(unapproved), /delivery-application-approval-required/);
  const changed = delivery('changed'); const changedPlan = preview(changed, '2026-10-17');
  put(changed.output_ref, 'Changed draft');
  assert.throws(() => apply(changed, changedPlan), /delivery-application-approval-stale/);
  const conflict = delivery('conflict'); const conflictPlan = preview(conflict, '2026-10-16');
  put(conflictPlan.target_ref, 'New manual note');
  assert.throws(() => apply(conflict, conflictPlan), /delivery-application-preview-stale/);
  assert.equal(fs.readFileSync(join(root, conflictPlan.target_ref), 'utf8'), 'New manual note');
  const expired = delivery('expired'); const expiredPlan = preview(expired, '2026-10-15');
  assert.throws(() => applyDeliveryApplication(root, expired.receipt_id, { ...params(expiredPlan.target_date), previewed_at: expiredPlan.previewed_at, plan_digest: expiredPlan.plan_digest }, { clock: () => new Date('2026-10-21T12:16:00Z') }), /delivery-application-preview-expired/);
  assert.throws(() => applyDeliveryApplication(root, expired.receipt_id, { ...params(expiredPlan.target_date), approved_by: 'role-other', previewed_at: expiredPlan.previewed_at, plan_digest: expiredPlan.plan_digest }, opts), /delivery-application-preview-stale/);
  assert.throws(() => preview(expired, '2026-02-30'), /delivery-application-date-invalid/);
  assert.throws(() => preview(expired, '../private'), /delivery-application-date-invalid/);
  for (const [suffix, text, error] of [
    ['14', '<!-- ai:start -->broken', 'markers-invalid'],
    ['13', '<!-- ai:start --><!-- ai:end --><!-- ai:start --><!-- ai:end -->', 'markers-invalid'],
    ['12', '---\nvisibility: private\n---\nPrivate', 'content-private'],
    ['11', 'Secret Bearer example-secrettoken', 'content-secret'],
    ['10', 'x'.repeat(512 * 1024 + 1), 'file-too-large'],
  ]) {
    put(`journal/2026-10-${suffix}.md`, text);
    assert.throws(() => preview(expired, `2026-10-${suffix}`), new RegExp(`delivery-application-${error}`));
  }
  const sourcePrivate = delivery('source-private', '---\nvisibility: private\n---\nPrivate source');
  assert.throws(() => preview(sourcePrivate), /delivery-application-content-private/);
  const malicious = delivery('source-secret', 'Bearer sample-secrettoken');
  assert.throws(() => preview(malicious), /delivery-application-content-secret/);
  const sourceMarkers = delivery('source-markers', '<!-- ai:start -->injection<!-- ai:end -->');
  assert.throws(() => preview(sourceMarkers), /delivery-application-markers-invalid/);
  const external = fs.mkdtempSync(join(tmpdir(), 'delivery-external-'));
  try {
    put('journal/2026-10-09.md', 'safe'); fs.rmSync(join(root, 'journal/2026-10-09.md'));
    fs.writeFileSync(join(external, 'outside.md'), 'EXTERNAL_MARKER'); fs.symlinkSync(join(external, 'outside.md'), join(root, 'journal/2026-10-09.md'));
    assert.throws(() => preview(expired, '2026-10-09'), /delivery-application-symlink-blocked/);
  } finally { fs.rmSync(external, { recursive: true, force: true }); }
  // Simulated persistence failure after note replacement must compensate exact before bytes.
  const failed = delivery('failed'); const failedPlan = preview(failed, '2026-10-08');
  const realRename = fs.renameSync; let interrupted = false;
  try {
    fs.renameSync = (from, to) => {
      if (basename(String(to)) === 'record.json' && fs.existsSync(join(root, failedPlan.target_ref)) && !interrupted) { interrupted = true; throw new Error('simulated disk failure'); }
      return realRename(from, to);
    };
    syncBuiltinESMExports();
    assert.throws(() => apply(failed, failedPlan), /delivery-application-persistence-failed/);
    assert.equal(interrupted, true);
    assert.equal(fs.existsSync(join(root, failedPlan.target_ref)), false);
  } finally { fs.renameSync = realRename; syncBuiltinESMExports(); }
  // Receipt-level exclusion prevents the same delivery from reaching two dates.
  const concurrent = delivery('concurrent');
  const planA = preview(concurrent, '2026-10-06'); const planB = preview(concurrent, '2026-10-05');
  const realLstat = fs.lstatSync; let interleaved = false;
  try {
    fs.lstatSync = (path, ...args) => {
      if (String(path) === join(root, '.cerebro', 'runtime', 'delivery-applications', concurrent.receipt_id) && !interleaved) {
        interleaved = true;
        assert.throws(() => apply(concurrent, planB), /delivery-application-target-busy/);
      }
      return realLstat(path, ...args);
    };
    syncBuiltinESMExports();
    const result = apply(concurrent, planA);
    assert.equal(result.status, 'applied');
    assert.equal(interleaved, true);
    assert.equal(fs.existsSync(join(root, planB.target_ref)), false);
  } finally { fs.lstatSync = realLstat; syncBuiltinESMExports(); }
  // Former stale-lock successor race: cleaning one unique dead claim must
  // never move/remove a live participant or admit a competing publication.
  const cleanupA = delivery('cleanup-a'); const cleanupB = delivery('cleanup-b');
  const cleanupPlanA = preview(cleanupA, '2026-10-02'); const cleanupPlanB = preview(cleanupB, '2026-10-02');
  const targetLocks = join(root, '.cerebro/runtime/delivery-applications/locks', sha(`target:${cleanupPlanA.target_ref}`));
  fs.mkdirSync(targetLocks, { recursive: true });
  const deadNonce = '00000000-0000-0000-0000-000000000001';
  const deadClaim = join(targetLocks, `claim-${deadNonce}.json`);
  fs.writeFileSync(deadClaim, JSON.stringify({ pid: 2147483647, nonce: deadNonce, choosing: false, ticket: 1 }));
  const realUnlink = fs.unlinkSync; let cleanupInterleaved = false;
  try {
    fs.unlinkSync = (path, ...args) => {
      if (path === deadClaim && !cleanupInterleaved) {
        cleanupInterleaved = true;
        assert.throws(() => apply(cleanupB, cleanupPlanB), /delivery-application-target-busy/);
      }
      return realUnlink(path, ...args);
    };
    syncBuiltinESMExports();
    assert.equal(apply(cleanupA, cleanupPlanA).status, 'applied');
    assert.equal(cleanupInterleaved, true);
    assert.equal(fs.readFileSync(join(root, cleanupPlanA.target_ref), 'utf8'), cleanupPlanA.after);
    assert.equal(deliveryApplicationState(root, cleanupB.receipt_id).state.status, 'not-applied');
  } finally { fs.unlinkSync = realUnlink; syncBuiltinESMExports(); }
  // Byte preservation includes BOM and CRLF in manual content.
  const byteExact = delivery('byte-exact');
  const byteOriginal = '\uFEFF---\r\ntitle: Teste\r\n---\r\n\r\nManual \r\n';
  put('journal/2026-10-01.md', byteOriginal);
  const bytePlan = preview(byteExact, '2026-10-01');
  assert.ok(bytePlan.after.startsWith(byteOriginal));
  const byteResult = apply(byteExact, bytePlan); rollback(byteExact, byteResult);
  assert.deepEqual(fs.readFileSync(join(root, bytePlan.target_ref)), Buffer.from(byteOriginal));
  // Kill a real child at the transaction boundaries. Recovery must neither
  // require deleting live locks nor infer a rollback from ordinary user edits.
  function crash(item, plan, mode, result = null) {
    const code = `
      import fs from 'node:fs'; import { syncBuiltinESMExports } from 'node:module'; import { basename } from 'node:path';
      import { applyDeliveryApplication, rollbackDeliveryApplication } from ${JSON.stringify(new URL('./lib/delivery-application.mjs', import.meta.url).href)};
      const input = JSON.parse(process.env.FICTITIOUS_DELIVERY_CRASH);
      const rename = fs.renameSync; const unlink = fs.unlinkSync;
      fs.unlinkSync = path => { const value = unlink(path); if (input.mode === 'rollback' && path === input.target) process.exit(73); return value; };
      fs.renameSync = (from, to) => {
        if (input.mode === 'before-publish' && basename(String(to)) === 'record.json') process.exit(73);
        const value = rename(from, to);
        if (to === input.target) process.exit(73);
        return value;
      }; syncBuiltinESMExports();
      if (input.mode === 'rollback') rollbackDeliveryApplication(input.root, input.receiptId,
        { application_id: input.applicationId, approved_by: 'role-owner', reason: 'mistake' }, { clock: () => new Date('2026-10-21T12:00:00.000Z') });
      else applyDeliveryApplication(input.root, input.receiptId, input.payload, { clock: () => new Date('2026-10-21T12:00:00.000Z') });
    `;
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8', env: {
      ...process.env, FICTITIOUS_DELIVERY_CRASH: JSON.stringify({ root, receiptId: item.receipt_id, mode,
        applicationId: result?.application_id, target: join(root, plan.target_ref),
        payload: { ...params(plan.target_date), previewed_at: plan.previewed_at, plan_digest: plan.plan_digest } }) } });
    assert.equal(child.status, 73, child.stderr);
  }
  const interruptedApply = delivery('crash-apply'); const interruptedPlan = preview(interruptedApply, '2026-10-04');
  crash(interruptedApply, interruptedPlan, 'apply');
  assert.equal(deliveryApplicationState(root, interruptedApply.receipt_id).state.recovery_required, true);
  const recoveredApply = recoverDeliveryApplication(root, interruptedApply.receipt_id, { approved_by: actor }, opts);
  assert.equal(recoveredApply.state.status, 'applied');
  assert.equal(recoveredApply.state.recovery_required, false);
  const recoveredBody = fs.readFileSync(join(root, interruptedPlan.target_ref), 'utf8');
  assert.equal(recoveredBody, interruptedPlan.after);
  assert.equal(apply(interruptedApply, interruptedPlan).application_id, recoveredApply.state.application_id);
  crash(interruptedApply, interruptedPlan, 'rollback', recoveredApply.state);
  assert.equal(deliveryApplicationState(root, interruptedApply.receipt_id).state.recovery_required, true);
  assert.equal(fs.existsSync(join(root, interruptedPlan.target_ref)), false);
  const recoveredRollback = recoverDeliveryApplication(root, interruptedApply.receipt_id, { approved_by: actor }, opts);
  assert.equal(recoveredRollback.state.status, 'rolled-back');
  const unpublished = delivery('crash-unpublished'); const unpublishedPlan = preview(unpublished, '2026-10-03');
  crash(unpublished, unpublishedPlan, 'before-publish');
  assert.equal(deliveryApplicationState(root, unpublished.receipt_id).state.status, 'not-applied');
  assert.equal(apply(unpublished, unpublishedPlan).status, 'applied', 'unpublished private staging does not poison receipt state');
  // Real processes contend on the same target. At most one may commit; if
  // both safely report busy, an explicit sequential retry must make progress.
  for (let pair = 0; pair < 4; pair++) {
    const day = `2026-09-${String(20 + pair).padStart(2, '0')}`;
    const contenders = [delivery(`parallel-a-${pair}`, `Fictitious A ${pair}`), delivery(`parallel-b-${pair}`, `Fictitious B ${pair}`)];
    const plans = contenders.map(value => preview(value, day));
    // A live choosing participant makes dual target-busy deterministic, proving
    // the same safe abort that real scheduling can produce on CI.
    const blocker = pair === 3 ? join(root, '.cerebro/runtime/delivery-applications/locks', sha(`target:${plans[0].target_ref}`), 'claim-00000000-0000-0000-0000-000000000002.json') : null;
    if (blocker) {
      fs.mkdirSync(dirname(blocker), { recursive: true });
      fs.writeFileSync(blocker, JSON.stringify({ pid: process.pid, nonce: '00000000-0000-0000-0000-000000000002', choosing: true, ticket: 0 }));
    }
    let results;
    try { results = await Promise.all(contenders.map((value, i) => new Promise(resolveChild => {
      const script = `import { applyDeliveryApplication } from ${JSON.stringify(new URL('./lib/delivery-application.mjs', import.meta.url).href)};
        const value = JSON.parse(process.env.FICTITIOUS_DELIVERY_PARALLEL);
        try { applyDeliveryApplication(value.root, value.id, value.plan, { clock: () => new Date('2026-10-21T12:00:00Z') }); }
        catch(error) {
          if (!/^delivery-application-(target-busy|preview-stale|target-changed)$/.test(error.message)) throw error;
          process.stdout.write(JSON.stringify({ reason: error.message })); process.exitCode = 11;
        }`;
      const child = spawn(process.execPath, ['--input-type=module', '-e', script], { stdio: ['ignore', 'pipe', 'pipe'], env: {
        ...process.env, FICTITIOUS_DELIVERY_PARALLEL: JSON.stringify({ root, id: value.receipt_id,
          plan: { ...params(day), previewed_at: plans[i].previewed_at, plan_digest: plans[i].plan_digest } }) } });
      let stdout = '', stderr = '';
      child.stdout.on('data', bytes => { stdout += bytes; }); child.stderr.on('data', bytes => { stderr += bytes; });
      child.on('close', status => {
        let reason = null;
        try { reason = JSON.parse(stdout).reason; } catch { /* Invalid child output cannot authorize recovery. */ }
        resolveChild({ status, reason, stdout, stderr });
      });
    }))); } finally { if (blocker) fs.unlinkSync(blocker); }
    if (blocker) assert.deepEqual(results.map(value => value.reason), ['delivery-application-target-busy', 'delivery-application-target-busy'], 'the live choosing claim exercises dual busy deterministically');
    const winners = results.flatMap((value, i) => value.status === 0 ? [i] : []);
    assert.ok(winners.length <= 1, JSON.stringify(results));
    for (const result of results) {
      assert.ok(result.status === 0 || (result.status === 11 && ['delivery-application-target-busy', 'delivery-application-preview-stale', 'delivery-application-target-changed'].includes(result.reason)), JSON.stringify(results));
    }
    let winner = winners[0];
    if (winner === undefined) {
      assert.ok(results.every(value => value.reason === 'delivery-application-target-busy'), JSON.stringify(results));
      assert.equal(fs.existsSync(join(root, plans[0].target_ref)), false, 'dual busy cannot publish note bytes');
      for (const contender of contenders) {
        assert.equal(deliveryApplicationState(root, contender.receipt_id).state.status, 'not-applied');
        assert.equal(fs.existsSync(join(root, '.cerebro/runtime/delivery-applications', contender.receipt_id)), false, 'dual busy cannot publish an application receipt');
      }
      assert.equal(apply(contenders[0], plans[0]).status, 'applied', 'one explicit retry of the same preview succeeds after contention ends');
      winner = 0;
    }
    const targetPath = join(root, plans[0].target_ref);
    const committedBytes = Buffer.from(plans[winner].after);
    assert.deepEqual(fs.readFileSync(targetPath), committedBytes);
    const loser = 1 - winner;
    assert.throws(() => apply(contenders[loser], plans[loser]), /delivery-application-preview-stale/, 'the other preview cannot overwrite the winner');
    assert.deepEqual(fs.readFileSync(targetPath), committedBytes, 'stale attempts preserve every committed byte');
    assert.equal(contenders.filter(value => deliveryApplicationState(root, value.receipt_id).state.status === 'applied').length, 1);
    assert.equal(deliveryApplicationState(root, contenders[loser].receipt_id).state.status, 'not-applied');
  }
  console.log('Delivery application: preview, hashes, exact preservation, stale approvals, conflicts, rollback, privacy and persistence compensation passed.');
} finally { fs.rmSync(root, { recursive: true, force: true }); }
