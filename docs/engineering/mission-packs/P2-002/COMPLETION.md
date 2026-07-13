# P2-002 — Completion Report

**Implementation:** Complete for the approved VAT treatment scope
**Technical verification:** Complete
**Availability:** Internal foundation; not approved for market release
**Professional gate:** Qualified Zimbabwean accountant/tax approval pending
**Completed on:** 2026-07-13

## Delivered

- Tenant jurisdiction and invoice tax-date snapshots derived on the server.
- Line classifications for standard-rated, zero-rated and exempt supplies,
  with effective rate-window and exact line-tax evidence.
- Document classification for uniform or mixed invoices.
- Effective-dated standard-rate resolution through the P2-001 country pack;
  supplied legacy percentages are compatibility assertions, never authority.
- Exact integer-cent totals and ledger parity: VAT Output is posted only for
  the aggregate taxable amount, while every journal remains balanced.
- Immutable invoice-document v2 snapshots and PDF treatment explanations.
- Product creation and CSV import treatment selection using the same governed
  country-pack resolution, with no statutory rate default in core schema.
- English localisation catalogue entries for new UI labels. Shona and Ndebele
  tax terminology remains gated for native/professional review.
- Additive schema and migration evidence preserving historical rows as
  unclassified rather than inventing treatment history.

## Verification evidence

- Guarded local test database preparation: passed.
- Focused VAT/localisation/document/import/event suite: 5 files / 17 tests passed.
- Full server database-backed suite: 55 files / 178 tests passed, 0 failures.
- Server typecheck: passed.
- Web typecheck and production build: passed.
- `git diff --check`: passed.

## Migration and production boundary

- Added `server/drizzle/0015_vat_treatment_model.sql` with additive evidence
  columns and checks; it removes the legacy product-rate default without
  rewriting stored values.
- Historical invoices and products are not assigned invented treatments.
- The migration was applied only to the isolated local test database through
  guarded preparation.
- No `db:push`, migration, or schema mutation was run against the shared
  production Supabase project. Production application requires separately
  authorised, reviewed additive SQL.

## Open release and architecture gates

1. Qualified Zimbabwean accountant/tax review and approved fixtures are still
   required before this behaviour is marketed or enabled as compliant VAT.
2. Tenant remains the current legal-entity surrogate; legal-entity isolation
   remains a blocking architecture gap for multi-entity finance.
3. VAT returns, input VAT/AP tax, fiscalisation, reverse charge, withholding,
   out-of-scope treatment and exemption-document evidence remain future work.
4. Shona and Ndebele financial terminology requires qualified native review.

## Rollback

Revert the P2-002 application changes. New nullable evidence columns may remain
dormant; do not drop or rewrite evidence-bearing rows without a separately
approved retention and migration plan.
