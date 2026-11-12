# Brain explore implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development; independent ownership below and final clean-context review.

**Goal:** Implement approved search/backlinks, resizable panes and explicit attachment preview.
**Architecture:** Extend bounded local Markdown resolver; derive references in memory; reuse authenticated routes and note session guards. Keep panel preferences numeric/browser-local and attachments lazy in a Dialog.
**Tech Stack:** Node, React/shadcn, Plate, existing Markdown tooling, CSS tokens.
**Spec:** docs/superpowers/specs/2026-10-21-brain-explore-design.md

## Global constraints

- No new dependencies, model calls, uploads or changes to real vault notes.
- Preserve root, visibility, symlink, auth/CSRF and Save/conflict protections.
- Search snippets only for explicit content query; binary max20MiB and validated MIME/signature.
- Layout preferences contain only finite numeric dimensions; all visual values use tokens.
- No creation/property editing. Stop when all three approved features work and are reviewed, tested, published and served locally.

## Review focus

Private/code/comment links cannot create false backlinks or grant binary access. Duplicate note basenames cannot invent a target. Stale responses cannot replace a new note or draft. Attachment declarations and bytes are revalidated when opened. Narrow screens and malformed storage cannot make reader unusable.

### Task 1: Local search, references and safe attachment access

Own scripts/lib/local-file-browser.mjs and new focused backend modules/tests. Expose list search:title|content (legacy title default), listLocalFileBacklinks(root,{ref,offset,limit}), listLocalNoteAttachments(root,{from_ref}), readLocalNoteAttachment(root,{from_ref,target}). Backlinks return metadata+complete/total/pagination; attachments return safe name,target,mime,bytes and read returns validated Buffer/mime/name. Source links must resolve unambiguously with bounded scan. Test body-only queries, accents, exclusions/partial scans, Markdown/wiki links, ambiguity, traversal/symlink/private files, oversized/forged binaries and changed source. Do not edit server/UI.

- [x] Add failing tests, implement, run focused regression tests and report exact interfaces.

### Task 2: Resizable panel layout

Own new console/ui/library-layout.jsx and console/ui/library-layout.js plus tests and canonical token entries. Export LibraryPanelLayout({state,children}) wrapper around three panes; owns layout-only preferences and separators. Do not edit library-workspace.jsx/CSS; provide CSS in new console/library-layout.css and integration instructions. Keyboard arrows/Home/End and pointer capture, minimum sizes, persistence allowlist, restore, collapse/expand and <=1280/720. No draft/session changes.

- [x] Add failing layout-state tests, implement, verify limits/storage/keyboard semantics.

### Task 3: Root integration and related-content UI

Root owns console-server.mjs, app.js, library-session.js/workspace.jsx and CSS, new note-relations.jsx/CSS, build entry, registration/docs/tests. Wire authenticated endpoints; binary response/no-store/MIME headers and range handling if necessary. UI search-mode selector and snippet; lazy backlinks/attachments for selected note; explicit preview Dialog uses current source ref. Backlink opens through controller.openNote, no automatic preview. Ignore stale responses and refresh after Save without replacing draft.

- [x] Integrate interfaces; tests auth, metadata isolation, stale results and preservation.
- [x] Browser synthetic dark/light, body-only search, backlinks, PDF/image, private denial, drag/keyboard/reset/reload, tablet/mobile, drafts.
- [x] Independent review, fix material findings, build/token/privacy/test checks.
- [x] Commit, merge/push main, update server4782 and verify live hashes/HTTP and clean Git.

## Evidence before publication

131 suites and 248 module syntax checks passed. Tokens:553/39 authored sources. Installed release passed without node_modules. Independent backend and UI reviews approved after fixes to canonical backlink resolution, bounded reads and dirty shortcut guards. Browser QA used fictitious notes only. Post-commit deployment/CI evidence is recorded in the task response.
