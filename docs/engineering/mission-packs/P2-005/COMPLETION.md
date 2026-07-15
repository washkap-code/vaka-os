# P2-005 — Financial period close — Completion report

**Branch:** `feature/p2-005-period-close` (off `main` after the P4-004/OPS-016/P7-002 consolidation)
**Status:** Implementation complete; all local gates green. **Accountant gate:** technically verified only — a qualified Zimbabwean accountant must approve the close workflow before it is presented as part of an audited month-end procedure.

## Outcome

A tenant can close a completed month so no journal posting dated inside it can
be created — invoices, payments, expenses, stock effects, procurement, bank
reconciliation and manual journals all flow through `postJournal`, which fails
closed on a closed period inside the posting transaction. A database trigger
enforces the same rule beneath the application boundary. History is never
edited: corrections are posted as offsetting entries dated in an open period.
Reopening is restricted to the accountable Owner and fully audited.

## Files changed

| File | Change |
| --- | --- |
| `server/drizzle/0034_accounting_period_close.sql` | New: `accounting_periods` table + `journal_entries_period_lock` BEFORE INSERT trigger (idempotent, additive) |
| `server/src/db/schema.ts` | `accountingPeriods` table with month/status/reopen-state CHECKs |
| `server/src/accounting-periods.ts` | New: `assertPeriodOpen`, `closeAccountingPeriod`, `reopenAccountingPeriod`, `listAccountingPeriods` (UTC month arithmetic) |
| `server/src/accounting.ts` | `postJournal` calls `assertPeriodOpen` first — one funnel covers every financial effect |
| `server/src/routes.ts` | `GET /accounting/periods` (accounting.read), `POST /accounting/periods/close` (accounting.post), `POST /accounting/periods/:id/reopen` (accounting.post + Owner) |
| `server/scripts/check-runtime-schema.mjs` | Runtime readiness for the new table |
| `server/tests/finance/period-close.test.ts` | New suite (6 tests) |
| `web/src/App.tsx` + `web/src/locales/app.en.ts` | "Period close" tab in Reports: close form, audited reopen, accessible table, technical-preview notice |

## Behaviour rules

- Only completed past months can close (current/future months refused).
- Closing an already-closed month: 409. Reopen of a non-closed period: 409.
- Reopen requires the accountable Owner (P9-009 identity invariant), never a
  role-name lookalike. Step-up is deliberately NOT applied (P9-011 excludes
  finance routes during the finance audit phase).
- Audit events: `accounting.period_closed` / `accounting.period_reopened` with
  month + reason; no financial values in metadata.
- Month boundaries are UTC, matching journal `date` storage.

## Production migration (hand-apply BEFORE the code deploys; never `drizzle-kit push`)

Apply `server/drizzle/0034_accounting_period_close.sql` exactly as committed
(new table + trigger + role revokes; an empty table locks nothing, so the
currently deployed build is unaffected).

## Test evidence (scratch embedded Postgres)

- `tests/finance/period-close.test.ts`: **6/6** — migration idempotency (applied twice), posting funnel lock (manual journal + expense route) with offsetting-correction acceptance, raw-SQL trigger defence, current/future/double-close refusals + auth gates, Owner-only audited reopen with tenant isolation and re-close round trip, UTC boundary unit check.
- Full finance suite green after the `postJournal` hook: journal balancing/idempotency/immutability/invalid-lines, tenant isolation, inventory valuation, stock ledger, FX snapshots, bank reconciliation, invoice/statutory/VAT/report snapshots (41 tests), plus `critical`, invoice documents, supplier bills, procurement lifecycle, bank matching (25 tests).
- Server + web typecheck clean; web production build, accessibility, design-token and shell gates green.
