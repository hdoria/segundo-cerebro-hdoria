# Usability and selective upstream alignment implementation plan

> **For agentic workers:** use superpowers:subagent-driven-development for implementation and independent review.

**Goal:** ship the approved usability pass first, then selectively incorporate remaining upstream operational fixes and expose fork/upstream versions separately.

**Architecture:** preserve the existing file-based console and vault adapters. Views remain derived from contracts and receipts. Upstream changes are imported selectively against commit `c14c12ec968c2f4350267ec6527dacf313cd29a4`; the replacement panel remains excluded.

**Tech Stack:** Node.js 20+, browser ES modules, CSS tokens, G6 5.1.1, esbuild.

**Spec:** DESIGN.md and the user-approved sequence: Canvas, truthful states, mobile and keyboard; then selective upstream fixes and explicit fork/upstream version metadata.

## Global constraints

- Preserve Geist, neutral surfaces, existing tokens and semantic state colors.
- Keep engine and data roots separate. Tests use synthetic fixtures; no private vault content enters Git or reports.
- Preserve contribution rescanning, schema1 artifact compatibility, Hermes expiration and late-response guards.
- Keep update application manual with tag, preview and approved hash.
- Keep telemetry opt-outs and account access unchanged; endpoint verification uses injected/local transports.
- No new dependency or replacement member panel. Additional area-discovery work remains a separate pending request.
- Existing session authorization covers implementation and final commit, push and integration into main.

## Review focus

1. A declared legacy vault remains usable without claiming a T4 receipt or measured reuse.
2. Canvas graph and inspector never overlap at desktop or 390px; entire-map action includes all nodes.
3. Hidden drawers have no keyboard focus targets and restore focus to the invoker after close.
4. Mobile area selection preserves full names and filtering; Telegram retains a visible accessible control.
5. Missing/malformed version provenance is explicit and never changes update-source authority or reports full parity.

## Task 1: Canvas layout and navigation

**Files:** console/canvas.js, console/canvas-layout-policy.js, console/styles.css, scripts/test-canvas-layout-readability.mjs; a focused behavior test if needed.
**Interface:** mountOperationalCanvas returns existing fit/focus/positions/destroy plus zoomIn/zoomOut. fit means entire graph, while readable initial framing can retain its explicit policy. Resize to actual graph-pane dimensions after layout/sidebar changes.

- [x] Reproduce the overlap and fit behavior with controlled layout/runtime inputs.
- [x] Put graph and inspector in separate grid areas; stack inspector below graph on mobile. Remove obsolete right padding reserved for an overlay.
- [x] Provide bounded zoom controls through the returned controller and a real entire-map fit.
- [x] Run Canvas policy tests and build; verify graph/inspector bounding boxes in browser.

## Task 2: Truthful states, mobile and keyboard

**Files:** console/app.js, console/index.html, console/experience.js, console/experience.css, focused scripts/test-console-usability.mjs and affected existing tests.
**Interfaces:** consumes Canvas zoomIn/zoomOut. Existing API contract remains unchanged; activation.reason_code === vault-declared renders integration/compatibility without a T4 assertion.

- [x] Add failing behavioral cases for vault-declared versus actual T4, mobile area selection, active navigation semantics and drawer lifecycle.
- [x] Compact generic journey cues and preserve prominent actual pending/error actions.
- [x] Add labeled mobile area selector and Telegram glyph/accessible name; set aria-current on active navigation.
- [x] Centralize drawer opening/closing: inert while closed, focus inside on explicit open, restore invoker on close; Escape closes.
- [x] Add explicit Canvas zoom buttons and movement hint using Task 1 interface; communicate Telegram prerequisites where controls are blocked.
- [x] Run focused tests, npm test and independent review of Tasks 1–2 before the next lot.

## Task 3: Selective upstream operational alignment

**Files:** .agents/scripts/activate.mjs, .agents/scripts/ping.mjs; mirrored comecar/arquiteto/atualizar skills; CLAUDE.md, COMECE-AQUI.md, docs/guides/implantacao-assistida.md; scripts/sync-agent-skills.mjs, scripts/validate-product.mjs, .gitattributes; directly relevant portable path/CRLF/packaging functions and tests.

- [x] Diff each candidate against pinned upstream; record intentional exclusions and retain local protections.
- [x] Test stable proxy endpoint defaults with mock transports and opt-out behavior; change no account or telemetry settings.
- [x] Import guidance on existing-root resumption, one sprint, source evidence, credential versus email, first safe update baseline and legacy runtime.
- [x] Adapt instructions to this console's actual launcher; avoid references to excluded panel/cockpit scripts.
- [x] Normalize portable paths/CRLF where upstream fixes apply and ignore Python caches in skill mirror validation; add behavioral regressions.
- [x] Run skill synchronization, product validation, activation, updater preservation and portability tests. Independently review this task.

## Task 4: Version provenance

**Files:** VERSION, .cerebro/upstream-baseline.json, .cerebro/motor.manifest, scripts/lib/brain-update-center.mjs, console/app.js, CHANGELOG.md, docs/guides/upstream-alignment.md and focused update-center tests.
**Interface:** expose motor.fork_version and motor.upstream_baseline independently; the baseline records upstream repo/tag/commit plus selective integration and exclusions. Read it from the engine root, not the private data root.

- [x] Add failing tests for valid, absent and malformed provenance and distinct engine/data roots.
- [x] Set fork version to 1.37.0; retain upstream baseline 1.40.0/c14c12e as selective integration rather than full parity.
- [x] Show fork version, upstream reference and selective status on Updates; document included/deferred capabilities. Keep update source and permissions unchanged.
- [x] Run update-center tests and product validation; independently review provenance semantics.

## Task 5: Integration and delivery

- [x] Build console; run all scripts/test-*.mjs, npm test, syntax checks and whitespace checks.
- [x] Inspect desktop/390px, Canvas scopes, truthful activation, keyboard drawer behavior and mobile navigation using synthetic/public-safe evidence.
- [x] Run mechanical design detector, triage actual regressions without widening exceptions.
- [x] Perform final independent review and resolve actionable findings.
- [x] Commit logical lots, integrate main, push and wait for Linux/Windows CI. Restart homologation on 4782 with the existing data root, and verify HTTP and effective root.
- [x] Stop when tests/reviews/CI pass, main is synchronized and homologation serves the final code with the existing vault binding.
