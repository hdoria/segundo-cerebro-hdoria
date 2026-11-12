# Plate notes implementation plan

> **For agentic workers:** parallel ownership for file persistence and Markdown conversion; root owns UI and integration. Use test-first changes and independent final review.

**Goal:** Read formatted notes and explicitly edit/save them through Plate while Markdown remains canonical.
**Architecture:** A versioned local file API performs authorized atomic compare-and-save. A Plate Markdown adapter separates immutable metadata and preserves unsupported syntax rather than normalizing it away. A React note workspace owns local drafts and navigation guards; the existing Console remains the host.
**Tech Stack:** Node ESM, React/shadcn, Plate 53, existing design tokens and local bundles.
**Spec:** `docs/superpowers/specs/2026-10-21-plate-notes-design.md` (user approved behavior in chat).

## Global constraints

- Synthetic notes only in tests/previews; no real note writes, model calls or schedule changes.
- Preserve YAML, BOM/EOL, wikilinks/comments/AI markers. No edit means no rewrite; no silent unsupported loss; no MDX persistence.
- Keep private read gates, 512 KiB bound, symlink/path protection, session/origin/CSRF/explicit Save and optimistic conflict detection.
- Existing theme/tokens only. Unsaved navigation guards, request identity and accessible mobile controls.

## Review focus

- Source changes between read and Save; concurrent saves and filesystem identity changes.
- Unknown Markdown, malformed frontmatter/comments, wikilinks with aliases/headings, tables and nested lists surviving edits.
- Private/hidden files, unsafe URLs and raw HTML never executing or loading remote private embeds.
- Stale reads/saves after navigation; dirty close/Escape/refresh retaining drafts or explicitly discarding.
- Build/runtime packaging and Linux/macOS/Windows parity with no node_modules required to run Console.

## Task 1: Versioned local file persistence (worker)

Files: `scripts/lib/local-file-browser.mjs`; new `scripts/test-local-note-edit.mjs`.
Interface: `readLocalFile(root,ref)` adds `sha256`; `saveLocalFile(root,{ref,expected_sha256,text})` returns same read shape. Validate explicit full note bytes, immutable original frontmatter and AI marker sequence, visibility/path/size; capture and verify the current source before exclusive publication; retain displaced versions privately. Errors are safe domain codes; source conflict must be distinct. No writes on no-op.

- [x] Write failing tests for save, stale version, concurrent reentrant saves, malformed/private/unsafe paths and exact no-op/frontmatter/markers/EOL protection.
- [x] Implement with existing canonical resolver and bounded reads, durable private recovery files, checked identity/hash and per-target exclusion.
- [x] Run browser/read-model regression and independent security review.

## Task 2: Plate conversion (worker)

Files: new `console/ui/note-markdown.js`, new `scripts/test-note-markdown.mjs`; owns package.json/package-lock.json and local dependency setup.
Interface: `createNoteDocument(text)` returns `{value,properties,editable,reason,...}` opaque adapter state; `serializeNoteDocument(document,value)` returns full Markdown string; `createNotePlugins()` used by the editor. Exact final names may be reported before UI integration. Real Plate conversion with headless fixtures; retain raw text for untouched content and protect YAML/comments/wikilinks; unsupported syntax is preserved or explicitly blocks visual editing, never dropped.

- [x] Pin compatible Plate packages, isolate dependency directory from other worktrees.
- [x] Write failing round-trip/body-edit tests (YAML/BOM/CRLF, comments/markers, wikilinks, nested lists, code/table/HTML/unsupported nodes).
- [x] Implement adapter and verify fixtures including one targeted edit with preserved surrounding data.

## Task 3: Note workspace and integration (root)

Files: new React note workspace, existing UI entry/app/CSS/tokens if necessary, console server + new API/controller tests, build/cache/validation manifest.
- [x] Integrate authenticated file Save and wikilink resolve API; test unauthorized/CSRF/origin/conflict and no-op behavior.
- [x] Formatted read view/properties, Plate editing controls, original source, explicit Save/Cancel and conflict state with retained draft.
- [x] Guard leaving unsaved notes, stale loads/saves and beforeunload. Comfortable expandable/large reading surface and mobile layout.
- [x] Build, run full tests/token/privacy checks and validate synthetic desktop/mobile/light/dark read-edit-save-conflict-cancel flow.

## Task 4: Delivery

- [x] Independent clean-context security/integration review; resolve material findings.
- [x] Conventional commits, merge/push private main, verify CI.
- [x] Restart 4782 against same vault; verify new code served and real note/judgment hashes unchanged.

**Stop condition:** The approved read/edit/save flow works with Plate and preserves the real vault unchanged during verification.

## Verified implementation decisions

- Plate loads in its own local lazy bundle when opening a note. The existing main UI bundle stays at about 355 KiB and remains compatible with the current Node-rendered tests. The lazy note bundle is about 2.3 MiB: dependency identifiers stay readable to avoid accidental collisions with the privacy guard, while syntax and whitespace are minified. The guard is unchanged.
- Files remain canonical Markdown. Properties are read-only; unsupported syntax stays in protected raw islands. Real Plate normalization is included in the original baseline so entering/leaving editing never rewrites a note.
- Saves capture the prior inode in private durable recovery storage and publish exclusively, instead of overwriting an externally recreated file. Crash recovery restores only an absent destination and never guesses a merge. Retained versions also preserve writes through old open handles. Recovery-required messaging explicitly says the note may already contain the proposed version and requires manual inspection.
- Wikilink resolution fails closed on incomplete scans. Navigation checks the current draft after asynchronous resolution; stale responses cannot discard a newer draft.

## Verification evidence

- Full local run: 123 test suites and 237 module syntax checks, zero failures (`/tmp/cerebro-plate-full-check.log`). Latest focus/controls changes additionally passed the actual React/Plate SSR and real Slate insertion regression, session tests and token audit.
- Independent security review found no remaining material issues after concurrency, conversion and navigation fixes. Reviewer reran note workspace/session/file persistence suites independently.
- Synthetic browser preview: formatted desktop dark/light reading, properties/source separation, wikilink navigation, typing and bold toolbar, task Save, unchanged Save preserving hash/inode/mtime, Cancel retaining/discarding draft, external file conflict and a single explicit Reload confirmation.
- At 390 × 844: reading/editing fit without horizontal overflow; toolbar targets are 44px. No browser errors or warnings. Entry focuses editable text even with preserved void blocks at the document boundaries.
- Review screenshots contain fictional notes only and are kept as review artifacts under `.impeccable/review/plate-notes/`.

Delivery commands, CI and the live restart are verified after committing this implementation; their final result is reported in the task response.
