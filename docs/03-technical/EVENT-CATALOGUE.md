# Domain Event Catalogue

**Status:** P1-005 implemented and verified
**Transport:** In-process, best-effort, post-commit
**Durability:** None; a transactional outbox remains a future requirement

## Contract

Every event carries a stable fact `id`, `type`, `occurredAt`, `tenantId`,
`actorUserId`, and a minimal typed payload. Payloads contain identifiers and
necessary scalar facts only. Consumers must re-read protected records through
tenant- and permission-aware services.

Events are queued beside the existing transactional write and published only
after that transaction resolves successfully. A rollback publishes nothing.
Subscriber failures are isolated: one failing subscriber does not fail the
originating request or prevent sibling subscribers from receiving the event.

## Events

| Type | Existing source | Payload |
|---|---|---|
| `invoice.issued` | Invoice issue | `invoiceId`, `customerId`, `currency`, `totalCents`, `issuedAt` |
| `payment.recorded` | Customer payment posting | `paymentId`, `invoiceId`, `customerId`, `currency`, `amountCents` |
| `invoice.voided` | Invoice void/reversal | `invoiceId`, `reason` |
| `stock.moved` | Sale, void reversal, adjustment, opening stock, purchase receipt and opening-stock import | `movementId`, `productId`, `warehouseId`, `quantityDelta`, `kind` |
| `stock.adjusted` | Manual stock adjustment | `movementId`, `productId`, `warehouseId`, `quantityDelta` |
| `tenant.lifecycle_changed` | Billing lifecycle transition | `tenantId`, `from`, `to` |
| `customer.changed` | Customer create/update and committed contact import | `customerId`, `change` |
| `supplier.changed` | Supplier create/update, vendor-role contact changes and committed contact import | `supplierId`, `change` |
| `product.changed` | Product create/import and reorder-rule update | `productId`, `change` |
| `invoice.changed` | Invoice draft creation | `invoiceId`, `change` |
| `activity.recorded` | Manual CRM activity creation | `activityId`, `customerId` |
| `procurement.approval_requested` | Submitted requisition or draft purchase order | `kind`, `entityId`, `number`, `requesterUserId` |
| `supplier_bill.posted` | Matched supplier bill accepted into Accounts Payable | `supplierBillId`, `purchaseOrderId`, `supplierId`, `number`, `currency`, `totalCents` |

Money values use integer-cent strings. Quantity deltas remain exact decimal
strings. Stable event identifiers are derived from the event type and committed
fact identifier; lifecycle identifiers also include the transition context.
The three `*.changed` index-refresh facts contain identifiers and bounded
change labels; `activity.recorded` contains identifiers only. Consumers always
re-read the canonical tenant-owned record rather than treating an event payload
as business-record authority.

## Operational boundary

The current adapter has no queue, replay, retry, dead-letter store, distributed
delivery, or delivery guarantee across process failure. It is suitable for
best-effort in-process consumers only. Any consumer whose correctness depends
on guaranteed delivery requires a separately approved transactional outbox and
idempotent processing design.
