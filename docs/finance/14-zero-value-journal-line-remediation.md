# Zero-Value Journal Line Remediation

**Status:** Implemented and verified
**Date:** 2026-07-10

## Outcome

`postJournal()` now rejects a journal line where both debit and credit are
zero. Every posted journal line therefore represents a financial movement.

## Scope

- No historical journal, balance, tax rule, currency rule, or document number
  was changed.
- No journal schema or migration was required.
- Existing valid posting paths continue to use the same transactional posting
  service.

## Control

Before a journal header is inserted, `postJournal()` validates each line:

1. debit and credit must be non-negative;
2. a line cannot contain both a debit and a credit; and
3. a line must contain a non-zero debit or credit.

The enclosing transaction rolls back when validation fails, so no journal
header, journal line, or linked operational record is partially written.

## Evidence

`server/tests/finance/journal-invalid-lines.test.ts` now proves that a
otherwise balanced journal containing a zero-value line is rejected.

## Residual Considerations

This control is service-enforced. The existing append-only database controls
protect posted journals after insertion. Database-level constraints for
per-line debit/credit shape remain a future defence-in-depth improvement and
must be designed without breaking valid reversal workflows.
