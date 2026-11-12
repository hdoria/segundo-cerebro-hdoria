# Routine draft and destination correction

Goal: prevent invalid file destinations from consuming provider work and make the daily a readable private draft before any business note is applied.

Scope: destination validation/runtime ordering, read-model readiness, Claude read-only invocation, clear run confirmation, synthetic regression coverage and the owner's daily Routine source configuration. No dependency changes. No real provider execution or journal mutation during verification.

Acceptance verified:

- Invalid local-file directories, non-directory parents and symlinks deny execution before connector/provider, collector or model work. Valid private regular files and new nested file paths still work.
- The same destination validation suppresses misleading Run/activation actions. Readiness and activation evidence require the current routine version.
- Read-only Claude execution uses plan mode and limits built-in tools to Read/Glob/Grep. The `padrao-da-conta` marker omits the model flag; explicit model choices are retained. See [official CLI reference](https://code.claude.com/docs/en/cli-reference) for tools versus permission allowances.
- The owner's daily source note moves to version 0.1.1, read-only permission and runtime-output. Its dedicated instruction requests the full Markdown report in the response. The old write request is removed and its grant revoked. Generated contracts are rebuilt from the source note. Existing journal notes and historical run receipts remain canonical.
- The UI says “Pronta para execução manual”, explains that a draft is separate from vault notes and distinguishes report approval from applying content. The confirmation still requires an explicit run decision.

Validation: 112 local suites and 224 syntax checks passed. Final current-version readiness regression and relevant Console tests passed afterward. Independent code review and synthetic browser verification completed. The screenshot under `.impeccable/review/routine-draft/` contains fictional data. The confirmation was cancelled; no provider was invoked through the browser.

Operational boundary: this changes the Console's daily contract only. The Console agenda remains disabled. It does not modify a separate external cloud schedule. Applying an accepted report to the journal remains a separate explicit action; report approval is not an implicit file write.

Stop condition: a manual daily can produce a separate reviewable draft under the existing Runtime contract, and invalid file destinations cannot reach the provider. Integrate and serve the reviewed code on port 4782, preserving the private vault and its history.
