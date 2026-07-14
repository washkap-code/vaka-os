# P4-001 — Canonical Supplier Records

**Status:** Approved by the product owner for implementation  
**Programme:** 4 — Procurement and suppliers  
**Type:** Canonical party-role projection, procurement record view and finance-vendor integrity hardening  
**Depends on:** P1-002 identity/audit; P1-005 domain events; P1-006 search; P1-008 metadata; P3-004 canonical contact records

## Outcome

Authorised procurement users can create, find, open and maintain supplier
records without requiring CRM access. Supplier identity remains the existing
tenant-owned `contacts` record with `is_vendor = true`; purchase orders and
expenses use that same record as their finance vendor. No supplier master table
or duplicate company/contact identity is introduced.

## Current behaviour

- `contacts` is the canonical customer/vendor record. A contact may be a
  customer, a vendor, both or neither.
- Purchase orders and expenses reference `contacts.id` through
  `vendor_contact_id`.
- The authenticated Contacts workspace can mark a record as a vendor, but it is
  governed by CRM permissions and exposes no procurement-specific supplier
  view or fields.
- The Purchase Orders UI loads `/contacts`, so an inventory user without
  `crm.read` cannot populate the vendor selector.
- Purchase-order creation does not currently prove that `vendorContactId` is an
  active, same-tenant vendor before writing the order.
- Expense creation proves tenant ownership but does not require the selected
  contact to carry the vendor role.
- Search and canonical metadata register Customer, Invoice and Product, but not
  the supplier role. Contact events are named only `customer.changed`, even for
  vendor-only records and imports.

## Target behaviour

1. Keep one physical party record: Supplier is a governed projection of
   `contacts WHERE is_vendor = true AND deleted_at IS NULL`.
2. Add nullable supplier fields to `contacts`: supplier code, preferred
   currency, default payment terms in days and expected lead time in days.
   Existing name, type, addresses, email, phone, tax/registration identifiers,
   website, notes and tags remain shared party data.
3. Supplier code is optional and case-insensitively unique per tenant among
   active records. Day values are exact bounded integers from 0 to 3,650.
4. Add `/suppliers` list/create and `/suppliers/:id` detail/update APIs. Reads
   require `inventory.read`; writes require `inventory.write`. Tenant and role
   scope come only from verified authentication. Supplier creation always sets
   `is_vendor = true`; the supplier update path cannot remove that role.
5. Existing contact create/update and approved import paths remain compatible.
   Supplier-specific values are rejected unless the resulting canonical record
   has the vendor role.
6. Supplier writes are atomically audited without copying addresses, notes,
   tax identifiers or other sensitive profile values into audit metadata.
7. Add a minimal `supplier.changed` post-commit fact carrying only supplier ID
   and bounded change label. Contact changes emit the customer and/or supplier
   facts applicable to the committed roles; vendor imports emit supplier facts.
8. Add Supplier to the canonical metadata registry and tenant-safe search as a
   second role projection of `contacts`, governed by inventory permissions.
   Dual-role parties may legitimately have separate Customer and Supplier
   search documents that lead to the same canonical contact ID.
9. Add a responsive Suppliers workspace with empty, loading and error states,
   a readable mobile list, keyboard-accessible record dialogs, shared party
   fields and supplier-specific defaults. New copy is held in the typed English
   catalogue; stored values remain language-neutral.
10. Purchase Orders consume `/suppliers` and their server command rejects a
    missing, removed, cross-tenant or non-vendor contact before allocating a
    document number or writing order/audit rows.
11. Expenses continue through the existing accounting posting path and now
    reject a removed, cross-tenant or non-vendor contact before any expense,
    journal or audit write. No tax, currency, journal or balance behaviour is
    otherwise changed.

## User and measurable business result

- **Users:** Procurement/stock users with `inventory.read` or
  `inventory.write`, finance posters selecting vendors, and CRM users who
  maintain dual-role parties.
- **Problem:** Supplier maintenance depends on CRM access, supplier defaults are
  absent, and finance/procurement commands can accept a contact that is not a
  valid tenant supplier.
- **Result:** One supplier identity is reusable across procurement and finance,
  with role-correct discovery and fail-closed vendor selection.
- **Measure:** A supplier created in the Supplier workspace is the exact contact
  referenced by a PO/expense; inventory-only users can manage suppliers;
  cross-tenant/non-vendor/removed IDs create no order, expense, journal, number
  or audit side effect; metadata/search/event tests pass.

## Permissions, tenant isolation and audit

- Supplier reads use `inventory.read`; supplier writes use `inventory.write`.
- Existing CRM contact permissions remain unchanged and do not grant inventory
  operations.
- Every supplier, PO and expense lookup includes authenticated tenant scope and
  active-record/vendor-role predicates. IDs are never treated as authority.
- Create/update actions are zod-validated and audited in the same transaction
  as the canonical contact write. Post-commit facts publish only after success.
- Search indexes and metadata descriptors preserve the same tenant and
  permission boundary. Events contain identifiers only and are not record
  authority.

## Finance readiness

- **Accounting event:** Supplier master maintenance and PO creation create no
  journal. Expense posting retains its existing expense accounting event.
- **Journal:** None for supplier/PO master changes; expense continues through
  the approved balanced `postJournal` service.
- **Legal entity:** Tenant remains the current documented surrogate; P4-001
  does not claim legal-entity readiness.
- **Currency:** Supplier preferred currency is a non-posting default limited to
  currencies supported by the current country configuration. Transaction
  currency and rate snapshots remain authoritative on future documents.
- **Tax:** Supplier identifiers do not determine tax. No tax rate or treatment
  changes are made.
- **Audit:** Supplier create/update and existing PO/expense material actions are
  tenant/actor audited.
- **Reversal:** Supplier master changes are editable and auditable; posted
  expenses retain existing correction rules. No posted history is mutated.
- **Explanation:** A PO/expense vendor must be the active canonical contact with
  the supplier role at command time.
- **AI:** Supplier metadata remains `future-read-only`; no AI action or context
  value access is enabled.
- **Permission:** `inventory.write` maintains suppliers/POs;
  `accounting.post` remains required for expenses.

## Data protection, failure and recovery

- No bank account, payment credential, verification result or unnecessary
  personal data is added.
- Supplier fields use the existing contact retention, export and owner-controlled
  soft-removal model. This mission does not introduce physical deletion.
- Duplicate supplier codes return a safe conflict. Invalid or inaccessible
  vendor IDs return a safe not-found response without revealing another tenant.
- Related writes are transactional. A validation, uniqueness, journal or audit
  failure leaves no partial supplier, order, expense or emitted event.
- The event adapter remains best-effort and process-local. Search re-reads the
  canonical record and lazy tenant reconciliation repairs missed delivery.

## Mobile, accessibility and localisation

- Supplier list content reflows to labelled cards at narrow widths and does not
  depend on hover or colour. Dialog inputs have persistent labels, initial and
  returned focus, Escape support and visible error/status text.
- Supplier code and numeric defaults are stable stored values. Currency is a
  stable code and labels are formatted at the presentation boundary.
- New UI copy uses the typed English catalogue. ChiShona and isiNdebele
  supplier terminology requires native/professional review before enablement.

## Scope

- Additive supplier fields and indexes on canonical `contacts`.
- Supplier projection service/API with strict validation, RBAC, audit and
  tenant isolation.
- Supplier domain event, metadata projection and search document.
- Responsive Supplier workspace and command-palette navigation.
- Purchase-order and expense vendor-role validation.
- Focused migration, API, permission, tenant, rollback, event, metadata, search,
  responsive and accessibility tests.
- Completion report, changelog and governed documentation updates.

## Out of scope

- A `suppliers` table, duplicate company/contact record, SupplierAccount
  subledger, bank details, portal identity, verification, contracts or
  sanctions screening.
- Requisition, RFQ, approval, PO lifecycle redesign, goods receipt or partial
  receiving (P4-002).
- Supplier bills, input VAT, three-way match, AP posting/allocation/payment or
  supplier statements (P4-003 and later finance missions).
- Supplier deletion-specific routes, bulk supplier workflows or ownership
  policy changes; existing canonical contact removal controls remain in force.
- New currencies, tax rules, exchange-rate behaviour, ledger behaviour or
  production database automation.

## Acceptance criteria

- Mission pack is committed before implementation.
- No supplier table or duplicated party identity is introduced.
- Inventory-only users can list, create, open and update suppliers but cannot
  use CRM-only or accounting-posting commands without their permissions.
- Supplier inputs are strict, bounded and tenant-safe; writes audit atomically.
- Customer and Supplier projections remain correct for customer-only,
  supplier-only and dual-role contacts after create, update, import and removal.
- Metadata and search expose only permission-allowed, tenant-owned supplier
  summaries and exclude sensitive party data.
- PO/expense commands reject non-vendor, removed and cross-tenant contacts with
  no partial document, sequence, journal or audit effects.
- Supplier UI works at 320, 640 and desktop widths with keyboard/dialog
  contracts and catalogue-backed copy.
- Additive migration is applied only through guarded local/CI
  `test:db:prepare`; no production `db:push` or Supabase schema command runs.
- Full database-backed server suite, server/web typechecks, web production
  build and `git diff --check` pass before merge.

## Migration, rollout and rollback

The migration only adds nullable columns, bounded checks and an active
tenant/code unique index to `contacts`. Existing rows remain valid and require
no backfill. Local/CI preparation applies it before application verification.
Production DDL is copied exactly into `COMPLETION.md` for separate authorised
hand-application after merge; this mission never applies it to the shared
Supabase project.

Roll back application routes, UI, event/metadata/search adoption and vendor
validation together. The nullable supplier fields and index may remain dormant
for forward compatibility; do not drop them during an incident rollback.
Existing contacts, purchase orders, expenses, journals, stock movements and
audit history remain intact.

