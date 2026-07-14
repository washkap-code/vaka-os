# Book Nine - Business Operations

**Version:** 1.0  
**Definition:** Accepted target  
**Implementation:** CRM, invoicing, purchasing and inventory foundations; remaining modules partial or planned

## 1. Cross-module doctrine

Business Operations is one connected lifecycle, not a collection of screens. Parties, products, documents, commitments, stock and money use canonical objects. Server-side domain services enforce lifecycle, permissions, approvals, audit, country rules and atomicity. Every workflow defines mobile behavior, localisation, interruption/retry, data protection and measurable outcome.

## 2. CRM and sales

Scope: Party/customer records; contacts/addresses/consents; leads; opportunities/stages; activities/tasks/meetings; campaigns; quotes; price books; sales orders; fulfilment; invoices; receipts; portal; timelines; analytics; and approved AI assistance.

Core flow: `lead -> qualified party/opportunity -> quote -> approved sales order -> fulfilment -> invoice -> payment/allocation -> follow-up/retention`.

Acceptance requires one canonical Customer; tenant-safe import/deduplication; stage and owner history; permissioned pricing/discounts; idempotent conversion; immutable issued documents; stock/finance atomicity; communication consent; mobile activity capture; and explainable pipeline/receivable reporting.

## 3. Procurement and suppliers

Scope: supplier role; onboarding/verification; catalogues; requisitions; approvals; RFQ/bids; purchase orders; amendments; goods/service receipt; inspection; supplier bills; three-way match; returns; contracts; supplier performance; spend analytics; portal; and approved AI assistance.

Core flow: `need -> requisition -> approval -> sourcing/RFQ -> PO -> receipt -> bill/match -> approval -> payment -> performance`.

No receipt or bill may silently overstate stock, AP or tax. Tolerances are versioned rules. Supplier verification and sanctions/regulatory checks are legally governed per country.

Current implementation uses `contacts.is_vendor` as the Supplier role on the
one canonical party record. Inventory-authorised users can maintain supplier
contact details and procurement defaults, while purchase orders and expenses
fail closed unless the selected record is an active same-tenant vendor.
Requisitions, RFQ, approvals, goods receipt, supplier bills and three-way match
remain follow-on missions.

## 4. Inventory and warehousing

Scope: products/SKUs/categories/units; warehouses/locations/bins; append-only receipt/issue/transfer/adjustment/opening movements; balances; reservations; lots/batches/serials/expiry; counts; replenishment; picking/packing; fulfilment; returns; valuation; barcode/QR/mobile capture; and intelligence.

Stock movement is the authoritative history. Balance is a reconciled read model. The system refuses overselling under the approved policy and rolls back the linked sale/journal/audit when any invariant fails. Adjustments require reason, permission and audit; historical movement is never edited.

Current implementation includes product-level integer reorder thresholds and
persisted in-app alerts for exact aggregate-stock healthy-to-low transitions.
The alert state is derived and rebuildable; it never replaces the stock ledger.
Per-warehouse rules, lead time/safety stock, durable delivery, external push and
automatic purchase-order replenishment remain planned.

## 5. Human capital and payroll

Scope: worker/employee identity; organisation/position; recruitment/onboarding/offboarding; contracts; leave; attendance/time; payroll; benefits; performance; learning; documents; employee/manager self-service; privacy; and approved AI HR.

Employee data receives heightened access, retention and audit controls. Payroll is an effective-dated calculation and accounting workflow with approvals, payslip/document security, reversals/corrections and statutory review. No payroll feature is marketed before qualified Zimbabwe review and representative fixtures.

## 6. Projects and services

Scope: projects/programmes; phases/tasks/dependencies; resources; time/expense; budgets/forecast; procurement/stock; risks/issues/changes; billing/revenue; margin; documents; customer collaboration; portfolio views; and AI project assistance.

Time, expense, commitments, actuals and billing remain traceable. Approved changes preserve baselines and history. Project posting uses Finance services.

## 7. Manufacturing

Scope: items/BOM/version; routings/work centres; demand and material planning; work orders; issue/return/production/scrap; quality; lot/serial traceability; capacity; subcontracting; costing; maintenance links; and production analytics.

Consumption/output create append-only movements and approved journals atomically. BOM/routing versions used by a released work order are snapshotted. Negative stock and unexplained cost variances fail safely.

## 8. Maintenance and physical assets

Scope: equipment hierarchy; meters; preventive plans; requests; work orders; labour/materials; downtime; inspections; warranties; failure codes; spares; mobile execution; cost and reliability analytics.

Maintenance uses Inventory for parts, HCM/Projects for resources, Documents for evidence and Finance for capitalization/expense treatment.

## 9. Portals and external users

Customer, supplier, employee, partner and contractor portals use narrow relationship-scoped identities. External access never becomes broad tenant membership. Every request checks the relationship, consent, object scope and current lifecycle; exports/downloads are audited.

## 10. Operational acceptance

Each module needs complete happy, denial, failure, reversal/return/cancel, retry and reconciliation paths; tenant and permission tests; audit catalogue; exact stock/finance effects; performance targets; responsive accessible UI; localisation keys and approved terminology; provider failure behavior; reports tied to source data; migration; training; support and release evidence.
