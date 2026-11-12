# Task-manager Console redesign implementation plan

> Execution: isolated worktree, parallel workers with exclusive ownership and fresh independent review. User approved React/shadcn adoption in addition to the reference design request.

**Goal:** finish the approved design specification in ../specs/2026-10-21-task-manager-design.md.
**Architecture:** shared token source and inventory; real React/shadcn renderer over existing domain behavior; local build and installed package; unchanged canonical state/API/security.
**Tech stack:** existing Node20+/G6/esbuild, React/shadcn and Tailwind compiled locally.

## Constraints and review focus

- Reference08a2a2e, basee7ae658; no private-vault content in the fork.
- Actual shared shadcn components across workspaces, not a decorative wrapper.
- No conflicting React/imperative DOM ownership; preserve forms, delegated events and focus.
- No CSP weakening, new external asset requests, unsafe markup or bypassed confirmation.
- No visual literal exceptions disguised as data; document real geometry/data exceptions.
- Preserve clean install/upgrade and meaningful behavioral coverage when old source-slicing tests need adapting.

## Tasks

1. [x] Independent builder check of spec; settle minor implementation details without reopening approved scope.
2. [x] UI worker: genuine shadcn source/provenance, React renderer/component registry, app/shell wiring and behavioral tests. Own console/app.js,index.html,console/ui/**,components.json,package.json/package-lock.json and dedicated React tests.
3. [x] System worker: canonical token file/inventory, migrate authored styles.css and experience.css, token auditor and tests, live catalog styles. Own console/design/**, console/styles.css,console/experience.css,scripts/check-console-tokens.mjs and dedicated token tests.
4. [x] Canvas worker: remove scattered paint/animation/size constants from canvas.js and layout policy in favor of shared tokens; preserve graph semantics/legibility, theme change behavior and focused tests. Own console/canvas.js,console/canvas-layout-policy.js and dedicated Canvas token tests. Coordinate token API with system worker.
5. [x] Root: build pipeline, server explicit asset routing, installer/manifest proof, shared catalog integration, docs/version/provenance, regression/test compatibility. Coordinate all ownership before changes.
6. [x] Build and run focused checks; synthesize desktop/mobile light/dark browser matrix. Independent code/design review; fix findings in owned modules.
7. [x] Full suite/syntax/product/mirror/token checks; commit/integrate/push, native three-platform CI, installed package proof and live4782 homologation preserving its data root. Update docs and stop only on full requirement evidence.

Completion evidence: [delivery verification](../../guides/console-design-verification-2026-10-21.md).
