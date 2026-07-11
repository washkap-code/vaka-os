# Book Six - Enterprise Data Model

**Version:** 1.0  
**Definition:** Accepted canonical-model baseline  
**Implementation:** Existing schema plus planned canonical extensions

## 1. Data doctrine

PostgreSQL is the transactional system of record. Data models preserve tenant and future legal-entity ownership, exact arithmetic, immutable posted history, referential integrity, explicit lifecycle, auditability, retention, portability, and additive market/industry extension.

The Canonical Information Model is logical. Physical tables may evolve through compatible migrations, but modules and integrations exchange canonical contracts rather than raw rows.

## 2. Ownership hierarchy

`VAKA Platform -> Tenant/Organisation -> Legal Entity -> Operating Unit/Branch -> Domain Record`

Tenant is mandatory for every customer-owned record. Legal entity becomes mandatory for postings and statutory records when the multi-entity capability is introduced. Warehouse, project, department, cost centre, branch and channel are dimensions, not substitutes for tenant or legal entity.

Platform-owned reference data is explicitly marked and never mixed with tenant records through nullable scope ambiguity.

## 3. Canonical objects

### Foundation

Tenant, Organisation, LegalEntity, OperatingUnit, User, Identity, Session, Device, Role, Permission, Grant, APIClient, AuditEvent, PolicyDecision, Configuration, FeatureEntitlement, NumberSequence, Locale, CountryPack, IndustryPack.

### Parties and relationships

Party, Person, OrganisationParty, ContactPoint, Address, CustomerAccount, SupplierAccount, EmployeeProfile, PartnerRelationship, Consent, VerificationCase, ReferralAttribution.

One Party may have several business roles; Customer and Supplier views do not duplicate the party’s identity.

### Commercial and CRM

Lead, Opportunity, Activity, Campaign, Quote, SalesOrder, Invoice, InvoiceLine, CreditNote, DebitNote, Payment, Allocation, PriceBook, Contract, Subscription, Entitlement.

### Finance

ChartOfAccounts, Account, AccountingEvent, Journal, JournalLine, FiscalPeriod, ExchangeRateSnapshot, TaxCode, TaxRate, TaxDetermination, BankAccount, BankTransaction, Reconciliation, Expense, Budget, Asset, DepreciationRun, TreasuryPosition, ConsolidationEntry.

Posted journals and lines are append-only and balanced. Operational documents do not write ledger tables directly; approved posting services translate accounting events into journals.

### Supply, inventory and operations

Product, SKU, UnitOfMeasure, Warehouse, Location, Bin, StockBalanceReadModel, StockMovement, Lot, Serial, StockCount, Transfer, PurchaseRequest, RequestForQuote, PurchaseOrder, GoodsReceipt, SupplierBill, MatchResult, Project, Task, Timesheet, Resource, WorkOrder, BillOfMaterial, Routing, Equipment, MaintenanceOrder.

`StockMovement` is append-only. Balances are derived/reconciled read models.

### Communications, documents and intelligence

Mailbox, Message, Conversation, CalendarEvent, Notification, DeliveryAttempt, Template, Document, DocumentVersion, SignatureRequest, SearchDocument, MetadataDefinition, WorkflowDefinition, WorkflowInstance, RuleDefinition, EventEnvelope, AIConversation, AIContextRecord, AIRecommendation, AIActionPreview, AIApproval, AIEvaluationRun.

## 4. Current physical baseline

The current schema defines tenant/user/session/platform-audit/import/capture/role/audit/referral/numbering, CRM, finance, banking, inventory, purchase-order, plan/subscription/invoice, and dunning tables. It includes 10 enumerations and 38 tables. This is implementation evidence, not the complete target model.

Important current mappings include:

- `tenants`, `users`, `user_sessions`, `roles`, `audit_logs`, `platform_audit_logs`;
- `contacts`, `deals`, `activities`;
- `accounts`, `exchange_rates`, `invoices`, `invoice_line_items`, `invoice_document_snapshots`, `invoice_share_links`, `payments`, `journal_entries`, `journal_lines`, `expenses`;
- `bank_accounts`, `bank_transactions`, `bank_reconciliations`;
- `products`, `warehouses`, `stock_levels`, `stock_movements`, `purchase_orders`, `purchase_order_line_items`;
- `plans`, `subscriptions`, `subscription_invoices`, `dunning_events`;
- `import_batches`, `import_rows`, `capture_documents`, and referral records.

Schema names are not automatically canonical API names. Migration to Party, LegalEntity, AccountingEvent, Document, Notification and other target concepts requires dedicated missions and compatibility plans.

## 5. Data dictionary standard

Every canonical object and physical field records: stable name/ID; business definition; owner; tenant/legal-entity scope; source of truth; type/format/unit/currency; null/default rules; classification; validation; lifecycle; mutability; relationships; indexes/constraints; permissions; audit events; retention/deletion; localisation; API/event mapping; migration lineage; example; and last review.

Money crosses boundaries as integer minor units or exact decimal strings plus currency. Dates/times use ISO 8601 and explicit timezone semantics. Stable codes are separate from translated labels.

## 6. Events and lineage

Every durable event includes event ID, type/version, tenant, optional legal entity, actor, entity reference/version, occurred and recorded time, correlation/causation/idempotency keys, classification, and minimal payload. Sensitive or large content remains behind authorized references.

Reports, AI answers, migrations, and integrations record source lineage sufficient to explain material results.

## 7. Retention, deletion and export

Retention is policy- and jurisdiction-driven. Customer deletion requests cannot destroy records that must be preserved for financial, legal, security, dispute, or audit reasons; access may be restricted or identifiers lawfully minimized. Suspend-then-escrow preserves client data. Tenant exports are complete, scoped, understandable, and auditable.

## 8. Migration controls

Schema changes use expand/migrate/contract, versioned migrations, representative tests, backup impact, restartable tenant-safe backfills, reconciliation, and rollback/forward-fix plans. Posted financial and stock records are never “migrated” by destructive rewrite without approved, reconciled, auditable transformation.

## 9. Acceptance

The model passes when every launch capability maps to canonical objects; ownership and lifecycle are unambiguous; tenant and legal-entity tests pass; finance/stock invariants are enforced; dictionaries and events are versioned; migration and retention are operational; and no module creates unauthorized duplicate masters.
