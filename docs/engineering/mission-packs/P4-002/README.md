# P4-002 — Controlled Procurement Lifecycle

**Status:** Approved by the product owner for implementation  
**Programme:** 4 — Procurement and suppliers  
**Type:** Requisition, sourcing, approval, purchase-order and goods-receipt workflow  
**Depends on:** P1-002 identity/audit; P1-004 notifications; P1-005 events; P4-001 canonical suppliers; P5-002 append-only stock movements

## Outcome

An authorised tenant can move a business need through a traceable purchase
requisition, approval, RFQ, draft purchase order, independent PO approval and
partial or final goods receipt. Goods receipt uses the existing inventory
service to append stock movements, posts inventory value to a goods-received-
not-invoiced clearing account rather than Accounts Payable, emits `stock.moved`
after commit and preserves a complete tenant-scoped audit trail.

## Current behaviour

- The application has canonical suppliers and reusable `purchase_orders` /
  `purchase_order_line_items` tables.
- `POST /purchase-orders` creates an already `ORDERED` PO, allocates its number
  immediately and has no approval record.
- A PO can be received in one all-or-nothing action. There is no goods-receipt
  document, delivery-note evidence, partial receipt or over-receipt control.
- The current receipt path appends stock movements and posts Dr Inventory / Cr
  Accounts Payable immediately. This prevents P4-003 from enforcing a
  three-way match before AP recognition.
- There are no requisition or RFQ records, no procurement-specific permission
  separation and no approval notification.

## Target lifecycle

1. A user with `procurement.request` creates and submits a numbered purchase
   requisition with a purpose, needed-by date, currency and one or more exact
   product/warehouse/quantity lines. Optional estimated unit costs are planning
   values and create no journal.
2. A different user with `procurement.approve` approves or rejects the
   requisition with a reason. The requester cannot approve their own request.
   Only an approved requisition can become an RFQ.
3. A user with `procurement.write` issues a numbered RFQ to one or more active,
   same-tenant canonical suppliers. RFQ lines snapshot the approved requisition
   lines; invited suppliers are relationship records, not duplicate supplier
   identities.
4. The user records the selected invited supplier and quoted line costs. This
   creates one `DRAFT` purchase order using the existing PO and PO-line tables,
   linked to its requisition and RFQ. The RFQ becomes `AWARDED` atomically.
5. A different user with `procurement.approve` approves the draft PO with a
   reason. Approval allocates the immutable sequential PO number and changes
   the status to `ORDERED`. The PO creator and original requisition requester
   cannot approve it.
6. A user with `procurement.receive` posts a numbered goods receipt against an
   approved `ORDERED` PO. Each receipt lists PO line IDs and positive quantities
   with at most three decimal places. Partial receipts are allowed; cumulative
   quantity cannot exceed the ordered quantity. The PO remains `ORDERED` until
   every line is fully received, then becomes `RECEIVED`.
7. The receipt command requires an idempotency key, locks the PO, rechecks
   cumulative quantities and creates the receipt, receipt lines, stock
   movements, inventory-clearing journal and audit atomically. A replay with
   the same key/input returns the prior receipt; different input conflicts.

## Permissions and segregation of duties

- `procurement.read`: list and inspect requisitions, RFQs, POs and receipts.
- `procurement.request`: submit requisitions.
- `procurement.write`: issue RFQs and create draft POs from awarded sourcing.
- `procurement.approve`: approve/reject requisitions and approve POs.
- `procurement.receive`: post goods receipts.
- Default Owner/Admin roles receive all procurement permissions.
- Procurement Officer receives read/request/write/receive but not approval.
- Procurement Approver receives read/approve but not receipt or
  `accounting.post`.
- Stock Controller receives read/request/write/receive compatibility rights.
- Accountant receives procurement read only alongside their existing finance
  permissions. P4-003 bill posting remains a separate finance authority.
- Server-side self-approval checks apply even if a custom role combines
  permissions. UI visibility is not an authority boundary.

This keeps the PO approver and future supplier-bill poster assignable to
different people and roles. It does not claim a complete enterprise policy
engine; amount thresholds, delegated authority matrices and multi-stage
approval remain follow-on controls.

## Finance readiness

- **Requisition/RFQ/draft PO:** commitments and planning records only; no
  journal and no tax recognition.
- **PO approval:** authorises the purchase commitment; no journal.
- **Goods receipt accounting event:** inventory control/possession.
- **Journal:** Dr Inventory / Cr Goods Received Not Invoiced (GRNI), in tenant
  base currency using the PO's snapshotted exchange rate and receipt quantities.
- **AP boundary:** goods receipt must not credit Accounts Payable. P4-003 will
  create Supplier Bills and allow AP/tax posting only after the PO ↔ receipt ↔
  bill match passes.
- **Legal entity:** tenant remains the documented surrogate; no multi-entity
  claim is made.
- **Currency:** PO currency/rate remains a snapshot. Requisition estimates do
  not override the approved PO values.
- **Tax:** no supplier input VAT is recognised at receipt. P4-003 owns
  effective-dated bill tax determination and qualified-review gates.
- **Audit:** creation, decisions, issue, award, approval and receipt are
  material lifecycle events and audit atomically.
- **Reversal:** posted receipts and stock movements are append-only. Returns or
  receipt corrections require offsetting records in a future controlled
  mission; no in-place edit/delete endpoint is provided.
- **AI:** no model can approve, award, receive or post. Metadata/events do not
  grant action authority.

The GRNI chart addition and receipt accounting remain subject to qualified
Zimbabwean accountant review before market GA. This mission implements the
required deterministic control boundary; it is not professional approval.

## Data model

Additive records:

- `purchase_requisitions` and `purchase_requisition_line_items`;
- `request_for_quotes`, `request_for_quote_line_items` and
  `request_for_quote_suppliers`;
- nullable requisition/RFQ/approval lineage columns on existing
  `purchase_orders`;
- `goods_receipts` and `goods_receipt_line_items`;
- a GRNI system-account mapping for new tenants plus guarded additive role and
  account backfill for existing tenants.

All workflow tables carry or derive tenant ownership. Cross-table service
queries always include the authenticated tenant. Foreign keys improve
integrity but never replace tenant predicates.

## Kernel services and operational behaviour

- Verified JWT identity and server RBAC determine tenant, actor and authority.
- Material writes use the audit service boundary in their transaction.
- Requisition and PO approval requests emit typed post-commit events. An
  in-process subscriber creates deduplicated in-app notifications for active
  tenant approvers without exposing supplier/contact detail.
- Receipt uses `recordStockMovement`; every committed movement emits
  `stock.moved` for existing stock/search/alert consumers.
- Requisition, RFQ, PO and receipt numbers use the canonical numbering service.
- Supplier identity comes only from the P4-001 canonical Supplier projection.
- No duplicate metadata object, search master or document binary is created.
  These workflow records remain canonical structured documents; PDF/email
  rendering is outside P4-002.
- Notifications/events remain best-effort and process-local under current
  P1-004/P1-005 limitations. Transaction success never depends on delivery.

## Validation, failure and data protection

- Every input uses strict zod validation. Money is exact integer cents at
  calculation boundaries; quantities are exact thousandths.
- Product, warehouse, supplier, requisition, RFQ, PO and receipt-line IDs are
  revalidated under tenant scope. IDs are not authority.
- Invalid lifecycle transitions, self-approval, uninvited suppliers,
  duplicated receipt lines, zero/negative quantities, over-receipt and
  idempotency-key reuse fail with safe explanations and no partial effects.
- Stock, journal, receipt, status, number and audit effects share one database
  transaction. Post-commit event/notification failure cannot roll it back or
  create a false financial state.
- Notes/reasons are bounded. Notifications and audit metadata retain IDs,
  number/status and decision facts only, not supplier addresses, tax IDs or
  unnecessary personal data.

## Mobile, accessibility and localisation

- The Procurement workspace presents requisitions, RFQs, POs and receipts in
  compact sections that reflow to cards/stacked controls at 320 and 640 CSS
  pixels. No action depends on hover or colour.
- Forms and dialogs retain labelled controls, keyboard focus, Escape/close,
  loading/empty/error states and visible lifecycle explanations.
- New UI copy lives in the typed English catalogue. Stored statuses, currency
  codes and numbers remain locale-neutral. ChiShona and isiNdebele procurement
  terminology requires native/professional review before enablement.

## Compatibility and rollout

- The existing direct PO endpoint remains but now creates a `DRAFT` PO without
  a number. It must pass independent PO approval before receipt. This is an
  intentional fail-closed behaviour change.
- Existing `ORDERED` POs remain receivable after migration. New receipts use
  receipt documents and GRNI; historical receipt/AP journals are not rewritten.
- Existing `RECEIVED` and `CANCELLED` POs remain immutable.
- Existing critical/finance tests are updated to assert GRNI at receipt and AP
  absence before P4-003.
- Production receives no automated schema operation. Exact reviewed SQL is
  copied to `COMPLETION.md` for separate hand-application after merge.

## Scope

- Requisition create/list/detail and approve/reject.
- RFQ issue/list/detail with invited canonical suppliers.
- RFQ award to a linked draft PO with quoted line costs.
- Direct and RFQ-derived draft PO creation plus independent approval.
- Idempotent partial/final goods receipt with append-only stock, `stock.moved`,
  Dr Inventory / Cr GRNI journal and audit.
- Procurement permissions/default roles, approval notifications and responsive
  workspace.
- Additive migration, focused integration/finance/concurrency/tenant/RBAC tests,
  completion report, changelog and governed-document updates.

## Out of scope

- Supplier quote response portal, bid comparison scoring, attachments, PDF RFQ
  delivery, contracts, catalogues, budgets and delegated monetary thresholds.
- Service-only receipt, quality inspection, rejected/damaged quantities,
  returns, receipt reversal or PO amendment after approval.
- Supplier Bill, input VAT, three-way match, AP posting/allocation/payment and
  supplier statements (P4-003 and later missions).
- Durable workflow engine/outbox, external notifications, native/offline apps,
  OCR and AI action.

## Acceptance criteria

- Mission pack is committed before implementation.
- No supplier/company/product/warehouse/PO identity is duplicated.
- Requisition and PO self-approval are blocked; approver and bill-poster
  permissions are independently assignable.
- RFQ requires an approved requisition and invited active canonical suppliers;
  award creates one draft linked PO atomically.
- Receipt requires an approved ordered PO, is idempotent, allows partials,
  blocks over-receipt under concurrency and marks PO received only when all
  lines are complete.
- Each receipt appends stock movements through the inventory service, emits
  `stock.moved`, posts a balanced Inventory/GRNI journal and does not touch AP or
  input VAT.
- Tenant/RBAC/lifecycle failures leave no receipt, movement, journal, number,
  status or audit side effect.
- Approval notifications are tenant-scoped, deduplicated and contain bounded
  non-sensitive facts.
- Procurement UI works at 320, 640 and desktop widths with catalogue copy and
  accessibility contracts.
- New tables/columns are additive and exact production SQL appears in
  `COMPLETION.md`; no production `drizzle-kit push` or `db:push` runs.
- `test:db:prepare`, full server suite, server/web typechecks, web build,
  relevant shell/design/accessibility checks and `git diff --check` pass before
  merge.

## Rollback

Revert the new routes/services/UI/permissions and return new PO creation to the
prior compatibility path only through a separately reviewed rollback. Existing
procurement workflow rows and additive columns may remain dormant. Never drop
receipt, movement, journal, number or audit history during incident rollback.
Historical AP journals are unchanged; new GRNI receipt journals require normal
accounting reconciliation, not destructive migration.
