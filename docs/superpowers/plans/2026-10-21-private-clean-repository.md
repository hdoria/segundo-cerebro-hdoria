# Private clean repository implementation plan

**Goal:** Keep the current product code in a new private repository without importing the previous repository's Git objects or business fixture data.

**Architecture:** Export only reviewed tracked files into a fresh Git repository. Preserve licenses and upstream provenance, use fictional test data, and check tracked snapshots and pushed commits locally and in CI. Keep the former repository private and archive it after verifying the replacement.

**Scope:** Two vault test fixtures; privacy checker and regression tests; pre-push hook; CI/package commands; repository operating documentation. No writes to the business vault.

## Acceptance and stop condition

- [x] Replace business identifiers and financial examples with fictional fixtures; both affected suites pass.
- [x] Add a checker with redacted diagnostics, regression coverage, and a hook checking every introduced commit.
- [x] Review tracked source and packaged artifacts independently; run the product checks and test suites.
- [x] Create a standalone private repository with a single reviewed initial commit and no inherited branches, tags or objects.
- [x] Verify a fresh remote clone and enable the local push hook.
- [x] Archive the former private repository and make the replacement the working development checkout.
- [x] Submit a private GitHub Support request concerning the former public fork-network objects, or document the exact authentication/external blocker with a prepared request.

Evidence: [migration verification](../../guides/private-repository-verification-2026-10-21.md). Support request 4887047 is open; actual public object removal remains an external dependency.

## Verification focus

The scanner must inspect pushed refs rather than only unstaged files, catch a sensitive intermediate commit even after a later removal, allow deletion refs, and fail on Git/scanner errors. It must not print matched values. Binary/package review is separate from the text guard. No old Git metadata, runtime credentials, private notes or ignored files may enter the new repository. GitHub Support removal is not complete until public object access is actually gone.
