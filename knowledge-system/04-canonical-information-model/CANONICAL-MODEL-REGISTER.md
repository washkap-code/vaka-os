# Canonical Information Model register

**Detailed model:** `docs/06-master-programme-blueprint/books/06-enterprise-data-model/README.md`

## Domains and canonical roots

| Domain | Canonical roots |
|---|---|
| Foundation | Tenant, Organisation, LegalEntity, OperatingUnit, User, Session, Role, Permission, Entitlement |
| Parties | Party, Person, OrganisationParty, ContactPoint, Address, CustomerAccount, SupplierAccount, EmployeeProfile |
| CRM/commercial | Lead, Opportunity, Activity, Quote, SalesOrder, Contract, Invoice, Payment, Subscription |
| Finance | AccountingEvent, Account, Journal, JournalLine, FiscalPeriod, Tax, ExchangeRateSnapshot, Reconciliation, Budget, Asset |
| Supply/inventory | Product, SKU, Warehouse, Location, StockMovement, Lot/Serial, PurchaseOrder, GoodsReceipt, SupplierBill |
| Work | Project, Task, Timesheet, Resource, WorkOrder, BOM, Equipment, MaintenanceOrder |
| Communications/content | Mailbox, Message, CalendarEvent, Notification, Document, DocumentVersion, Template |
| Platform/intelligence | MetadataDefinition, Workflow, Rule, PolicyDecision, EventEnvelope, SearchDocument, AIConversation, Recommendation, ActionPreview |

Canonical objects define identity, ownership, lifecycle and cross-domain contracts. Physical schema, API and provider mappings must reference this register and may not introduce duplicate master objects without an ADR.

## P1-008 current physical projections

| Registry key | Canonical mapping | Current physical projection | Limitation |
|---|---|---|---|
| `company` | Organisation | `tenants` | Tenant/workspace is not a LegalEntity and cannot establish statutory ownership |
| `customer` | CustomerAccount role | `contacts` where `is_customer = true` | Target Party/CustomerAccount separation remains future work |
| `invoice` | Invoice | `invoices` | Tenant remains the accounting-entity surrogate |
| `product` | Product/SKU | `products` | Category, variant and richer catalogue dimensions remain incomplete |

These are governed metadata projections, not new canonical objects or tables.
The executable seed is `server/src/metadata.ts`; it is read-only and versioned.
