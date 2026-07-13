export const DOMAIN_EVENTS = {
  INVOICE_ISSUED: "invoice.issued",
  PAYMENT_RECORDED: "payment.recorded",
  INVOICE_VOIDED: "invoice.voided",
  STOCK_MOVED: "stock.moved",
  STOCK_ADJUSTED: "stock.adjusted",
  TENANT_LIFECYCLE_CHANGED: "tenant.lifecycle_changed",
  CUSTOMER_CHANGED: "customer.changed",
  PRODUCT_CHANGED: "product.changed",
  INVOICE_CHANGED: "invoice.changed",
  ACTIVITY_RECORDED: "activity.recorded",
} as const;

export type DomainEventPayloads = {
  "invoice.issued": { invoiceId: string; customerId: string; currency: string; totalCents: string; issuedAt: string };
  "payment.recorded": { paymentId: string; invoiceId: string; customerId: string; currency: string; amountCents: string };
  "invoice.voided": { invoiceId: string; reason: string };
  "stock.moved": { movementId: string; productId: string; warehouseId: string; quantityDelta: string; kind: string };
  "stock.adjusted": { movementId: string; productId: string; warehouseId: string; quantityDelta: string };
  "tenant.lifecycle_changed": { tenantId: string; from: string; to: string };
  "customer.changed": { customerId: string; change: "created" | "updated" | "imported" };
  "product.changed": { productId: string; change: "created" | "imported" };
  "invoice.changed": { invoiceId: string; change: "drafted" };
  "activity.recorded": { activityId: string; customerId: string };
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
