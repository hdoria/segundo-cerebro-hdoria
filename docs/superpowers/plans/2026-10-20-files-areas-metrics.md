# Files, areas and existing metrics implementation plan

> **For agentic workers:** use superpowers:subagent-driven-development or executing-plans, with independent verification.

**Goal:** make declared areas visible and actionable, add local Markdown browsing/title search and existing business indicators, simplify opening and broaden native CI.

**Architecture:** keep the effective brain root separate from engine code. Authenticated read-only JSON APIs derive metadata from local files; explicit opening uses a shared safe resolver and escaped text. Reuse the existing Console, tokens, drawers, contracts and area identity. Preserve the existing uncommitted area-catalog patch by applying it in this managed worktree; never overwrite external changes at integration.

**Tech Stack:** existing Node20+ HTTP/ES modules and vanilla browser UI/CSS; no new dependencies.

**Spec:** user's approval of files/search, metrics from existing definitions, launcher and full CI; reported area discovery/click bugs; DESIGN.md.

## Constraints and acceptance

- Declared area notes and System operating areas form one catalog; an area without a System is declared with zero references. Existing area notes are read without recreation or migration.
- Selecting sidebar/mobile area or an area card opens its context: own note, declared related projects/files, Systems, useful empty states. Selection must be visible from Today too.
- Browser lists safe Markdown metadata only, folder breadcrumbs and bounded title search; explicit file opening renders escaped text locally. Private frontmatter, hidden/credential/runtime directories, absolute/traversal and symlink paths remain inaccessible. Revalidate on every read; session required. No raw HTML, external media, network sync or execution.
- Only existing, explicit business metric definitions/readings. Preserve definition/source/unit/period/goal/history when available; absent reading is null, not zero. No invented indicators or connectors. User chose existing indicators.
- Launcher opens this Console with explicit data root; --no-open and chosen port work, no telemetry/install side effects.
- Linux, Windows and macOS execute the full suite. Existing pinned upstream fixture fetches remain available; no masking functional failures.
- No private content in Git, test fixtures or reports. Current source checkout's three dirty files are snapshotted in /tmp and will be reconciled only if unchanged externally.
- User authorization covers this lot and standard personal-repo commit/push/main closure. No redundant approval gates.

## Task1: area catalog and behavior

Files: existing patch scripts/lib/console-read-model.mjs, vault-today.mjs, test-vault-system-contract-sync.mjs; area UI in Task3.
- [x] Preserve supplied patch; test real declared areas without Systems using synthetic fixtures.
- [x] Diagnose running API versus fresh module and private root; do not equate stale process with missing data.
- [x] Review discovery/privacy edge cases and fixes; integrate without reverting external edits.

## Task2: read-only file API

Files: new scripts/lib/local-file-browser.mjs, scripts/console-server.mjs, new scripts/test-console-local-files.mjs.
Interface: listLocalFiles(root,{directory='',query='',area='',type='',offset=0,limit=50}) => {available,directory,parent_ref,folders:[{ref,name}],files:[{ref,title,type,updated,area_refs}],total,offset,limit}; readLocalFile(root,ref) => {ref,title,type,text,bytes}. GET /api/local-files?dir=&q=&area=&type=&offset=&limit= and /api/local-files/content?ref= under existing session. area matching uses explicit belongs_to/related_to metadata and own area note. Directory refs are brain-relative. Both calls share authorization, bounds and privacy checks.
- [x] RED tests real HTTP session, list/title-only query, area-related projects, new notes on refresh, pagination and explicit escaped payload.
- [x] RED denied direct/open and list for traversal, private, symlinked roots/parents/files, hidden/credential names, invalid UTF8/NUL/oversize and stale private changes.
- [x] Implement minimal safe reader and routes; integrate metrics route from Task4 interface once communicated.
- [x] GREEN focus tests and existing console/privacy/layout suites.

## Task3: Console area, files and indicators views

Files: console/app.js, console/index.html, console/styles.css, focused UI behavioral tests. UI worker owns all UI edits.
- [x] RED area sidebar/card/mobile action tests plus file selection/load/error/stale reply tests.
- [x] Area workspace displays related file/project links and existing Systems; global reset remains clear; aria-current consistent.
- [x] Add Arquivos view with folder navigation, title search, type/area scope, loading/error/empty/pagination and explicit drawer opening.
- [x] Add Indicadores view from Task4 API, separating business indicators from engine health. Display existing data or honest missing definitions/readings.
- [x] Preserve keyboard/mobile behavior and drawer return focus; no private title reveal by default.
- [x] GREEN behavioral tests and actual desktop/390px browser review with synthetic fixtures.

## Task4: existing metrics adapter

Files: new scripts/lib/business-metrics.mjs and focused tests. Coordinate API shape with Task2/3 workers before editing their files.
- [x] Inspect pinned upstream metric source contract/format and active-root metadata only; reuse rather than invent another truth store.
- [x] RED fixtures for defined+measured, defined+unmeasured, malformed/missing/private data, area scope and source/history provenance.
- [x] Implement read-only bounded adapter for actual formats; no new indicators, writes, collection or connections.
- [x] GREEN tests. Report count/availability only for actual private root; never print values/content.

## Task5: launcher and CI

Files: new scripts/console.mjs and launcher test; .github/workflows/ci.yml; documentation of command.
- [x] RED command parsing, no-open, port/root, browser invocation via injected seam and no dependency/telemetry behavior.
- [x] Implement launcher using existing server, explicit root and platform browser opening; startup errors sanitized.
- [x] Full-suite matrix Linux/Windows/macOS preserving fixture fetch and UTF8; fix only real cross-platform issues discovered, research first after failed implementation.
- [x] Verify launcher HTTP with synthetic root and focused checks.

## Task6: integration and delivery

- [x] Independent functional/security/design review and all actionable findings resolved.
- [x] Build, product/mirror validation, all scripts/test-*.mjs, syntax and diff checks; no external dependencies in tests.
- [x] Commit logical changes, reconcile original dirty patch safely, fast-forward main/push and full native CI green.
- [x] Restart homologation4782 with same existing root; independently verify new areas, actionable area view, file and metric APIs and version.
- [x] Stop when final code is served, main synchronized, checks/reviews pass; leave no private vault edits.

## Verification evidence

- Final local pass: 98 test suites and 203 syntax checks, zero failures.
- Console bundle built; product validation and 39 portable skill mirrors passed.
- Independent backend and UI reviews resolved all reported findings.
- Synthetic browser checks: area navigation, escaped note text, title search and keyboard drawer return; 390px layout without page overflow.
- The source checkout committed the original area patch as c48179b while this work ran. Its three file hashes exactly match the initial preserved snapshot; the implementation branch now builds on that commit without overwriting external work.

### Native CI follow-up

- First full native run39510243759: Linux and macOS passed; Windows exposed protocol refs using native separators, metric realpath API spelling differences and a preload fixture passed as a raw path.
- Serialize existing vault protocol refs with POSIX separators; use the case-preserving legacy realpath API for metric equality checks while retaining symlink and inode guards; convert the test preload with pathToFileURL and exercise space/fragment escaping. No suites are skipped.
- Independent local verification covered area discovery, file metadata and metric registry handling; fork1.38.0, upstream selectivev1.40.0.

- Second native run39510805987 confirmed all earlier Windows fixes; two memory-index path assertions identified one remaining native join at the final projection. The projection now preserves POSIX refs too; its three focused suites pass locally.

## Delivery receipt

- Implementation commit: `875953eb0da1d617d6f9381247c4404b41bbfe04`.
- [Native CI39511282309](https://github.com/hdoria/cerebro-hdoria/actions/runs/39511282309): complete suite passed in Windows, macOS and Linux.
- Local verification covered the launcher in no-open mode, actionable area navigation, file metadata availability and metric registry behavior.
- Main is synchronized; private vault files were not edited. Stop condition met. This closing change records evidence only.
