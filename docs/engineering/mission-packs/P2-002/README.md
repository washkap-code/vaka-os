# P2-002 — VAT Treatment Model

**Status:** Implemented and technically verified; professional approval pending
**Programme:** 2 — Finance, Tax & Localisation (Zimbabwe)
**Type:** Financial domain change (additive schema + invoice calculation)
**Depends on:** P2-001 (merged)
**Professional gate:** Qualified Zimbabwean accountant/tax review required before market release

## Outcome

Finance users can classify every invoice line as standard-rated, zero-rated, or exempt and receive an explainable document-level VAT result without entering or hard-coding a statutory rate. Standard VAT is resolved from the tenant's effective-dated country pack; zero-rated and exempt lines remain distinct evidence even though both calculate zero tax.

Success is evidenced by calculation, persistence, document snapshot, ledger-parity, tenant-isolation, API-validation, migration, and rollback tests. This mission is an internal foundation until professional approval is recorded.

## Current behaviour

- Invoice input supplies a free-form `taxRate` for every line and the API defaults it to the literal value `15`.
- Invoice and product routes contain launch-market VAT defaults outside the country pack.
- `invoice_line_items.tax_rate` snapshots a percentage, but no treatment, jurisdiction, effective date, line tax amount, or rate-window evidence is stored.
- `invoices.tax_total` stores the aggregate tax, but the document cannot explain whether a zero amount was zero-rated, exempt, or simply entered as zero.
- Issuing an invoice correctly posts Accounts Receivable, Sales, and VAT Output atomically; that verified posting behaviour must remain unchanged for standard-rated parity.

## Target behaviour

1. Tenant jurisdiction is stored as a stable country code and is derived on the server; clients cannot choose another tenant's jurisdiction per invoice.
2. New invoice lines accept `taxTreatment` (`standard`, `zero-rated`, or `exempt`).
3. The Platform Kernel localisation service validates the treatment and resolves the effective-dated standard rate for the invoice tax date.
4. A supplied legacy `taxRate`, when present during compatibility transition, must exactly match the country-pack result and is never authoritative.
5. Each new line snapshots treatment, resolved rate, tax amount, and the applicable rate window. The invoice snapshots jurisdiction, tax date, and a document treatment (`standard`, `zero-rated`, `exempt`, or `mixed`).
6. Issued invoice document evidence includes those snapshots. Standard-rated invoices preserve existing totals and journals; zero-rated and exempt lines create no VAT Output amount; mixed invoices post only the sum of taxable lines.
7. Existing rows are preserved. The additive migration does not invent treatment evidence for historical records that pre-date the model.

## User and measurable business result

- **User:** Owner, Admin, or Accountant with `accounting.post` permission.
- **Problem:** A raw percentage cannot explain tax treatment and allows statutory rates to be supplied outside governed configuration.
- **Result:** Every new invoice has deterministic, reviewable VAT evidence and the ledger agrees with the line/document calculation.
- **Measure:** All approved fixtures and parity tests pass with exact cent arithmetic; invalid treatments/rates fail before any invoice, line, journal, stock, number, or audit effect is committed.

## Scope

- Additive tenant, invoice, and invoice-line schema fields plus a versioned SQL migration.
- Country-pack treatment validation and deterministic tax resolution.
- Invoice API/domain calculation, persistence, audit metadata, and immutable document snapshot changes.
- Invoice-entry treatment selection and localisation-ready English catalogue entries; no Shona/Ndebele financial terminology is enabled without native/professional review.
- Tests for standard parity, zero-rated, exempt, mixed, effective dates, rounding, invalid input, ledger balance, tenant isolation, and migration expectations.
- Update the Zimbabwe country-pack register, finance risk/current-state evidence, programme status, changelog, and completion report.

## Out of scope

- VAT return reporting (P2-003), fiscalisation, input VAT/AP tax, reverse charge, withholding, out-of-scope treatment, exemptions evidence documents, product/customer rule automation, legal-entity architecture, or editing issued invoices.
- Professional tax approval or a production-availability claim.
- Production database push. The shared `vaka-platform` database must receive only the reviewed additive SQL by a separately authorised operator.

## Finance readiness answers

1. **Accounting event:** Draft creation stores tax evidence; issue remains the existing invoice revenue event.
2. **Journal:** Dr Accounts Receivable for total; Cr Sales for net; Cr VAT Output only for the resolved aggregate tax amount. Every journal must balance exactly.
3. **Legal entity:** The tenant remains the current accounting-entity surrogate; the known legal-entity architecture gap remains open and is not concealed.
4. **Currency:** Tax is calculated in invoice currency using exact cents, then translated with the invoice's snapshotted exchange rate for posting.
5. **Tax:** Treatment and rate are determined by tenant jurisdiction, invoice tax date, and the P2-001 country pack. Standard uses the effective rate; zero-rated/exempt use 0% but retain different classifications.
6. **Audit:** `invoice.drafted` and `invoice.issued` metadata include jurisdiction, document treatment, tax date, and tax total.
7. **Reversal:** Issued corrections continue through the existing controlled void/reversal path; no posted row is edited.
8. **Explanation:** Invoice and line snapshots preserve the classification, resolved rate, line tax amount, and effective-rate window.
9. **AI:** AI has no authority in tax determination or posting and is not changed by this mission.
10. **Permission:** Existing server-side `accounting.post` permission remains mandatory for draft and issue writes.

## Security, tenant, privacy, localisation, and mobile impacts

- Tenant identity and jurisdiction are fetched from authenticated server context inside the transaction. Contact, invoice, document, audit, and ledger writes remain tenant-scoped.
- The change stores tax classification evidence only; it adds no personal data, provider, retention, or AI context.
- Stable machine values are language-neutral. New UI labels use the typed locale catalogue. Shona and Ndebele tax wording remains gated for qualified review.
- Invoice line treatment selection must remain usable at narrow widths and by keyboard; no essential evidence may depend on colour or hover.

## Failure and atomicity behaviour

- Unknown country, unsupported treatment, missing effective standard rate, malformed monetary input, non-positive quantity, or a mismatched compatibility rate fails closed.
- Failure occurs before persistence where possible and otherwise rolls back the complete database transaction.
- Invoice issue remains one atomic operation across numbering, snapshot, ledger, stock, deal, status, audit, and post-commit event publication.

## Acceptance criteria

- The mission pack exists before product code changes.
- No invoice route contains a hard-coded statutory VAT percentage.
- Standard 15% Zimbabwe fixtures produce the exact pre-mission totals and journals through the country pack.
- Zero-rated and exempt lines both calculate zero tax but remain distinguishable in stored and rendered evidence.
- Mixed documents calculate and post only taxable-line VAT and persist `mixed` at document level.
- Invalid treatment or mismatched supplied rate produces no partial effects.
- Existing issued history is neither rewritten nor assigned invented tax classifications.
- Additive migration, server/web typechecks, full guarded database suite, and web production build pass with zero errors.
- Qualified Zimbabwean accountant/tax approval remains an explicit release gate.

## Migration and rollback

- Add nullable evidence columns so historical records remain truthful, plus a tenant country-code default/backfill for the current Zimbabwe-only tenant base.
- Apply the migration to local/CI only through `test:db:prepare`. Never run `db:push` against the shared production project.
- Rollback is a code rollback. New columns may remain unused; dropping columns is not required and must not be done while evidence-bearing rows exist.
