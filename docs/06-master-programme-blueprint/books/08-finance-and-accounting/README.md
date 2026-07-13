# Book Eight - VAKA Finance & Accounting Intelligence Architecture

**Version:** 1.0  
**Status:** Authoritative architecture baseline  
**Owner:** Finance Architecture  
**Professional review:** Required for market release

This is the authoritative source of truth for VAKA accounting, ledger, tax, currency, financial reporting, finance AI, migration and compliance architecture. Existing `docs/finance/` audits and evidence remain authoritative for current-state findings and are interpreted through this architecture.

## 1. Authority and invariants

1. No posted financial transaction is edited in place.
2. Corrections use reversal, credit/debit note, correcting journal or controlled adjustment.
3. Every posted journal balances exactly.
4. Operational modules never write ledger tables directly.
5. Approved posting services are the only ledger write boundary.
6. AI never posts directly or becomes the source of a deterministic calculation.
7. Tax rates and currency availability are effective-dated configuration, not invoice-code constants.
8. Material financial actions create audit evidence.
9. Tenant and future legal-entity ownership is mandatory.
10. Money uses exact arithmetic; exchange rates, costs, tax and other historical inputs are snapshotted.
11. Document numbers are sequential, immutable and explainable.
12. Linked operational, financial, stock, numbering and audit effects are atomic.

## 2. Accounting event model

Every operational financial event declares:

- event type/version and source document;
- tenant, legal entity, branch and fiscal period;
- transaction, functional and presentation currencies;
- exchange-rate source/time/value and rounding;
- tax treatment, jurisdiction, code/rate/evidence;
- balanced journal template and account determination;
- posting permission, approval, idempotency and concurrency;
- audit event and explanation;
- reversal/compensation method;
- AI visibility/authority; and
- reconciliation and reporting effects.

Posting validates the source lifecycle and locks/uniqueness constraints inside one database transaction.

## 3. General Ledger

The ledger contains charts of accounts, fiscal calendars/periods, journals/lines, dimensions, recurring and allocation journals, approved adjustments, opening/closing processes and immutable posting evidence. Draft journals may be edited; posted journals are immutable. Period locks prevent ordinary posting; controlled adjustments use authorized special periods or approved reopening with audit.

## 4. Accounts receivable and revenue

Customer master, quote/order, invoice, credit/debit notes, receipts, allocations, unapplied cash, statements, ageing, dunning and bad-debt workflows preserve original currency and document snapshots. Revenue recognition beyond straightforward invoicing requires a dedicated approved design.

Invoice issue allocates an immutable number, freezes document inputs, posts the journal where configured, emits durable post-commit events and can be corrected only through controlled documents/reversal.

P2-007 permits complete replacement of an unnumbered, unposted `DRAFT` invoice
inside one tenant-scoped transaction. Customer/product ownership, country-pack
tax evidence and exact totals are revalidated and audited. Once issued, the
invoice remains immutable and corrections continue through controlled
void/reversal documents; invoice deletion is not supported.

## 5. Accounts payable and procurement

Supplier master, requisition/RFQ/PO, receipt, bill, three-way match, approvals, payment proposal, payment and supplier statement reconciliation connect source-to-pay. Receiving may affect inventory; supplier bill acceptance affects AP/tax; payment affects cash/AP. Each effect has an explicit event and atomic boundary.

## 6. Banking, cash and treasury

Bank accounts, statement imports, normalized transactions, matching, reconciliation, cash positioning, transfers and payment integrations are provider-neutral. Browser scraping and stored internet-banking credentials are prohibited. Read-only ingestion and deterministic reconciliation precede outbound payment capability. Payment initiation requires step-up/approval, idempotency, signed provider evidence and reconciliation.

## 7. Tax and country rules

Tax determination is effective-dated by jurisdiction, registration, party, product/service, date and treatment. Standard, zero-rated, exempt, out-of-scope, withholding, reverse-charge and other market-specific outcomes are added by approved country packs. Tax reports reconcile to ledger and source documents. VAKA configuration and templates are not tax advice.

Zimbabwe VAT, PAYE, NSSA, fiscalisation and statutory reporting require qualified local review and approved test fixtures before availability.

P2-002 implements a bounded technical slice for invoices: tenant-derived
jurisdiction, effective-dated standard-rate resolution, distinct standard,
zero-rated and exempt line evidence, mixed document evidence and immutable
snapshots. P2-003 adds a read-only, tenant-scoped technical report over posted
`VAT_OUTPUT` and `VAT_INPUT` ledger evidence, with exact period totals and
audited CSV/PDF exports. It is not a filed VAT return: supplier input-VAT,
filing workflow, fiscalisation, registration-aware determination, legal-entity
isolation and professional approval remain open. Neither mission may be
presented as compliant market availability until those gates pass.

## 8. Currency

Transactions preserve original currency, functional currency, exchange-rate snapshot, source, timestamp, precision and rounding. Realized and unrealized gains/losses are explicit accounting events. Reports state currency and translation method. No core rule assumes only USD or ZWG.

## 9. Inventory costing and assets

Approved inventory valuation (currently weighted-average foundations) derives COGS and inventory journals from append-only stock movements and snapshotted costs. Negative stock/oversell is refused where required. Fixed assets cover capitalization, classes, depreciation, impairment, disposal and reconciliation through controlled events.

## 10. Budgets, reporting, close and consolidation

Budgets/forecasts are versioned planning data and never posted history. Trial balance, P&L, balance sheet, cash flow, ledgers, AR/AP ageing, tax and management reports reconcile to source balances with as-at/currency/dimension disclosure. Close includes task ownership, reconciliations, exceptions, period lock and sign-off. Multi-entity consolidation adds elimination, translation and ownership rules only after legal-entity isolation exists.

P2-006 implements a bounded read-only technical preview over the posted tenant
ledger: trial balance, P&L, balance sheet, invoice-source AR and supported PO-
receipt-source AP, with exact control tie-outs and audited CSV/PDF exports. It
preserves unsupported control entries as explicit unallocated reconciliation
exceptions. It is not a statutory filing or audited financial statement.
Supplier bills, due dates, AP allocation/payment, complete open-item accounting,
canonical legal-entity scope, close/lock, comparative disclosure and qualified
accountant approval remain release gates.

## 11. Finance Intelligence

AI may explain reconciled data, identify anomalies, forecast, summarize overdue exposure and draft actions. Output separates fact, deterministic calculation, inference and recommendation; identifies evidence/as-at/currency; states uncertainty; respects permissions; and records material assistance. Any proposed write is an exact preview executed only by the authorized deterministic service after confirmation. Autonomous posting is prohibited.

## 12. Migration and opening balances

Migration uses assessed source mappings, dry runs, exception resolution, balanced opening journals, open-item linkage, stock reconciliation, document retention, cutover controls and customer/professional sign-off. Historical fidelity and legal retention are explicit. Migration never fabricates balancing entries without approved, explained suspense/equity treatment.

## 13. Finance readiness questions

No finance feature is accepted without answering: accounting event; balanced journal; legal entity; currency; tax; audit; reversal; explanation; AI boundary; and required permission.

## 14. Release gates

Finance GA requires invariant/tenant/permission/audit/idempotency/concurrency/rollback/reversal/reconciliation tests, migration evidence, report tie-outs, backups/restores, operational runbooks, security review, and qualified accounting/tax approval for the release market. Current repository tests and remediation evidence are foundations, not blanket approval.
