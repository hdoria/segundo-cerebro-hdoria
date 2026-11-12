# Reviewable judgments implementation plan

**Goal:** Present the actual delivery before judgment, bind each new decision to the reviewed version, and keep imported history outside the active review queue.

**Architecture:** Existing receipts and the private vault remain canonical. The explicit output endpoint resolves safe journal references and compares the source hash to import evidence; the metadata endpoint never returns note bodies. New judgment writes require the reviewed hash and recheck it before writing. Optional additive receipt evidence preserves compatibility with older receipts.

**Scope:** Judgment evidence/protocol and API, imported-origin classification/read-model counters/notices, judgment drawer and history view, safe local Markdown rendering, protocol schema and regression tests. No new dependencies, external actions or writes to live business notes.

## Acceptance

- [x] A journal import shows its real source note with origin and version status; changed or unavailable historical evidence cannot be approved as the original delivery.
- [x] Native output and matching historical output can be judged only with the hash the user reviewed. Missing/stale evidence is rejected before any judgment is written.
- [x] The receipt records the source reference, SHA-256 and delivery-quality scope, without duplicating private content. Existing receipts remain readable.
- [x] Imported records remain inspectable in a separate history tab and do not inflate pending counts, attention notices or Today.
- [x] Readable Markdown, provenance and clear decision copy work with keyboard, narrow screens and the existing themes. Untrusted HTML and remote embeds are not executed.
- [x] Focused/full tests, privacy/token checks, independent review and synthetic browser verification pass. Final delivery requires integration, CI and serving main on 4782.

## Verification focus

Test source changed between read and decision, imported note changed since ingestion, forged pointer references/hashes, private/symlink/traversal/missing/oversized/binary sources, old receipt compatibility and explicit confirmation scope. Preserve a clear distinction between approving a report and completing its described tasks or applying an external action. Reexecution still requires a separate provider authorization.

**Stop condition:** The user can inspect a real delivery and knowingly judge its version; all migration history remains available without becoming an active approval backlog. Live business content and judgments are untouched during verification.

## Verified behavior

- Full local validation: 111 suites and 223 syntax checks, no failures. The final asynchronous drawer regression also passes the focused UI suite.
- Independent backend and UI reviews completed without remaining blockers.
- Synthetic browser verification covers readable tables/lists, both themes, a 390 px mobile viewport without horizontal page overflow, Escape with focus return, changed imported notes without approval controls, and stale native output rejected before write. Reopening preserves the draft and a subsequent decision records the newly reviewed hash.
- Screenshots in `.impeccable/review/judgment/` use fictitious content only. No live business judgment was written during validation.

## User workflow

1. Open **Julgamento → Entregas novas** and choose a delivery. Read the report, source and version status.
2. Choose **Aprovar relatório**, **Pedir ajuste**, **Rejeitar** or **Propor ação**. Approval assesses the quality of that version of the report. It does not complete the tasks mentioned in it or authorize external actions. Adjustment, rejection and proposed action require a reason.
3. If the file changes before submission, the server refuses the decision. Use **Reabrir entrega**, review the new content and submit again. The comment is retained.
4. Use **Histórico importado** to consult older records. A matching journal hash permits an explicit review; a changed note is presented as current content for consultation, without claiming it is the original delivery. Missing provenance or content blocks judgment.

New decisions contain only the source reference, SHA-256 and delivery-quality scope in addition to normal judgment metadata. Private report bodies remain in the local vault and are read only through the explicit delivery endpoint. Old decisions remain readable; their reviewed version is shown as unrecorded rather than inferred.
