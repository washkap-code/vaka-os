# P2-007 — Invoice detail and draft amendment

**Status:** Approved by the product owner for implementation  
**Programme:** 2 — Finance foundations  
**Type:** Existing invoice-detail UI and draft-only replacement workflow  
**Depends on:** P2-002 VAT evidence; authoritative finance architecture; P3-004 reusable list selection

## Outcome

Authorised finance users can open any invoice to review its customer, dates,
status, values, tax evidence, lines and payments. Users with
`accounting.post` may amend a draft invoice before issue. Issued, partially
paid, paid and void invoices remain immutable and are never presented as
editable.

## Finance readiness

- **Accounting event:** Draft amendment creates no accounting event or journal.
- **Journal:** None until the existing issue service posts the invoice.
- **Owner:** Current tenant/accounting-entity surrogate; legal-entity work
  remains open.
- **Currency/tax:** Currency, rate, tax date, treatment and effective-rate
  evidence are recomputed and snapshotted through the existing country-pack
  rules.
- **Audit:** `invoice.draft_updated` records actor and safe before/after scope.
- **Reversal:** Not applicable to an unposted draft; issued history uses the
  existing void/reversal controls.
- **AI:** No AI involvement.
- **Permission:** `accounting.read` for detail, `accounting.post` for amendment.

## Target behaviour

1. Enrich the existing tenant-scoped invoice detail response with the canonical
   customer summary required for display; do not duplicate customer data.
2. Add one transactional draft-update service that locks and re-reads the
   tenant-owned invoice, refuses every non-`DRAFT` status, verifies the selected
   customer and referenced products belong to the tenant, resolves tax from the
   tenant country pack, recomputes exact totals, replaces draft lines, writes
   audit evidence and emits `invoice.changed` only after commit.
3. Draft amendment may change customer, currency/rate, due date, notes, tax
   date and lines. It may not assign/change a number, issue date, status,
   payments, amount paid, ledger evidence or document snapshot.
4. The full replacement is atomic. Invalid customer/product, tax/date/rate,
   missing line or any insert failure leaves the original draft unchanged.
5. Render an accessible invoice detail dialog for all statuses. Drafts expose
   edit/save controls only when the tenant is writable and the user has
   `accounting.post`; other statuses explain why historical fields are locked.
6. Add individual/select-all selection to the invoice list and a safe bulk CSV
   export of the selected list facts. Bulk financial posting, payment, voiding,
   deletion and multi-download are not introduced without a separately reviewed
   atomic workflow.
7. Invoice records are never deleted. Drafts can use the existing controlled
   void lifecycle; issued documents use existing reversal/void controls.

## User and measurable result

- **User:** Finance staff with `accounting.read`, and authorised posters with
  `accounting.post`.
- **Problem:** Invoice rows cannot be opened and data-entry mistakes in drafts
  require abandoning the record.
- **Result:** Users can inspect every invoice and correct drafts safely before
  issue without affecting the ledger or historical records.
- **Measure:** Lifecycle, tenant, permission, product/customer, exact-total,
  rollback, audit, mobile and accessibility tests pass.

## Acceptance criteria

- This mission pack is committed before implementation.
- Only tenant-owned drafts can be amended and the lifecycle check is enforced
  server-side under row lock.
- Draft replacement preserves number/payment/ledger/document fields and is
  fully atomic.
- Existing issue/void/payment tests remain green; no posted financial record is
  edited or deleted.
- Invoice rows open a detail view; draft edit and selected-list export work at
  representative mobile and desktop widths.
- Full guarded server suite, server/web typechecks and web production build pass.

## Rollback

Remove the draft-update route/service and invoice detail/edit UI. The existing
read, create, issue, payment, void, PDF and delivery paths remain unchanged. No
schema rollback is required for invoice behavior.
