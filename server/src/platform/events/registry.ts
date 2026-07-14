export const DOMAIN_EVENTS = {
  INVOICE_ISSUED: "invoice.issued",
  PAYMENT_RECORDED: "payment.recorded",
  INVOICE_VOIDED: "invoice.voided",
  STOCK_MOVED: "stock.moved",
  STOCK_ADJUSTED: "stock.adjusted",
  INVENTORY_VALUED: "inventory.valued",
  TENANT_LIFECYCLE_CHANGED: "tenant.lifecycle_changed",
  CUSTOMER_CHANGED: "customer.changed",
  SUPPLIER_CHANGED: "supplier.changed",
  PRODUCT_CHANGED: "product.changed",
  INVOICE_CHANGED: "invoice.changed",
  ACTIVITY_RECORDED: "activity.recorded",
  PROCUREMENT_APPROVAL_REQUESTED: "procurement.approval_requested",
  SUPPLIER_BILL_POSTED: "supplier_bill.posted",
} as const;

export type DomainEventPayloads = {
  "invoice.issued": { invoiceId: string; customerId: string; currency: string; totalCents: string; issuedAt: string };
  "payment.recorded": { paymentId: string; invoiceId: string; customerId: string; currency: string; amountCents: string };
  "invoice.voided": { invoiceId: string; reason: string };
  "stock.moved": { movementId: string; productId: string; warehouseId: string; quantityDelta: string; kind: string };
  "stock.adjusted": { movementId: string; productId: string; warehouseId: string; quantityDelta: string };
  "inventory.valued": { movementId: string; valuationId: string; journalEntryId: string | null };
  "tenant.lifecycle_changed": { tenantId: string; from: string; to: string };
  "customer.changed": { customerId: string; change: "created" | "updated" | "imported" | "bulk-updated" | "removed" };
  "supplier.changed": { supplierId: string; change: "created" | "updated" | "imported" | "bulk-updated" | "removed" };
  "product.changed": { productId: string; change: "created" | "imported" | "updated" };
  "invoice.changed": { invoiceId: string; change: "drafted" | "updated" };
  "activity.recorded": { activityId: string; customerId: string };
  "procurement.approval_requested": {
    kind: "purchase_requisition" | "purchase_order";
    entityId: string;
    number: string | null;
    requesterUserId: string;
  };
  "supplier_bill.posted": {
    supplierBillId: string;
    purchaseOrderId: string;
    supplierId: string;
    number: string;
    currency: string;
    totalCents: string;
  };
};

export type DomainEventType = keyof DomainEventPayloads;
export type DomainEventInput<K extends DomainEventType = DomainEventType> = {
  /** Stable fact identifier used by idempotent consumers. */
  id?: string;
  type: K;
  tenantId: string;
  actorUserId: string | null;
  payload: DomainEventPayloads[K];
};
