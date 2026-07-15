# PM-002 — Accounting migration pack

**Programme:** PM — Migration Hub
**Status:** DONE (2026-07-15) — ⚠️ accountant gate ("T + P") applies per project
**Runs on:** PM-001 engine · **Flag:** `migration.hub` · **Migration:** 0042 (shared)

## What this delivers

- **Opening trial balance** (`opening_trial_balance` step): CSV rows are
  resolved against the tenant's chart of accounts by code (unknown codes =
  INVALID; duplicates rejected; one-sided rows enforced). Commit requires an
  `asOfDate`, refuses any invalid row, refuses an unbalanced TB to the cent
  — and posts exactly ONE journal via `postJournal` (period-close guard and
  ledger invariants apply). Rollback posts the reversal journal — history
  is never edited (P2-005/payroll precedent).
- **Open invoices / bills** (`open_invoices` / `open_bills` steps): AR/AP
  open-item registers with contact matching by name. These are memo records
  — their ledger effect is the AR/AP control lines in the TB. Converting
  them to live documents is a recorded follow-up mission.
- **Reconciliation report** `GET /migration/projects/:id/reconciliation`:
  staged vs posted TB totals (recomputed from journal_lines, not trusted
  from summaries), open-item totals by side/currency with match counts —
  this is what the accountant signs.
- **Sign-off** `POST /migration/projects/:id/sign-off` (owner, audited)
  records reviewer name/role/note against the project.

## The accountant gate

Per the master plan, each real migration's reconciliation must be signed by
the engaging accountant before the tenant treats opening balances as
authoritative. The engine records the sign-off; it does not fabricate it.

## Verification highlights (in migration-hub 12/12)

Balanced TB posts one journal and reconciliation matches to the cent;
unbalanced TB rejected at commit with the ledger provably unchanged;
unknown-account TB blocked; TB rollback adds exactly one reversal journal
and total ledger debits still equal credits; open items commit with correct
match counts and totals, rollback deletes the register.

## Follow-ups

- PM-003 CRM/inventory/payroll migration packs (now unblocked).
- PM-004 AI-assisted field mapping (suggest-only).
- Open-item → live document conversion mission.
