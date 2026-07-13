# P2-003 - VAT Return Report

**Status:** Technically verified; qualified accountant/tax approval pending
**Programme:** 2 - Finance, Tax & Localisation (Zimbabwe)
**Type:** Read-only financial reporting and evidence export
**Depends on:** P2-001 country packs; P2-002 VAT treatment evidence
**Professional gate:** Qualified Zimbabwean accountant/tax approval is required before filing-ready availability

## Outcome

An authorised finance user can select a reporting period and produce a
tenant-scoped VAT technical preview showing output VAT, input VAT, and the net
payable or credit position, with reconcilable CSV and PDF evidence exports.
Every amount is derived from posted journal lines in the tenant's base currency.

The result is explicitly **not a VAT return filing**, ZIMRA submission, tax
advice, or evidence of professional approval. It remains labelled
`technical-preview` and `filingReady: false` until the professional gate is
recorded in a later release decision.

## Current behaviour

- P2-002 snapshots invoice jurisdiction, tax date, treatment, effective rate
  window, and exact line/document VAT evidence.
- Invoice issue posts output VAT to the tenant-owned `VAT_OUTPUT` ledger
  account, and reversals offset posted history without mutation.
- The chart of accounts includes `VAT_INPUT`, but no complete supplier-bill or
  input-VAT operational workflow currently posts to it.
- There is no period VAT report or CSV/PDF VAT evidence export.

## Target behaviour

1. Accept inclusive `from` and `to` ISO calendar dates through zod-validated
   query input. Reject reversed, impossible, or unreasonably broad periods.
2. Derive tenant, actor, base currency, and country code from authenticated
   server context. Clients cannot supply tenant or jurisdiction.
3. Read only posted journal lines in the selected period:
   - output VAT = credits minus debits on `VAT_OUTPUT`;
   - input VAT = debits minus credits on `VAT_INPUT`;
   - net position = output VAT minus input VAT.
4. Preserve reversal signs. Never edit, net away, or omit offsetting evidence.
5. Return evidence rows with journal/date/source/account/debit/credit/impact and,
   where the source is an invoice, its immutable number, treatment,
   jurisdiction, tax date, and snapshotted tax total.
6. Export the same deterministic model as safe CSV and a readable multi-page
   PDF. Exports are tenant-scoped and audited without embedding report data in
   audit metadata.
7. Surface the preview in Reports with period selection, output/input/net
   summaries, evidence rows, empty/error states, and CSV/PDF downloads.
8. State that input VAT is only what is posted to `VAT_INPUT`; absence of a
   supplier input-VAT workflow is a filing-readiness blocker, not evidence that
   recoverable input VAT is zero in the real business.

## Calculation contract

All ledger amounts are PostgreSQL numeric strings converted to integer cents.
No JavaScript floating-point arithmetic is permitted for totals.

For each evidence line:

- `VAT_OUTPUT impact = credit - debit`
- `VAT_INPUT impact = debit - credit`

Aggregate values:

- `outputVat = sum(VAT_OUTPUT impact)`
- `inputVat = sum(VAT_INPUT impact)`
- `netVat = outputVat - inputVat`
- positive net is `payable`; negative net is `credit`; zero is `nil`

The report currency is the tenant base currency because journal lines are
posted in base currency. Original invoice currency remains available in source
evidence but is not added across currencies.

## User and measurable business result

- **User:** Owner, Admin, or Accountant with `reports.read`.
- **Problem:** Posted VAT cannot currently be reviewed by period or exported as
  a coherent evidence set.
- **Result:** The user can reconcile the VAT control accounts and identify the
  technical net position without changing financial history.
- **Measure:** Summary values equal the included signed evidence rows exactly;
  CSV, PDF, and JSON have parity; cross-tenant and invalid-period requests fail
  safely; reversals remain visible.

## Scope

- A typed VAT report domain service over existing accounts, journals, invoice
  snapshots, tenants, and the P2-001 localisation service.
- Authenticated JSON, CSV, and PDF read/export endpoints.
- Reports UI period controls and evidence display using localisation catalogue
  copy.
- Exactness, period-boundary, reversal, empty, tenant-isolation, permission,
  audit, export-parity, CSV-safety, and PDF-rendering tests.
- Finance architecture/current-state, programme status, changelog, and
  completion evidence updates.

## Out of scope

- ZIMRA filing/submission, fiscalisation, return-form field mapping, tax portal
  integration, registration determination, input VAT eligibility, supplier
  bills, AP tax, reverse charge, withholding, out-of-scope supplies, partial
  exemption, capital-goods adjustments, carry-forward, penalties, or refunds.
- A new VAT-return table, mutable return status, filing workflow, sign-off
  record, or duplicate ledger.
- Legal-entity support. Tenant remains the current accounting-entity surrogate
  and this limitation must be displayed and documented.
- Professional tax approval or any filing-ready claim.

## Finance readiness answers

1. **Accounting event:** None; the report is a read-only view of posted events.
2. **Journal:** None; it reads `VAT_OUTPUT` and `VAT_INPUT` lines only.
3. **Legal entity:** Tenant is the current surrogate; multi-entity reporting is
   blocked pending legal-entity architecture.
4. **Currency:** Tenant base currency from posted journal lines; exact cents.
5. **Tax:** P2-001 jurisdiction and P2-002 invoice evidence provide context;
   ledger control accounts determine report totals.
6. **Audit:** CSV/PDF exports record actor, tenant, period, format, and evidence
   count. JSON preview is a read and does not create financial evidence.
7. **Reversal:** Existing reversal journals appear as signed offsetting rows.
8. **Explanation:** Every total reconciles to included journal-line evidence.
9. **AI:** No AI access or authority is introduced.
10. **Permission:** `reports.read` for preview and export.

## Security, privacy, localisation, accessibility, and mobile

- Every query filters both journal and account ownership by authenticated
  tenant. Source invoice joins also require the same tenant.
- Exports contain financial evidence and use private/no-store responses.
- CSV cells are escaped against spreadsheet formula execution.
- New UI copy uses the typed English catalogue. Shona/Ndebele tax terminology
  remains disabled pending native and professional review.
- Period inputs are labelled and keyboard operable. Summary cards stack on
  narrow screens; the evidence table uses controlled horizontal scrolling.
- Empty periods return zero totals and a clear empty state.

## Acceptance criteria

- Mission pack exists before implementation.
- Period input is strictly validated and inclusive at both boundaries.
- JSON, CSV, and PDF totals/evidence reconcile exactly in base currency.
- Output, input, reversals, payable, credit, nil, and empty periods are tested.
- Cross-tenant data and source metadata cannot leak.
- Export permission and audit evidence are tested.
- PDF pages render without clipping, overlap, or unreadable evidence.
- No schema migration or duplicate financial/reporting table is introduced.
- Full guarded database suite, server/web typechecks, and web build pass.
- UI and exports say technical preview/not filing-ready and retain the
  accountant-sign-off gate.

## Rollback

Revert the report service, routes, UI, tests, and documentation. No schema or
stored financial data changes require rollback; export audit rows may remain as
immutable evidence.
