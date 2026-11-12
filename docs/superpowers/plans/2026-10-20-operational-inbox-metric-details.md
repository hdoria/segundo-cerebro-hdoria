# Operational inbox, metric details and installed Console proof

> **For agentic workers:** use subagent-driven-development or executing-plans with independent review. User approved the three proposed capabilities with “traga isso”.

**Goal:** bring upstream operational notices, installation/upgrade verification and metric detail into the existing Console.

**Architecture:** derive notices from existing Console contracts/receipts and decision cases; persist only local read preferences. Extend the current read-only metric registry adapter. Test the existing installer/updater against the complete fork package rather than importing the upstream panel.

**Tech Stack:** Node20+ ES modules, native HTTP, existing vanilla Console, no new dependencies.

**Spec:** approved three-point recommendation in this conversation; DESIGN.md; upstream v1.40.0/c14c12ec968c2f4350267ec6527dacf313cd29a4.

## Global constraints

- Reuse isolated worktree e823, branch codex/operational-inbox, base ef004a9. Original main and live server remain usable during implementation.
- Preserve effective data root, canonical contracts and receipts. No invented events, metric definitions, readings, connections or business decisions.
- Notice lists expose fixed labels, states, dates and safe protocol references, never raw outputs, prompts, private note text or arbitrary source titles.
- GET does not write. Explicit read/unread changes write only bounded hash/fingerprint preferences in `.cerebro/runtime/console-inbox-read.json`; marking read never resolves a decision or changes an execution.
- Existing session and CSRF protection apply. Revalidate current notice identity/fingerprint on mutation; reject stale or unknown references. Path, symlink, privacy and size protections remain intact.
- Match existing Operate design, tokens, mobile and keyboard behavior; opening a source uses the existing drawer/action.
- No external services or real-vault mutations in tests. Synthetic installations only; full CI remains Linux/Windows/macOS with no exclusions.
- Done after independent review, appropriate focused/full tests, main/push, native CI and live homologation on4782 with the same existing root.

## Review focus

1. A replay/simulation or the same failed receipt must not create misleading duplicate notices.
2. A new source status/fingerprint must not inherit an old read mark; an old browser response must not overwrite a newer filter/mutation.
3. Missing/invalid read-state files and symlink paths must fail safely without modifying canonical data.
4. Metric zero and missing values, undefined fractions, privacy flags and differing scopes/sources must remain distinct across current/history and filters.
5. An installed/upgraded package must open without npm/build, preserve private sentinels and own instructions, and contain every required local asset under paths with spaces.

## Task1: notices backend and HTTP (root)

Files: new scripts/lib/operational-inbox.mjs, new scripts/test-operational-inbox.mjs, scripts/console-server.mjs, new scripts/test-console-operational-inbox.mjs.

Interfaces:
- `operationalInbox(root,{model,decisions,area='',unread=false,offset=0,limit=50})` returns `{available,notices,counts:{total,unread},total,offset,limit,issues}`.
- Each notice: `{id,fingerprint,kind,severity,title,status,occurred_at,system_ref,area_ref,evidence_ref,target:{kind,ref},read}`. ID opaque and stable; fingerprint represents canonical occurrence/state.
- `markOperationalNoticeRead(root,{model,decisions,id,fingerprint,read})` validates the freshly derived notice and persists only hashed preferences, returns `{id,fingerprint,read}`.
- `GET /api/operational-inbox?area=&unread=1&offset=&limit=`; `POST /api/operational-inbox/read` body `{id,fingerprint,read}` with existing session/CSRF. Metrics route extends query parameters below.

- [x] RED: failed/denied receipts, routine blockers, pending judgments and decision cases; stable deduplication, simulation exclusion, area/pagination, source opening refs, no raw data.
- [x] RED: GET no writes, explicit read persists across recreation, fingerprint changes unread, stale/unknown mutation rejected, corrupt/oversize/private/symlink state fails safely.
- [x] Implement bounded derived projection and atomic private preference storage; wire authenticated routes and sanitized errors.
- [x] GREEN focused module/HTTP suites plus existing Console regression tests.

## Task2: metrics detail (metrics worker)

Files owned: scripts/lib/business-metrics.mjs and scripts/test-business-metrics.mjs.

Extend `businessMetrics(root,{area='',system='',workflow=''})`; conjunctive filters match scope area_ref/system_ref/workflow_refs. Return filter choices as `filters:{systems:[string],workflows:[string]}` derived from valid existing records within the area (before system/workflow filtering).

Preserve current and history `numerator`, `denominator`, `attribution`. Fractions follow upstream: finite number, nonempty safe string represented as `{key:null,label,value:null,definition:''}`, or bounded `{key,label,value,definition}`; absent/invalid is null. Attribution accepts safe string or `{basis}`; absent is null. Never calculate ratios or attribute workflow effects.

- [x] Inspect upstream bundled metric contract, RED tests for rich/missing/zero fraction and provenance, scope combinations, history, unsafe nested data and invalid filters.
- [x] Extend the existing bounded adapter without changing canonical registry or weakening filesystem/privacy safeguards.
- [x] GREEN focused metrics/API tests; communicate schema to UI/root.

## Task3: installed package proof (package worker)

Files owned: new scripts/test-console-installed-release.mjs; fixture helpers only if necessary, coordinate first. Root owns production docs/manifest changes if the test identifies a packaging defect.

- [x] Inspect upstream test-panel-release and existing official installer/update test seams; use local synthetic Git/package source and actual fork assets, no network.
- [x] Prove clean installation and upgrade through official updater with explicit source/tag/preview/hash flow, engine/data roots in paths with spaces, private sentinels and managed/unmanaged instruction preservation, second apply idempotent.
- [x] Start installed `scripts/console.mjs --no-open`, verify real HTTP index/assets/session/file list/notice/metric APIs with synthetic data and chosen root; no npm install/build.
- [x] Exercise missing/changed required asset so the proof catches incomplete packaging; all runtime data stays outside product tree.
- [x] Run focused packaging/preservation checks, no platform skips; new test joins CI glob automatically.

## Task4: existing Console UI (UI worker)

Files owned: console/app.js,index.html,styles.css and new scripts/test-console-operational-workspace.mjs; extend existing local-workspaces tests only when necessary. Read DESIGN.md and Impeccable Operate/craft floor before editing.

- [x] RED behavioral tests for notice navigation, loading/error/empty/pagination, unread filter, explicit read/unread mutation and safe source dispatch.
- [x] Add Avisos to existing navigation, area-aware list and counts, escaped fixed metadata and source buttons. No background marking or resolution actions; preserve stale-response guards and keyboard focus.
- [x] Add Sistema/Fluxo filters to existing Indicadores, preserving global area context and exposing numerator/denominator/attribution for current/history. Missing fields remain explicit; zero remains zero.
- [x] GREEN UI regressions and actual desktop/390px browser checks; run detector once after final UI.

## Task5: integration, provenance and delivery (root + independent reviewer)

Files: VERSION, CHANGELOG.md, .cerebro/upstream-baseline.json, docs/guides/upstream-alignment.md, scripts/test-upstream-provenance.mjs and this plan.

- [x] Increment fork1.39.0; retain upstream selectivev1.40.0 and explicitly record the adapted capabilities, excluding original panel/UI/launcher.
- [x] Independent code/security/behavior review; resolve all actionable findings.
- [x] Full local suite, syntax, product/mirror checks, UI build if changed, diff checks; full native CI after commit/push/main.
- [x] Restart4782 with same effective root; independently confirm area navigation, notice APIs and metric empty state/version; no real read-state mutation during verification.
- [x] Record proof and stop with main synchronized and deliverable tab open.

## Verification notes

- Final local verification passed all 102 suites and 208 syntax checks after the canonical trace/repause hardening. Product validation, portable skill mirror and diff checks passed. Canvas source and bundle were unchanged, so no Canvas build was needed.
- Independent review resolved hidden independent blockers, unknown/private preference envelopes, stale area filters, date-only precision, canonical receipt references, denied replays without a RunRecord and new pause occurrences.
- Receipt views expose their existing opaque run_id. Replay exclusion uses bounded, no-follow read-only trace metadata, not the standard trace reader that initializes storage. No new canonical event store exists.
- Desktop and390px synthetic browser checks verified mark-read/unread filtering, source drawer/Escape focus, metric zero versus missing readings, fraction/provenance history and filter choices. Page overflow was absent; history scrolls inside its container. Mechanical UI detector returned no findings.

## Delivery receipt

- Implementation integrated and pushed to main at `8210873a73a419590379d9e7afff9384633646d0`, fork version1.39.0. Upstream provenance remains selectivev1.40.0/c14c12ec968c2f4350267ec6527dacf313cd29a4.
- [Native CI39521688974](https://github.com/hdoria/cerebro-hdoria/actions/runs/39521688974) passed Linux, Windows and macOS against that implementation commit, including the complete installed Console test.
- Independent final review closed with no actionable findings after canonical replay, repeated pause, oversized/empty trace and installed asset checks.
- Local verification through the existing launcher checked authenticated HTTP access, local file availability, the metric empty state and rejection of unauthenticated API access.
- Browser verification checked area workspace navigation, the metric empty state and notices using synthetic fixtures. The temporary preview fixtures were removed after verification.
- Stop condition met: approved scope implemented, reviewed, tested, pushed and available for homologation. This receipt is the documentation-only closing commit; runtime code remains the CI-tested implementation above.
