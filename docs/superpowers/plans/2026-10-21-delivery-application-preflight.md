# Delivery application and routine preflight implementation plan

> **For agentic workers:** use test-first changes and independent whole-branch review. Implement the two backend modules in parallel; integrate their fixed interfaces in the Console afterward.

**Goal:** Close reviewed draft → explicit journal application → safe reversal, and align routine readiness with the actual execution gates.

**Architecture:** Existing outputs, version-bound judgments, source notes and contracts remain canonical. A private application ledger stores metadata and reversible snapshots; an exact preview digest authorizes only the displayed AI-managed note block. A shared read-only preflight derives readiness, while an explicit session probe records recent executor availability; execution repeats the gates before calling the model.

**Tech Stack:** Node ESM, filesystem, existing React/shadcn Console, existing design tokens. No new dependencies.

**Spec:** User-approved items 1 and 2 in this conversation: apply a reviewed draft with before/after, explicit confirmation, conflict detection and rollback; complete checks before Run now.

## Global constraints

- No real daily, journal write or model call during verification; synthetic fixtures only.
- Native, completed, approved exact-version deliveries only; imported history cannot be applied.
- Target is a strict calendar date under `layout.vault.daily`; preserve manual bytes/frontmatter outside a single `<!-- ai:start -->` / `<!-- ai:end -->` block.
- Preview/apply bind source, latest approval, target before/after hashes, actor and timestamp; preview TTL 15 minutes. Recheck all evidence on apply.
- Reversal restores prior bytes only if current target still matches the applied version; subsequent user edits block it.
- Strict private storage, bounded UTF-8 files, no symlink traversal, locking and atomic writes. No raw content in public read models or metadata receipts.
- GET/read-model preflight cannot spawn, mutate access receipts or run collectors. Session verification uses version/auth status only, no model.
- Fresh executor observations expire after 15 minutes and are invalidated by binding/contract changes. Runtime observes again, independently of browser state.
- Keep session, CSRF, origin and explicit mutation confirmation. Preserve drawer identity and drafts across asynchronous responses.

## Review focus

- Source/judgment/target changes after preview; repeat apply and concurrent receipts targeting one note.
- Missing target, manual note, valid/malformed AI markers, hidden/private paths, symlinks and oversized/untrusted content.
- Reversal after a user edit, corrupted snapshots/metadata, persistence failure and recovery without data loss.
- Revoked/expired/mismatched grants, missing prompt/collector, placement/permission/model mismatch, stale auth and concurrent run.
- Late API responses after drawer/date/actor changes; safe escaping, mobile and keyboard.

## Task 1: Application backend (worker)

Files: new `scripts/lib/delivery-application.mjs`, `scripts/test-delivery-application.mjs`.

Interfaces: `deliveryApplicationState(root,id,{clock})`; `previewDeliveryApplication(root,id,{target_date,approved_by},{clock})`; `applyDeliveryApplication(root,id,{target_date,approved_by,previewed_at,plan_digest},{clock})`; `rollbackDeliveryApplication(root,id,{application_id,approved_by,reason},{clock})`.

- [x] Write failing tests for new/existing/manual journal, current-version approval, preview hash conflict, rollback conflict and private-path protection.
- [x] Implement pure metadata state/preview and locked atomic application/reversal with private snapshots and validated events.
- [x] Run tests, report exact fields/reasons and obtain independent security review.

## Task 2: Preflight backend (worker)

Files: new `scripts/lib/routine-preflight.mjs`, `scripts/test-routine-preflight.mjs`; runtime/read-model and explicit observer DI in dependent tests.

Interfaces: `inspectRoutinePreflight(root,id,{now,trigger,executorObservation})`; `verifyRoutinePreflight(root,id,{executorObserver,clock})`. Returns `can_run`, `checked_at`, `reason_code`, `blocking_reason_codes`, `checks`, `executor`.

- [x] Write failing tests showing blocked readiness for stale session, denied access, invalid placement/prompt/collector, and no side effects from inspection.
- [x] Share preflight with read model and execution; use independent injected executor observer, keeping model doubles separate.
- [x] Run focused runtime/Console regression tests and independent review.

## Task 3: Authenticated API and UI (root)

Files: `scripts/console-server.mjs`, `console/app.js`, `console/styles.css` if existing classes are insufficient; new integration and UI tests; manifest and cache versions.

- [x] Expose authenticated application state/preview/apply/rollback and preflight read/verify endpoints. Mutations require CSRF and confirmation; actor/date/digest checked server-side.
- [x] Add a separate Apply to journal section after quality review: date and actor → exact diff → explicit apply → receipt and reversible state. Replacing dates or closing/switching drawers invalidates pending previews.
- [x] Show routine check results, session observation time and Verify execution action; enable Run only from valid server-derived readiness.
- [x] Add HTTP tests with injected observers and synthetic content; UI tests for stale previews, drawer switches, errors and escaping.
- [x] Build, run relevant/full checks, privacy/token audits and visual checks with synthetic data.

## Task 4: Delivery

- [x] Independent whole-branch/security review; resolve material findings with regression tests.
- [x] Conventional commits, integrate/push private clean main, verify CI.
- [x] Restart local 4782 with the same private data root. Verify metadata/readiness and history without applying notes or invoking the model.

**Stop condition:** The user can inspect and explicitly apply an approved delivery's exact proposal, safely reverse it when untouched, and see why a routine can or cannot run. Verification leaves real notes and business judgments unchanged.

## Verification evidence

- Full local runner: 118 suites, 232 syntax checks, zero failures.
- Build, product manifest, token and sensitive-data checks passed.
- Independent security review verified concurrent receipts/targets, real child-process crash recovery and 15 same-target process pairs; no material blockers remained.
- Independent integration review verified session/lock race prevention, same-receipt late responses and interrupted-operation recovery.
- Synthetic browser flow: verify session without model → approve exact report → preview diff → explicitly apply → reverse. Original manual note bytes restored exactly.
- Responsive check at 390 × 844: document width 390, drawer width 367, inputs 16 px, no horizontal page overflow. Escape closes drawer. Light and dark screenshots contain fictional data only.
- Visual check caught and corrected inherited fixed-footer positioning in inline application controls; targeted regression test added.

## Rollout evidence

- Feature commit: `5665b51`; portable fault-injection test correction: `d95776d`.
- CI run `39629693443`: Linux, macOS and Windows all passed on `d95776d`. The first Windows run caught Unix-only path comparisons in test hooks; all three hooks now use native path functions. No production change was needed.
- Private independent repository main pushed and Console restarted on 127.0.0.1:4782 with the same private vault root. Served bundle hash matches the built code; app cache version 21.
- Live verification: HTTP 200; 118 imported historical deliveries, zero new pending judgments; judgment storage hash unchanged. All 120 journal note hashes remained unchanged across rollout.
- Daily version 0.1.1 requires a fresh executor session check; weekly review remains blocked by its invalid destination. No real model call, journal application or schedule activation was performed.
