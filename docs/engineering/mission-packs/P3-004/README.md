# P3-004 — Customer records, bulk actions and controlled deletion

**Status:** Approved by the product owner for implementation  
**Programme:** 3 — CRM and sales  
**Type:** Canonical customer-detail extension, reusable list selection and audited approval workflow  
**Depends on:** P1-002 identity/audit; P1-005 domain events; P3-003 customer timeline

## Outcome

Authorised tenant users can open a customer record, maintain useful CRM and
structured address information, select one or all visible customers, and apply
safe bulk changes. Deletion is controlled: the principal account owner can
remove active customer records immediately, while every other authorised user
must submit an exact deletion request for owner approval.

The current sole tenant `Owner` identity is the principal account owner for
this mission. Ownership transfer and multiple co-owner policy remain separate
identity-governance work.

## Current behaviour

- `contacts` is the canonical customer/vendor master and already has tenant-
  scoped read/create/patch routes.
- The UI opens only the P3-003 timeline. It does not present editable record
  details or most existing address/tag fields.
- Address is one unstructured field and common CRM profile fields are absent.
- Contact lists have no selection, select-all or bulk actions.
- There is no contact removal, deletion request or owner approval workflow.
- Contacts may be referenced by deals, activities, invoices, purchase orders,
  delivery evidence and audit history; destructive deletion could corrupt
  required operational or financial history.

## Target behaviour

1. Extend the canonical contact with nullable address line 1, address line 2,
   city, region/province, postal code, country code, website, industry,
   registration number and CRM notes. Preserve the legacy address value for
   compatibility and do not invent missing structured values.
2. Add soft-removal evidence (`deleted_at`, `deleted_by`) to contacts. Active
   list/search/customer selectors exclude removed contacts by default.
3. A removal hides the record from ordinary active workflows but preserves
   references, audit evidence and legally/financially required history. It is
   not represented as privacy-law erasure or irreversible database deletion.
4. Add a generic tenant-owned `record_deletion_requests` table with entity
   type/id, requester, reason, status, decision actor/reason and timestamps.
   One entity may have only one pending request.
5. A tenant owner with `crm.write` may remove one or many active contacts after
   explicit confirmation and a reason. Owner action and every affected contact
   are audited atomically.
6. A non-owner with `crm.write` may request removal for one or many active
   contacts. Requests do not change the contacts. The owner can approve or
   reject each pending request; approval performs the exact scoped removal in
   the same transaction.
7. Owner decisions reject stale, cross-tenant, already-decided or mismatched
   requests without revealing another tenant's records.
8. Add atomic bulk contact actions for adding a tag, removing a tag, marking as
   customer and marking as vendor. IDs are unique, bounded and all must belong
   to the authenticated tenant or the whole action fails.
9. Render a keyboard-accessible customer record dialog with profile, contact,
   address, classification, notes and existing timeline sections.
10. Add individual and select-all checkboxes plus a contextual bulk-action bar.
    Selection applies only to the currently returned active list and clears
    after a successful mutation or reload.
11. Owner users see pending deletion requests and can approve/reject them.
    Other users see the request outcome without receiving owner authority.
12. New copy is stored in the typed English catalogue. Stored machine values
    remain localisation-independent; Shona and Ndebele terminology remains
    subject to native review before locale enablement.

## User and measurable result

- **Users:** Sales/CRM staff with `crm.write`, read-only CRM users, and the
  principal tenant owner.
- **Problem:** Customer information cannot be maintained from the customer
  record, repetitive list work is slow, and deletion authority is uncontrolled.
- **Result:** Staff can maintain complete customer records and prepare exact
  deletion requests; only the owner can make removal effective.
- **Measure:** Permission, tenant, approval, atomic rollback, audit, active-list,
  bulk-selection, mobile and accessibility checks pass.

## Security, privacy and failure behaviour

- Tenant and owner identity come only from verified server context.
- `crm.read` controls detail/list reads; `crm.write` controls edits, bulk changes
  and deletion requests; owner identity is additionally required for decision
  and immediate removal.
- Bulk actions are capped at 100 records and fail atomically if any ID is
  invalid, duplicated, removed or outside the tenant.
- Audit metadata records action, count, reason and request linkage without
  copying full customer notes or addresses.
- Failed writes create no partial contact changes, requests or audit events.
- Privacy erasure, statutory retention decisions and physical purging require
  a separately reviewed retention workflow.

## Scope

- Additive contact/profile and deletion-request schema.
- Tenant-scoped detail/update, bulk-action, request and owner-decision services.
- Active-list filtering and deleted-record safeguards.
- Customer profile/detail UI, pending approval UI and reusable list-selection
  state/control.
- Domain, permission, tenant, rollback, audit and responsive tests.

## Out of scope

- Physical deletion or anonymisation of referenced customer history.
- Owner transfer, co-owner quorum, substitute approvers or platform-admin
  approval.
- Bulk messaging, exports of sensitive CRM notes, merge/deduplication or imports.
- Applying the list pattern to every module in this mission; the reusable
  pattern is first adopted by the customer and invoice lists explicitly
  requested by the owner.

## Acceptance criteria

- This mission pack is committed before implementation.
- Active and removed contacts remain tenant-isolated in every read/write path.
- Non-owners cannot remove records or approve their own requests.
- Owner approval is bound to the exact pending tenant/entity request.
- Bulk writes are bounded, atomic, audited and evented after commit.
- Contact edit supports structured address and CRM fields on mobile and desktop.
- Individual/select-all behavior is keyboard accessible and accurately reports
  selected count.
- Full guarded server suite, server/web typechecks, web build and representative
  browser verification pass.

## Rollback

Revert routes, services, UI and active-list filters. Nullable profile columns,
soft-removal evidence and deletion-request history remain dormant; do not drop
or physically delete them during rollback. Previously removed contacts may be
restored only through a separately audited owner action.
