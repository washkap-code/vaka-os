export const DOMAIN_EVENTS = {
  INVOICE_CREATED: "invoice.created",
  INVOICE_APPROVED: "invoice.approved",
  INVOICE_ISSUED: "invoice.issued",
  PAYMENT_RECEIVED: "payment.received",
  PAYMENT_RECORDED: "payment.recorded",
  INVOICE_VOIDED: "invoice.voided",
  STOCK_MOVED: "stock.moved",
  STOCK_ADJUSTED: "stock.adjusted",
  INVENTORY_VALUED: "inventory.valued",
  TENANT_LIFECYCLE_CHANGED: "tenant.lifecycle_changed",
  CUSTOMER_CHANGED: "customer.changed",
  CUSTOMER_CREATED: "customer.created",
  SUPPLIER_CHANGED: "supplier.changed",
  PRODUCT_CHANGED: "product.changed",
  PRODUCT_CREATED: "product.created",
  EMPLOYEE_CREATED: "employee.created",
  INVOICE_CHANGED: "invoice.changed",
  ACTIVITY_RECORDED: "activity.recorded",
  PROCUREMENT_APPROVAL_REQUESTED: "procurement.approval_requested",
  SUPPLIER_BILL_POSTED: "supplier_bill.posted",
  WORKFLOW_STARTED: "workflow.started",
  WORKFLOW_APPROVED: "workflow.approved",
  WORKFLOW_REJECTED: "workflow.rejected",
  WORKFLOW_COMPLETED: "workflow.completed",
  MIGRATION_COMPLETED: "migration.completed",
} as const;

export type DomainEventPayloads = {
  "invoice.created": { invoiceId: string; customerId: string };
  "invoice.approved": { invoiceId: string };
  "invoice.issued": { invoiceId: string; customerId: string; currency: string; totalCents: string; issuedAt: string };
  "payment.received": { paymentId: string; invoiceId: string; customerId: string; currency: string; amountCents: string };
  "payment.recorded": { paymentId: string; invoiceId: string; customerId: string; currency: string; amountCents: string };
  "invoice.voided": { invoiceId: string };
  "stock.moved": { movementId: string; productId: string; warehouseId: string; quantityDelta: string; kind: string };
  "stock.adjusted": { movementId: string; productId: string; warehouseId: string; quantityDelta: string };
  "inventory.valued": { movementId: string; valuationId: string; journalEntryId: string | null };
  "tenant.lifecycle_changed": { tenantId: string; from: string; to: string };
  "customer.changed": { customerId: string; change: "created" | "updated" | "imported" | "bulk-updated" | "removed" };
  "customer.created": { customerId: string };
  "supplier.changed": { supplierId: string; change: "created" | "updated" | "imported" | "bulk-updated" | "removed" };
  "product.changed": { productId: string; change: "created" | "imported" | "updated" };
  "product.created": { productId: string };
  "employee.created": { employeeId: string };
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
  "workflow.started": {
    instanceId: string;
    definitionId: string;
    workflowName: string;
    objectType: string;
    objectId: string;
    currentStep: number;
    status: "ACTIVE" | "COMPLETED";
  };
  "workflow.approved": {
    instanceId: string;
    definitionId: string;
    workflowName: string;
    objectType: string;
    objectId: string;
    step: number;
    stepName: string;
    currentStep: number;
    status: "ACTIVE" | "COMPLETED";
  };
  "workflow.rejected": {
    instanceId: string;
    definitionId: string;
    workflowName: string;
    objectType: string;
    objectId: string;
    step: number;
    stepName: string;
    currentStep: number;
    status: "REJECTED";
  };
  "workflow.completed": {
    instanceId: string;
    definitionId: string;
    workflowName: string;
    objectType: string;
    objectId: string;
    currentStep: number;
    status: "COMPLETED";
  };
  "migration.completed": {
    jobId: string;
    objectType: "Customer" | "Supplier" | "Product";
    importedRows: number;
  };
};

export type DomainEventType = keyof DomainEventPayloads;
/** Closed event catalogue. Unknown event names fail TypeScript compilation. */
export type EventType = DomainEventType;
export const EVENT_TYPES = Object.values(DOMAIN_EVENTS) as EventType[];
export type DomainEventInput<K extends DomainEventType = DomainEventType> = {
  /** Stable fact identifier used by idempotent consumers. */
  id?: string;
  type: K;
  tenantId: string;
  actorUserId: string | null;
  payload: DomainEventPayloads[K];
};

export interface EventObjectReference { objectType: string | null; objectId: string | null; }

/** Resolve the non-sensitive subject columns stored beside each event payload. */
export function eventObjectReference<K extends EventType>(
  type: K,
  payload: DomainEventPayloads[K],
): EventObjectReference {
  const value = payload as Record<string, unknown>;
  const id = (key: string) => typeof value[key] === "string" ? value[key] as string : null;
  if (type.startsWith("invoice.")) return { objectType: "Invoice", objectId: id("invoiceId") };
  if (type.startsWith("payment.")) return { objectType: "Payment", objectId: id("paymentId") };
  if (type.startsWith("customer.")) return { objectType: "Customer", objectId: id("customerId") };
  if (type.startsWith("supplier_bill.")) return { objectType: "SupplierBill", objectId: id("supplierBillId") };
  if (type.startsWith("supplier.")) return { objectType: "Supplier", objectId: id("supplierId") };
  if (type.startsWith("product.")) return { objectType: "Product", objectId: id("productId") };
  if (type.startsWith("employee.")) return { objectType: "Employee", objectId: id("employeeId") };
  if (type.startsWith("stock.")) return { objectType: "StockMovement", objectId: id("movementId") };
  if (type === "inventory.valued") return { objectType: "InventoryValuation", objectId: id("valuationId") };
  if (type === "tenant.lifecycle_changed") return { objectType: "Tenant", objectId: id("tenantId") };
  if (type === "activity.recorded") return { objectType: "Activity", objectId: id("activityId") };
  if (type === "procurement.approval_requested") {
    return { objectType: typeof value.kind === "string" ? value.kind : "Procurement", objectId: id("entityId") };
  }
  if (type.startsWith("workflow.")) {
    return { objectType: typeof value.objectType === "string" ? value.objectType : "Workflow", objectId: id("objectId") };
  }
  if (type === "migration.completed") return { objectType: "MigrationJob", objectId: id("jobId") };
  return { objectType: null, objectId: null };
}
