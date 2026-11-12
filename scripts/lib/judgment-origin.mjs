// Import receipts predate the dedicated reason code. Their deterministic IDs and
// generated output names preserve provenance without rewriting historical receipts.
const JOURNAL_RECEIPT = /^routine-receipt-journal-[a-f0-9]{24}$/;
const JOURNAL_RUN = /^routine-run-journal-[a-f0-9]{24}$/;
const LEGACY_RECEIPT = /^routine-receipt-legacy-[a-f0-9]{24}$/;
const LEGACY_RUN = /^routine-run-legacy-[a-f0-9]{24}$/;
const JOURNAL_OUTPUT = /(?:^|\/)routine-run-journal-[a-f0-9]{24}\.pointer\.md$/;
const LEGACY_OUTPUT = /(?:^|\/)routine-run-legacy-[a-f0-9]{24}\.legacy\.json$/;

export function judgmentOrigin(receipt) {
  if (receipt?.reason_code === 'journal-history-imported'
    || JOURNAL_RECEIPT.test(receipt?.receipt_id || '')
    || JOURNAL_RUN.test(receipt?.run_id || '')
    || JOURNAL_OUTPUT.test(receipt?.output_ref || '')) return 'journal-import';
  if (receipt?.reason_code === 'legacy-history-imported'
    || LEGACY_RECEIPT.test(receipt?.receipt_id || '')
    || LEGACY_RUN.test(receipt?.run_id || '')
    || LEGACY_OUTPUT.test(receipt?.output_ref || '')) return 'legacy-import';
  return 'native';
}

export function isImportedJudgment(receipt) {
  return judgmentOrigin(receipt) !== 'native';
}
