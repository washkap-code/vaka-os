# P2-006 — Completion Report

**Implementation:** Complete for the approved technical-preview scope
**Technical verification:** Complete
**Availability:** Internal technical preview; not filing-ready
**Professional gate:** Qualified accountant review pending
**Completed on:** 2026-07-13

## Delivered

- Strict `from`/`to`/`asAt` calendar-date contract with ordered, bounded periods.
- Corrected trial-balance cutoff: journal lines after the selected as-at instant
  can no longer enter account totals through a left join.
- One exact base-currency posted-ledger pack containing trial balance, P&L,
  balance sheet, AR control/invoice-source ageing and supported PO-source AP.
- Exact minor-unit TB, P&L and balance-sheet tie-outs; AR/AP schedules preserve
  unsupported control amounts as visible unallocated reconciliation exceptions.
- Versioned, private/no-store JSON plus formula-safe CSV and deterministic multi-
  page PDF exports using the same report snapshot contract.
- Minimised kernel audit-facade evidence for every CSV/PDF export; report rows,
  customer/vendor names and financial contents are excluded from audit metadata.
- Verified-JWT tenant scope, `reports.read` enforcement and zod validation on all
  three endpoints.
- Responsive Reports workspace preview with labelled period/as-at inputs,
  summaries, AP coverage warning and typed English catalogue copy.
- Explicit `TECHNICAL_PREVIEW`, `notFilingReady: true`, provisional tenant scope,
  incomplete AP open-item coverage and professional-review blocker evidence.

## Verification evidence

- Guarded local `vaka_test` preparation, including schema, finance controls and
  reference-data seed: passed.
- Focused P2-006 DB-backed suite: 1 file / 3 tests passed.
- Full server DB-backed suite from a freshly prepared database: 63 files / 210
  tests passed, 0 failures, 0 skipped.
- Server typecheck: passed.
- Web typecheck: passed.
- Web production build: passed.
- `git diff --check`: passed.
- Representative PDF: valid PDF 1.4, 2 letter pages, no encryption, forms,
  JavaScript or suspect objects. Both rendered pages were visually inspected;
  columns, warnings, section transitions and page numbers were legible with no
  clipping or overlap.

## Migration and production boundary

- No migration was added. P2-006 reads existing tenant, account, journal,
  invoice, contact and purchase-order evidence only.
- No operation targeted production or the shared Supabase project. Database
  preparation/reset affected only the disposable, guard-verified local
  `vaka_test` database.

## Open release and architecture gates

1. Qualified accountant review, approved fixtures and a release decision remain
   mandatory before statutory, audited-statement or filing-ready claims.
2. Tenant remains a provisional reporting scope; a canonical LegalEntity model,
   multi-entity dimensions and consolidation are not implemented.
3. AP lacks supplier bills, due dates/payment terms, allocations, payments and a
   complete open-item subledger. The pack ages supported PO receipt sources by
   source date and exposes all remaining AP control balance as unallocated.
4. Cash flow, notes/disclosures, comparative periods, period close/lock,
   retained-earnings close and original-currency statutory presentation remain
   outside this mission.
5. ChiShona and isiNdebele finance terminology remains disabled pending
   qualified native-language and professional review.

## Rollback

Revert the pack read model, export renderers/routes, trial-balance cutoff fix,
Reports UI/catalogue changes, tests and documentation. Existing report routes
remain available. There is no schema or report data to roll back; immutable
export audit rows may remain as historical evidence.
