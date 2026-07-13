# HOTFIX-2026-07-13 — Invoice schema alignment

**Status:** In progress  
**Programme:** Production reliability and finance foundations  
**Type:** Additive production schema repair and deployment compatibility gate  
**Depends on:** P2-002 invoice VAT evidence; existing transactional invoice service

## Incident and evidence

On 2026-07-13 the production `POST /api/v1/invoices` route returned HTTP 500
while an authenticated tenant owner saved a draft. Runtime evidence identified
PostgreSQL error `42703`: the deployed application writes
`invoices.tax_jurisdiction`, but the production table predates the additive
P2-002 invoice tax-evidence columns.

The failed insert ran inside the existing invoice transaction. A production
read confirmed that no draft row from the failed attempt was committed.

## Outcome

Restore draft invoice creation by aligning only the missing additive P2-002
invoice, invoice-line and product tax-evidence columns and constraints. Add a
production build gate that refuses deployment when critical runtime schema is
missing.

This repair does not change tax rates, calculations, invoice lifecycle,
numbering, ledger posting, posted history, balances, tenant permissions or
country determination.

## User and measurable result

- **User:** An authenticated tenant user with invoice-creation permission.
- **Problem:** A valid draft cannot be saved because application and database
  schema versions differ.
- **Result:** A valid draft saves atomically with tenant-derived jurisdiction,
  effective-dated tax evidence and its line items.
- **Measure:** Production schema inspection passes; focused invoice/VAT tests,
  server tests and web build pass; the live route no longer emits the missing-
  column error.

## Finance and trust boundaries

- Tenant identity continues to come from authenticated server context.
- Draft creation continues to validate that the customer belongs to the same
  tenant.
- Exact arithmetic and effective-dated country-pack resolution are unchanged.
- No posted document or ledger row is edited, backfilled or deleted.
- The existing transaction remains the atomic boundary for invoice, line-item,
  audit and post-commit event effects.
- This is technical tax-evidence support, not a claim of filing readiness or
  professional tax approval.

## Scope

1. Add the missing nullable invoice tax-jurisdiction, tax-date and treatment
   evidence columns.
2. Add the missing nullable invoice-line treatment, amount and effective-date
   evidence columns.
3. Add the missing nullable product treatment classification, remove the old
   hard-coded product tax-rate default, and add the bounded treatment checks
   already represented by the application schema.
4. Record the repair as an idempotent repository migration.
5. Expand the production deployment schema check to cover every runtime column
   required by draft invoice creation.
6. Verify production schema, database advisors, transaction rollback evidence,
   relevant automated tests and live deployment logs.

## Out of scope

- New accounting, tax, currency or invoice behavior.
- Editing or reissuing posted invoices.
- Ledger, journal, balance or stock changes.
- New markets, tax registrations, fiscalisation or statutory filing claims.
- Broad schema synchronization or destructive migration commands.

## Acceptance criteria

- This mission pack is committed before implementation.
- The production migration is additive, idempotent and limited to the P2-002
  evidence already required by the deployed service.
- A failed draft leaves no invoice, line item, audit row or number allocation.
- The production build fails clearly if any critical invoice runtime column is
  absent.
- Focused invoice/VAT tests, full server tests, typechecks and web production
  build pass, or any environment limitation is reported precisely.
- Production security and performance advisors are reviewed after DDL.
- Live production runs the reviewed commit and the missing-column error is no
  longer present.

## Rollback

Application rollback is a normal revert of the deployment-gate change. The new
nullable evidence columns remain in place because removing them would be a
destructive operation and could discard invoice evidence. No data rollback is
required; an emergency application rollback may safely ignore the additive
columns.
