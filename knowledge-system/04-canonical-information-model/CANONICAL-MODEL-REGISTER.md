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
