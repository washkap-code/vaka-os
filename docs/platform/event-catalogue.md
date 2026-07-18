# Platform Event Catalogue

This catalogue is the public contract for `EventType` in
`server/src/platform/events/registry.ts`. Every payload contains identifiers
and the minimum operational data required by subscribers. It must never carry
bank details, contact details, credentials, full business records, or other
sensitive field values.

| Event type | Payload | Publisher(s) | Subscriber(s) |
|---|---|---|---|
| `invoice.created` | `{ invoiceId: string; customerId: string }` | `createDraftInvoice` | None |
| `invoice.approved` | `{ invoiceId: string }` | Authenticated `issueInvoice` approval success | None |
| `invoice.issued` | `{ invoiceId: string; customerId: string; currency: string; totalCents: string; issuedAt: string }` | `issueInvoice` | Search invoice projection; customer timeline |
| `payment.received` | `{ paymentId: string; invoiceId: string; customerId: string; currency: string; amountCents: string }` | `recordPayment` | None |
| `payment.recorded` | `{ paymentId: string; invoiceId: string; customerId: string; currency: string; amountCents: string }` | `recordPayment` | Search invoice projection; customer timeline |
| `invoice.voided` | `{ invoiceId: string }` | `voidInvoice` | Search invoice projection; customer timeline |
| `stock.moved` | `{ movementId: string; productId: string; warehouseId: string; quantityDelta: string; kind: string }` | Stock adjustment/opening/import, invoice issue, procurement receipt/return | Search product projection; low-stock coordinator |
| `stock.adjusted` | `{ movementId: string; productId: string; warehouseId: string; quantityDelta: string }` | Stock adjustment | Search product projection; low-stock coordinator |
| `inventory.valued` | `{ movementId: string; valuationId: string; journalEntryId: string \| null }` | Valued stock issue/receipt/return | None |
| `tenant.lifecycle_changed` | `{ tenantId: string; from: string; to: string }` | Billing lifecycle transitions | None |
| `customer.changed` | `{ customerId: string; change: "created" \| "updated" \| "imported" \| "bulk-updated" \| "removed" }` | Contact create/update/import/bulk/removal | Search customer projection |
| `customer.created` | `{ customerId: string }` | Customer contact create/import | None |
| `supplier.changed` | `{ supplierId: string; change: "created" \| "updated" \| "imported" \| "bulk-updated" \| "removed" }` | Supplier/contact create/update/import/bulk/removal | Search supplier projection |
| `product.changed` | `{ productId: string; change: "created" \| "imported" \| "updated" }` | Product create/import/reorder update | Search product projection; low-stock coordinator |
| `product.created` | `{ productId: string }` | Product create/import | None |
| `employee.created` | `{ employeeId: string }` | `createEmployee` | None |
| `invoice.changed` | `{ invoiceId: string; change: "drafted" \| "updated" }` | Invoice draft create/update | Search invoice projection |
| `activity.recorded` | `{ activityId: string; customerId: string }` | Activity create | Customer timeline |
| `procurement.approval_requested` | `{ kind: "purchase_requisition" \| "purchase_order"; entityId: string; number: string \| null; requesterUserId: string }` | Procurement approval gates | Procurement notification coordinator; task automation |
| `supplier_bill.posted` | `{ supplierBillId: string; purchaseOrderId: string; supplierId: string; number: string; currency: string; totalCents: string }` | Supplier bill posting | Task automation |
| `workflow.started` | `{ instanceId; definitionId; workflowName; objectType; objectId; currentStep; status: "ACTIVE" \| "COMPLETED" }` | `WorkflowService.start` | Workflow notification coordinator |
| `workflow.approved` | `{ instanceId; definitionId; workflowName; objectType; objectId; step; stepName; currentStep; status: "ACTIVE" \| "COMPLETED" }` | `WorkflowService.approve` | Workflow notification coordinator |
| `workflow.rejected` | `{ instanceId; definitionId; workflowName; objectType; objectId; step; stepName; currentStep; status: "REJECTED" }` | `WorkflowService.reject` | Workflow notification coordinator (terminal no-op) |
| `workflow.completed` | `{ instanceId; definitionId; workflowName; objectType; objectId; currentStep; status: "COMPLETED" }` | `WorkflowService.start/approve` | Workflow notification coordinator (terminal no-op) |
| `mail.sent` | `{ accountId: string; messageId: string; threadId: string }` | `MailService.send/reply` after SMTP acceptance and local commit | None |
| `mail.received` | `{ accountId: string; messageId: string; threadId: string }` | `MailService` after an inbound IMAP message commits | None |

## Delivery contract

- `publish()` writes `platform_events` before invoking a subscriber.
- Domain and workflow publishers queue events inside their originating work and
  release them only after that database transaction commits.
- A subscriber failure is isolated from the user request. The failed handler is
  retried three times with bounded in-process backoff, then the event is marked
  `failed` if delivery still cannot complete.
- Stable subscriber names are recorded in `processed_events`. The bus checks
  that evidence before running a named handler, and `hasProcessed(handlerName,
  eventId)` is available to handlers that need an explicit guard.
- Event payloads are facts, not commands. Financial posting, permission and
  lifecycle rules remain in their owning domain services.
