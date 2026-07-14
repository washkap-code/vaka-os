import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import {
  assertIdempotencyFingerprint, audit, badRequest, conflict, db, fromCents,
  mulRate, nextDocNumber, notFound, payloadFingerprint, requireIdempotencyKey,
  schema, toCents, type DB,
} from "./lib.js";
import { postJournal, systemAccount } from "./accounting.js";
import { recordStockMovement } from "./inventory.js";
import { assertActiveSupplier } from "./suppliers.js";
import { DOMAIN_EVENTS, runWithPostCommitEvents } from "./platform/events/index.js";

const quantity = z.string().trim()
  .regex(/^\d{1,9}(\.\d{1,3})?$/, "Quantity must be positive with no more than 3 decimal places")
  .refine((value) => quantityUnits(value) > 0n, "Quantity must be greater than zero");
const estimatedMoney = z.string().trim()
  .regex(/^\d{1,12}(\.\d{1,2})?$/, "Amount must be non-negative with no more than 2 decimal places");
const positiveMoney = estimatedMoney.refine((value) => toCents(value) > 0n, "Amount must be greater than zero");
const positiveRate = z.string().trim()
  .regex(/^\d{1,12}(\.\d{1,6})?$/, "Exchange rate must have no more than 6 decimal places")
  .refine((value) => Number(value) > 0, "Exchange rate must be greater than zero");
const optionalDate = z.coerce.date().optional().nullable();
const boundedText = (max: number) => z.string().trim().min(1).max(max);

function uniqueLineKeys<T extends { productId: string; warehouseId: string }>(lines: T[]): boolean {
  return new Set(lines.map((line) => `${line.productId}:${line.warehouseId}`)).size === lines.length;
}

export const purchaseRequisitionCreateSchema = z.object({
  purpose: boundedText(500),
  neededBy: optionalDate,
  currency: z.enum(["USD", "ZWG"]).default("USD"),
  lines: z.array(z.object({
    productId: z.string().uuid(),
    warehouseId: z.string().uuid(),
    quantity,
    estimatedUnitCost: estimatedMoney.optional().nullable(),
  }).strict()).min(1).max(100),
}).strict().refine((value) => uniqueLineKeys(value.lines), "A product and warehouse may appear only once");

export const requisitionDecisionSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  reason: boundedText(500),
}).strict();

export const requestForQuoteCreateSchema = z.object({
  purchaseRequisitionId: z.string().uuid(),
  supplierContactIds: z.array(z.string().uuid()).min(1).max(50)
    .refine((ids) => new Set(ids).size === ids.length, "A supplier may be invited only once"),
  responseDueAt: optionalDate,
}).strict();

export const directPurchaseOrderSchema = z.object({
  vendorContactId: z.string().uuid(),
  currency: z.enum(["USD", "ZWG"]).default("USD"),
  rateToBase: positiveRate.default("1"),
  expectedDate: optionalDate,
  lines: z.array(z.object({
    productId: z.string().uuid(),
    warehouseId: z.string().uuid(),
    quantity,
    unitCost: positiveMoney,
  }).strict()).min(1).max(100),
}).strict().refine((value) => uniqueLineKeys(value.lines), "A product and warehouse may appear only once");

export const requestForQuoteAwardSchema = z.object({
  supplierContactId: z.string().uuid(),
  currency: z.enum(["USD", "ZWG"]),
  rateToBase: positiveRate.default("1"),
  expectedDate: optionalDate,
  lines: z.array(z.object({
    requestForQuoteLineItemId: z.string().uuid(),
    unitCost: positiveMoney,
  }).strict()).min(1).max(100)
    .refine((lines) => new Set(lines.map((line) => line.requestForQuoteLineItemId)).size === lines.length,
      "An RFQ line may be priced only once"),
}).strict();

export const purchaseOrderApprovalSchema = z.object({ reason: boundedText(500) }).strict();

export const goodsReceiptSchema = z.object({
  receivedAt: z.coerce.date().optional(),
  deliveryNote: z.string().trim().max(200).optional().nullable(),
  note: z.string().trim().max(1000).optional().nullable(),
  lines: z.array(z.object({
    purchaseOrderLineItemId: z.string().uuid(),
    quantity,
  }).strict()).min(1).max(100)
    .refine((lines) => new Set(lines.map((line) => line.purchaseOrderLineItemId)).size === lines.length,
      "A purchase-order line may appear only once per receipt"),
}).strict();

type RequisitionCreate = z.infer<typeof purchaseRequisitionCreateSchema>;
type RequisitionDecision = z.infer<typeof requisitionDecisionSchema>;
type RfqCreate = z.infer<typeof requestForQuoteCreateSchema>;
type DirectPoCreate = z.infer<typeof directPurchaseOrderSchema>;
type RfqAward = z.infer<typeof requestForQuoteAwardSchema>;
type GoodsReceiptInput = z.infer<typeof goodsReceiptSchema>;

function quantityUnits(value: string): bigint {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 1000n + BigInt((fraction + "000").slice(0, 3));
}

function lineTotal(unitCost: string, qtyValue: string): string {
  const total = mulRate(toCents(unitCost), qtyValue);
  if (total > 99_999_999_999_999n) throw badRequest("Procurement line total exceeds the supported money range");
  return fromCents(total);
}

async function validateOperationalLines(
  tx: DB,
  tenantId: string,
  lines: readonly { productId: string; warehouseId: string }[],
): Promise<void> {
  const productIds = [...new Set(lines.map((line) => line.productId))];
  const warehouseIds = [...new Set(lines.map((line) => line.warehouseId))];
  const [products, warehouses] = await Promise.all([
    tx.select({ id: schema.products.id, trackStock: schema.products.trackStock })
      .from(schema.products).where(and(
        eq(schema.products.tenantId, tenantId),
        eq(schema.products.isActive, true),
        inArray(schema.products.id, productIds),
      )),
    tx.select({ id: schema.warehouses.id }).from(schema.warehouses).where(and(
      eq(schema.warehouses.tenantId, tenantId),
      inArray(schema.warehouses.id, warehouseIds),
    )),
  ]);
  if (products.length !== productIds.length || products.some((product) => !product.trackStock)) {
    throw badRequest("Every procurement line must use an active stock-tracked product in this workspace");
  }
  if (warehouses.length !== warehouseIds.length) throw badRequest("Every procurement line must use a warehouse in this workspace");
}

function approvalRequestEvent(opts: {
  tenantId: string;
  actorUserId: string;
  kind: "purchase_requisition" | "purchase_order";
  entityId: string;
  number: string | null;
}) {
  return {
    id: `${DOMAIN_EVENTS.PROCUREMENT_APPROVAL_REQUESTED}:${opts.kind}:${opts.entityId}`,
    type: DOMAIN_EVENTS.PROCUREMENT_APPROVAL_REQUESTED,
    tenantId: opts.tenantId,
    actorUserId: opts.actorUserId,
    payload: {
      kind: opts.kind,
      entityId: opts.entityId,
      number: opts.number,
      requesterUserId: opts.actorUserId,
    },
  } as const;
}

export async function getProcurementReferenceData(tenantId: string) {
  const [suppliers, products, warehouses] = await Promise.all([
    db.select({
      id: schema.contacts.id,
      name: schema.contacts.name,
      supplierCode: schema.contacts.supplierCode,
      supplierCurrency: schema.contacts.supplierCurrency,
    }).from(schema.contacts).where(and(
      eq(schema.contacts.tenantId, tenantId),
      eq(schema.contacts.isVendor, true),
      isNull(schema.contacts.deletedAt),
    )).orderBy(asc(schema.contacts.name)),
    db.select({
      id: schema.products.id,
      sku: schema.products.sku,
      name: schema.products.name,
      costPrice: schema.products.costPrice,
      currency: schema.products.currency,
    }).from(schema.products).where(and(
      eq(schema.products.tenantId, tenantId),
      eq(schema.products.isActive, true),
      eq(schema.products.trackStock, true),
    )).orderBy(asc(schema.products.name)),
    db.select({ id: schema.warehouses.id, name: schema.warehouses.name, isDefault: schema.warehouses.isDefault })
      .from(schema.warehouses).where(eq(schema.warehouses.tenantId, tenantId)).orderBy(asc(schema.warehouses.name)),
  ]);
  return { suppliers, products, warehouses };
}

export async function listPurchaseRequisitions(tenantId: string) {
  const headers = await db.select().from(schema.purchaseRequisitions)
    .where(eq(schema.purchaseRequisitions.tenantId, tenantId))
    .orderBy(desc(schema.purchaseRequisitions.createdAt));
  const lines = await db.select().from(schema.purchaseRequisitionLineItems)
    .where(eq(schema.purchaseRequisitionLineItems.tenantId, tenantId))
    .orderBy(asc(schema.purchaseRequisitionLineItems.position));
  return headers.map((header) => ({
    ...header,
    lines: lines.filter((line) => line.purchaseRequisitionId === header.id),
  }));
}

export async function createPurchaseRequisition(opts: {
  tenantId: string;
  actorUserId: string;
  input: RequisitionCreate;
}) {
  return runWithPostCommitEvents((queue) => db.transaction(async (tx) => {
    await validateOperationalLines(tx, opts.tenantId, opts.input.lines);
    const number = await nextDocNumber(tx, opts.tenantId, "purchase_requisition", "PR");
    const [requisition] = await tx.insert(schema.purchaseRequisitions).values({
      tenantId: opts.tenantId,
      number,
      purpose: opts.input.purpose,
      neededBy: opts.input.neededBy ?? null,
      currency: opts.input.currency,
      createdBy: opts.actorUserId,
    }).returning();
    await tx.insert(schema.purchaseRequisitionLineItems).values(opts.input.lines.map((line, index) => ({
      tenantId: opts.tenantId,
      purchaseRequisitionId: requisition.id,
      productId: line.productId,
      warehouseId: line.warehouseId,
      position: index + 1,
      quantity: line.quantity,
      estimatedUnitCost: line.estimatedUnitCost ?? null,
    })));
    await audit(tx, opts.tenantId, opts.actorUserId, "purchase_requisition.submitted", "purchase_requisition", requisition.id, {
      number,
      lineCount: opts.input.lines.length,
      currency: opts.input.currency,
    });
    queue(approvalRequestEvent({
      tenantId: opts.tenantId,
      actorUserId: opts.actorUserId,
      kind: "purchase_requisition",
      entityId: requisition.id,
      number,
    }));
    return { ...requisition, lines: opts.input.lines };
  }));
}

export async function decidePurchaseRequisition(opts: {
  tenantId: string;
  actorUserId: string;
  requisitionId: string;
  input: RequisitionDecision;
}) {
  return db.transaction(async (tx) => {
    const [requisition] = await tx.select().from(schema.purchaseRequisitions).where(and(
      eq(schema.purchaseRequisitions.id, opts.requisitionId),
      eq(schema.purchaseRequisitions.tenantId, opts.tenantId),
    )).for("update");
    if (!requisition) throw notFound("Purchase requisition not found");
    if (requisition.status !== "SUBMITTED") throw conflict("Only a submitted purchase requisition can be decided");
    if (requisition.createdBy === opts.actorUserId) throw conflict("A requester cannot approve or reject their own purchase requisition");
    const status = opts.input.decision === "APPROVE" ? "APPROVED" : "REJECTED";
    const [updated] = await tx.update(schema.purchaseRequisitions).set({
      status,
      approvedBy: opts.actorUserId,
      approvedAt: new Date(),
      decisionReason: opts.input.reason,
    }).where(and(
      eq(schema.purchaseRequisitions.id, requisition.id),
      eq(schema.purchaseRequisitions.tenantId, opts.tenantId),
    )).returning();
    await audit(tx, opts.tenantId, opts.actorUserId,
      status === "APPROVED" ? "purchase_requisition.approved" : "purchase_requisition.rejected",
      "purchase_requisition", requisition.id, { number: requisition.number, status });
    return updated;
  });
}

export async function listRequestForQuotes(tenantId: string) {
  const [headers, lines, suppliers] = await Promise.all([
    db.select().from(schema.requestForQuotes).where(eq(schema.requestForQuotes.tenantId, tenantId))
      .orderBy(desc(schema.requestForQuotes.createdAt)),
    db.select().from(schema.requestForQuoteLineItems).where(eq(schema.requestForQuoteLineItems.tenantId, tenantId))
      .orderBy(asc(schema.requestForQuoteLineItems.position)),
    db.select().from(schema.requestForQuoteSuppliers).where(eq(schema.requestForQuoteSuppliers.tenantId, tenantId)),
  ]);
  return headers.map((header) => ({
    ...header,
    lines: lines.filter((line) => line.requestForQuoteId === header.id),
    supplierContactIds: suppliers.filter((row) => row.requestForQuoteId === header.id)
      .map((row) => row.supplierContactId),
  }));
}

export async function createRequestForQuote(opts: {
  tenantId: string;
  actorUserId: string;
  input: RfqCreate;
}) {
  return db.transaction(async (tx) => {
    const [requisition] = await tx.select().from(schema.purchaseRequisitions).where(and(
      eq(schema.purchaseRequisitions.id, opts.input.purchaseRequisitionId),
      eq(schema.purchaseRequisitions.tenantId, opts.tenantId),
    )).for("update");
    if (!requisition) throw notFound("Purchase requisition not found");
    if (requisition.status !== "APPROVED") throw conflict("An RFQ requires an approved purchase requisition");
    const [existing] = await tx.select({ id: schema.requestForQuotes.id }).from(schema.requestForQuotes).where(and(
      eq(schema.requestForQuotes.tenantId, opts.tenantId),
      eq(schema.requestForQuotes.purchaseRequisitionId, requisition.id),
    ));
    if (existing) throw conflict("This purchase requisition already has an RFQ");
    for (const supplierId of opts.input.supplierContactIds) await assertActiveSupplier(tx, opts.tenantId, supplierId);
    const requisitionLines = await tx.select().from(schema.purchaseRequisitionLineItems).where(and(
      eq(schema.purchaseRequisitionLineItems.tenantId, opts.tenantId),
      eq(schema.purchaseRequisitionLineItems.purchaseRequisitionId, requisition.id),
    )).orderBy(asc(schema.purchaseRequisitionLineItems.position));
    if (!requisitionLines.length) throw badRequest("Purchase requisition has no lines");
    const number = await nextDocNumber(tx, opts.tenantId, "request_for_quote", "RFQ");
    const [rfq] = await tx.insert(schema.requestForQuotes).values({
      tenantId: opts.tenantId,
      purchaseRequisitionId: requisition.id,
      number,
      responseDueAt: opts.input.responseDueAt ?? null,
      createdBy: opts.actorUserId,
    }).returning();
    const rfqLines = await tx.insert(schema.requestForQuoteLineItems).values(requisitionLines.map((line) => ({
      tenantId: opts.tenantId,
      requestForQuoteId: rfq.id,
      purchaseRequisitionLineItemId: line.id,
      productId: line.productId,
      warehouseId: line.warehouseId,
      position: line.position,
      quantity: line.quantity,
    }))).returning();
    await tx.insert(schema.requestForQuoteSuppliers).values(opts.input.supplierContactIds.map((supplierContactId) => ({
      tenantId: opts.tenantId,
      requestForQuoteId: rfq.id,
      supplierContactId,
    })));
    await audit(tx, opts.tenantId, opts.actorUserId, "request_for_quote.issued", "request_for_quote", rfq.id, {
      number,
      purchaseRequisitionId: requisition.id,
      supplierCount: opts.input.supplierContactIds.length,
      lineCount: requisitionLines.length,
    });
    return { ...rfq, lines: rfqLines, supplierContactIds: opts.input.supplierContactIds };
  });
}

async function insertDraftPurchaseOrder(
  tx: DB,
  opts: {
    tenantId: string;
    actorUserId: string;
    vendorContactId: string;
    currency: "USD" | "ZWG";
    rateToBase: string;
    expectedDate?: Date | null;
    purchaseRequisitionId?: string | null;
    requestForQuoteId?: string | null;
    lines: readonly { productId: string; warehouseId: string; quantity: string; unitCost: string }[];
  },
) {
  await assertActiveSupplier(tx, opts.tenantId, opts.vendorContactId);
  await validateOperationalLines(tx, opts.tenantId, opts.lines);
  let total = 0n;
  const lines = opts.lines.map((line) => {
    const totalValue = lineTotal(line.unitCost, line.quantity);
    total += toCents(totalValue);
    if (total > 99_999_999_999_999n) throw badRequest("Purchase-order total exceeds the supported money range");
    return { ...line, lineTotal: totalValue };
  });
  const [po] = await tx.insert(schema.purchaseOrders).values({
    tenantId: opts.tenantId,
    vendorContactId: opts.vendorContactId,
    purchaseRequisitionId: opts.purchaseRequisitionId ?? null,
    requestForQuoteId: opts.requestForQuoteId ?? null,
    number: null,
    status: "DRAFT",
    currency: opts.currency,
    rateToBase: opts.rateToBase,
    expectedDate: opts.expectedDate ?? null,
    total: fromCents(total),
    createdBy: opts.actorUserId,
  }).returning();
  const insertedLines = await tx.insert(schema.purchaseOrderLineItems).values(lines.map((line) => ({
    ...line,
    purchaseOrderId: po.id,
  }))).returning();
  await audit(tx, opts.tenantId, opts.actorUserId, "purchase_order.draft_created", "purchase_order", po.id, {
    lineCount: lines.length,
    currency: opts.currency,
    total: fromCents(total),
    requestForQuoteId: opts.requestForQuoteId ?? null,
  });
  return { ...po, lines: insertedLines };
}

export async function createDirectPurchaseOrder(opts: {
  tenantId: string;
  actorUserId: string;
  input: DirectPoCreate;
}) {
  return runWithPostCommitEvents((queue) => db.transaction(async (tx) => {
    const po = await insertDraftPurchaseOrder(tx, {
      tenantId: opts.tenantId,
      actorUserId: opts.actorUserId,
      ...opts.input,
    });
    queue(approvalRequestEvent({
      tenantId: opts.tenantId,
      actorUserId: opts.actorUserId,
      kind: "purchase_order",
      entityId: po.id,
      number: null,
    }));
    return po;
  }));
}

export async function awardRequestForQuote(opts: {
  tenantId: string;
  actorUserId: string;
  requestForQuoteId: string;
  input: RfqAward;
}) {
  return runWithPostCommitEvents((queue) => db.transaction(async (tx) => {
    const [rfq] = await tx.select().from(schema.requestForQuotes).where(and(
      eq(schema.requestForQuotes.id, opts.requestForQuoteId),
      eq(schema.requestForQuotes.tenantId, opts.tenantId),
    )).for("update");
    if (!rfq) throw notFound("RFQ not found");
    if (rfq.status !== "ISSUED") throw conflict("Only an issued RFQ can be awarded");
    await assertActiveSupplier(tx, opts.tenantId, opts.input.supplierContactId);
    const [invited] = await tx.select({ id: schema.requestForQuoteSuppliers.id })
      .from(schema.requestForQuoteSuppliers).where(and(
        eq(schema.requestForQuoteSuppliers.tenantId, opts.tenantId),
        eq(schema.requestForQuoteSuppliers.requestForQuoteId, rfq.id),
        eq(schema.requestForQuoteSuppliers.supplierContactId, opts.input.supplierContactId),
      ));
    if (!invited) throw conflict("The selected supplier was not invited to this RFQ");
    const rfqLines = await tx.select().from(schema.requestForQuoteLineItems).where(and(
      eq(schema.requestForQuoteLineItems.tenantId, opts.tenantId),
      eq(schema.requestForQuoteLineItems.requestForQuoteId, rfq.id),
    )).orderBy(asc(schema.requestForQuoteLineItems.position));
    const costByLine = new Map(opts.input.lines.map((line) => [line.requestForQuoteLineItemId, line.unitCost]));
    if (costByLine.size !== rfqLines.length || rfqLines.some((line) => !costByLine.has(line.id))) {
      throw badRequest("Quoted costs are required for every RFQ line and no other lines");
    }
    const po = await insertDraftPurchaseOrder(tx, {
      tenantId: opts.tenantId,
      actorUserId: opts.actorUserId,
      vendorContactId: opts.input.supplierContactId,
      currency: opts.input.currency,
      rateToBase: opts.input.rateToBase,
      expectedDate: opts.input.expectedDate ?? null,
      purchaseRequisitionId: rfq.purchaseRequisitionId,
      requestForQuoteId: rfq.id,
      lines: rfqLines.map((line) => ({
        productId: line.productId,
        warehouseId: line.warehouseId,
        quantity: line.quantity,
        unitCost: costByLine.get(line.id)!,
      })),
    });
    await tx.update(schema.requestForQuotes).set({
      status: "AWARDED",
      awardedSupplierContactId: opts.input.supplierContactId,
      awardedAt: new Date(),
    }).where(and(eq(schema.requestForQuotes.id, rfq.id), eq(schema.requestForQuotes.tenantId, opts.tenantId)));
    await audit(tx, opts.tenantId, opts.actorUserId, "request_for_quote.awarded", "request_for_quote", rfq.id, {
      purchaseOrderId: po.id,
      supplierContactId: opts.input.supplierContactId,
    });
    queue(approvalRequestEvent({
      tenantId: opts.tenantId,
      actorUserId: opts.actorUserId,
      kind: "purchase_order",
      entityId: po.id,
      number: null,
    }));
    return po;
  }));
}

export async function approvePurchaseOrder(opts: {
  tenantId: string;
  actorUserId: string;
  purchaseOrderId: string;
  reason: string;
}) {
  return db.transaction(async (tx) => {
    const [po] = await tx.select().from(schema.purchaseOrders).where(and(
      eq(schema.purchaseOrders.id, opts.purchaseOrderId),
      eq(schema.purchaseOrders.tenantId, opts.tenantId),
    )).for("update");
    if (!po) throw notFound("Purchase order not found");
    if (po.status !== "DRAFT") throw conflict("Only a draft purchase order can be approved");
    if (po.createdBy === opts.actorUserId) throw conflict("A purchase-order creator cannot approve their own purchase order");
    if (po.purchaseRequisitionId) {
      const [requisition] = await tx.select({ createdBy: schema.purchaseRequisitions.createdBy })
        .from(schema.purchaseRequisitions).where(and(
          eq(schema.purchaseRequisitions.id, po.purchaseRequisitionId),
          eq(schema.purchaseRequisitions.tenantId, opts.tenantId),
        ));
      if (!requisition) throw badRequest("Purchase-order requisition lineage is invalid");
      if (requisition.createdBy === opts.actorUserId) throw conflict("A requisition requester cannot approve its purchase order");
    }
    const number = await nextDocNumber(tx, opts.tenantId, "purchase_order", "PO");
    const [approved] = await tx.update(schema.purchaseOrders).set({
      number,
      status: "ORDERED",
      approvedBy: opts.actorUserId,
      approvedAt: new Date(),
      approvalReason: opts.reason,
    }).where(and(eq(schema.purchaseOrders.id, po.id), eq(schema.purchaseOrders.tenantId, opts.tenantId))).returning();
    await audit(tx, opts.tenantId, opts.actorUserId, "purchase_order.approved", "purchase_order", po.id, {
      number,
      lineTotal: po.total,
      currency: po.currency,
    });
    return approved;
  });
}

export async function listPurchaseOrders(tenantId: string) {
  const [orders, lines, receipts, receiptLines] = await Promise.all([
    db.select().from(schema.purchaseOrders).where(eq(schema.purchaseOrders.tenantId, tenantId))
      .orderBy(desc(schema.purchaseOrders.createdAt)),
    db.select({
      id: schema.purchaseOrderLineItems.id,
      purchaseOrderId: schema.purchaseOrderLineItems.purchaseOrderId,
      productId: schema.purchaseOrderLineItems.productId,
      warehouseId: schema.purchaseOrderLineItems.warehouseId,
      quantity: schema.purchaseOrderLineItems.quantity,
      unitCost: schema.purchaseOrderLineItems.unitCost,
      lineTotal: schema.purchaseOrderLineItems.lineTotal,
    }).from(schema.purchaseOrderLineItems)
      .innerJoin(schema.purchaseOrders, eq(schema.purchaseOrders.id, schema.purchaseOrderLineItems.purchaseOrderId))
      .where(eq(schema.purchaseOrders.tenantId, tenantId)),
    db.select().from(schema.goodsReceipts).where(eq(schema.goodsReceipts.tenantId, tenantId))
      .orderBy(desc(schema.goodsReceipts.createdAt)),
    db.select().from(schema.goodsReceiptLineItems).where(eq(schema.goodsReceiptLineItems.tenantId, tenantId)),
  ]);
  return orders.map((order) => ({
    ...order,
    lines: lines.filter((line) => line.purchaseOrderId === order.id).map((line) => ({
      ...line,
      quantityReceived: fromQuantityUnits(receiptLines
        .filter((receiptLine) => receiptLine.purchaseOrderLineItemId === line.id)
        .reduce((sum, receiptLine) => sum + quantityUnits(receiptLine.quantityReceived), 0n)),
    })),
    receipts: receipts.filter((receipt) => receipt.purchaseOrderId === order.id),
  }));
}

function fromQuantityUnits(value: bigint): string {
  const whole = value / 1000n;
  const fraction = (value % 1000n).toString().padStart(3, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export async function listGoodsReceipts(tenantId: string) {
  const [headers, lines] = await Promise.all([
    db.select().from(schema.goodsReceipts).where(eq(schema.goodsReceipts.tenantId, tenantId))
      .orderBy(desc(schema.goodsReceipts.createdAt)),
    db.select().from(schema.goodsReceiptLineItems).where(eq(schema.goodsReceiptLineItems.tenantId, tenantId)),
  ]);
  return headers.map((header) => ({
    ...header,
    lines: lines.filter((line) => line.goodsReceiptId === header.id),
  }));
}

export async function postGoodsReceipt(opts: {
  tenantId: string;
  actorUserId: string;
  purchaseOrderId: string;
  idempotencyKey: string;
  input: GoodsReceiptInput;
}) {
  const idempotencyKey = requireIdempotencyKey(opts.idempotencyKey);
  const normalizedLines = [...opts.input.lines].sort((a, b) =>
    a.purchaseOrderLineItemId.localeCompare(b.purchaseOrderLineItemId));
  const fingerprint = payloadFingerprint({
    action: "goods_receipt",
    purchaseOrderId: opts.purchaseOrderId,
    receivedAt: opts.input.receivedAt?.toISOString() ?? null,
    deliveryNote: opts.input.deliveryNote ?? null,
    note: opts.input.note ?? null,
    lines: normalizedLines,
  });
  return runWithPostCommitEvents((queue) => db.transaction(async (tx) => {
    const [existing] = await tx.select().from(schema.goodsReceipts).where(and(
      eq(schema.goodsReceipts.tenantId, opts.tenantId),
      eq(schema.goodsReceipts.idempotencyKey, idempotencyKey),
    ));
    if (existing) {
      assertIdempotencyFingerprint(existing.idempotencyFingerprint, fingerprint, "goods receipt");
      const lines = await tx.select().from(schema.goodsReceiptLineItems).where(and(
        eq(schema.goodsReceiptLineItems.tenantId, opts.tenantId),
        eq(schema.goodsReceiptLineItems.goodsReceiptId, existing.id),
      ));
      return { receipt: existing, lines, replayed: true };
    }
    const [po] = await tx.select().from(schema.purchaseOrders).where(and(
      eq(schema.purchaseOrders.id, opts.purchaseOrderId),
      eq(schema.purchaseOrders.tenantId, opts.tenantId),
    )).for("update");
    if (!po) throw notFound("Purchase order not found");
    const [concurrentReplay] = await tx.select().from(schema.goodsReceipts).where(and(
      eq(schema.goodsReceipts.tenantId, opts.tenantId),
      eq(schema.goodsReceipts.idempotencyKey, idempotencyKey),
    ));
    if (concurrentReplay) {
      assertIdempotencyFingerprint(concurrentReplay.idempotencyFingerprint, fingerprint, "goods receipt");
      const lines = await tx.select().from(schema.goodsReceiptLineItems).where(and(
        eq(schema.goodsReceiptLineItems.tenantId, opts.tenantId),
        eq(schema.goodsReceiptLineItems.goodsReceiptId, concurrentReplay.id),
      ));
      return { receipt: concurrentReplay, lines, replayed: true };
    }
    if (po.status !== "ORDERED") {
      throw conflict(po.status === "RECEIVED" ? "Purchase order is fully received" : "Only an approved ordered purchase order can be received");
    }
    const legacyApproval = po.approvedAt
      && po.approvalReason === "Legacy order migrated as previously authorised";
    if ((!po.approvedBy && !legacyApproval) || !po.approvedAt || !po.number) {
      throw conflict("Purchase order approval evidence is incomplete");
    }
    const poLines = await tx.select().from(schema.purchaseOrderLineItems)
      .where(eq(schema.purchaseOrderLineItems.purchaseOrderId, po.id));
    const requestedIds = new Set(normalizedLines.map((line) => line.purchaseOrderLineItemId));
    const selectedPoLines = poLines.filter((line) => requestedIds.has(line.id));
    if (selectedPoLines.length !== normalizedLines.length) throw badRequest("Every receipt line must belong to this purchase order");
    const historicalReceiptLines = await tx.select().from(schema.goodsReceiptLineItems).where(and(
      eq(schema.goodsReceiptLineItems.tenantId, opts.tenantId),
      inArray(schema.goodsReceiptLineItems.purchaseOrderLineItemId, poLines.map((line) => line.id)),
    ));
    const receivedByPoLine = new Map<string, bigint>();
    for (const line of historicalReceiptLines) {
      receivedByPoLine.set(line.purchaseOrderLineItemId,
        (receivedByPoLine.get(line.purchaseOrderLineItemId) ?? 0n) + quantityUnits(line.quantityReceived));
    }
    const inputByPoLine = new Map(normalizedLines.map((line) => [line.purchaseOrderLineItemId, line.quantity]));
    for (const line of selectedPoLines) {
      const already = receivedByPoLine.get(line.id) ?? 0n;
      const incoming = quantityUnits(inputByPoLine.get(line.id)!);
      if (already + incoming > quantityUnits(line.quantity)) {
        throw conflict(`Receipt quantity exceeds the outstanding quantity for purchase-order line ${line.id}`);
      }
    }
    const number = await nextDocNumber(tx, opts.tenantId, "goods_receipt", "GR");
    const [receipt] = await tx.insert(schema.goodsReceipts).values({
      tenantId: opts.tenantId,
      purchaseOrderId: po.id,
      number,
      receivedAt: opts.input.receivedAt ?? new Date(),
      deliveryNote: opts.input.deliveryNote ?? null,
      note: opts.input.note ?? null,
      idempotencyKey,
      idempotencyFingerprint: fingerprint,
      createdBy: opts.actorUserId,
    }).returning();
    let goodsBase = 0n;
    let goodsOriginal = 0n;
    const insertedLines: (typeof schema.goodsReceiptLineItems.$inferSelect)[] = [];
    for (const poLine of selectedPoLines) {
      const receivedQuantity = inputByPoLine.get(poLine.id)!;
      const total = lineTotal(poLine.unitCost, receivedQuantity);
      const baseUnitCost = fromCents(mulRate(toCents(poLine.unitCost), po.rateToBase));
      const [receiptLine] = await tx.insert(schema.goodsReceiptLineItems).values({
        tenantId: opts.tenantId,
        goodsReceiptId: receipt.id,
        purchaseOrderLineItemId: poLine.id,
        productId: poLine.productId,
        warehouseId: poLine.warehouseId,
        quantityReceived: receivedQuantity,
        unitCost: poLine.unitCost,
        lineTotal: total,
      }).returning();
      insertedLines.push(receiptLine);
      const movement = await recordStockMovement(tx, {
        tenantId: opts.tenantId,
        productId: poLine.productId,
        warehouseId: poLine.warehouseId,
        quantityDelta: receivedQuantity,
        unitCost: baseUnitCost,
        reason: "PURCHASE",
        sourceType: "goods_receipt",
        sourceId: receipt.id,
        idempotencyKey: `goods-receipt:${receipt.id}:${poLine.id}`,
        idempotencyFingerprint: fingerprint,
        createdBy: opts.actorUserId,
      });
      queue({
        id: `${DOMAIN_EVENTS.STOCK_MOVED}:${movement.movementId}`,
        type: DOMAIN_EVENTS.STOCK_MOVED,
        tenantId: opts.tenantId,
        actorUserId: opts.actorUserId,
        payload: {
          movementId: movement.movementId,
          productId: poLine.productId,
          warehouseId: poLine.warehouseId,
          quantityDelta: receivedQuantity,
          kind: "PURCHASE",
        },
      });
      await tx.update(schema.products).set({ costPrice: baseUnitCost }).where(and(
        eq(schema.products.id, poLine.productId),
        eq(schema.products.tenantId, opts.tenantId),
      ));
      goodsOriginal += toCents(total);
      goodsBase += mulRate(toCents(total), po.rateToBase);
      if (goodsBase > 99_999_999_999_999n) throw badRequest("Goods receipt value exceeds the supported money range");
      receivedByPoLine.set(poLine.id,
        (receivedByPoLine.get(poLine.id) ?? 0n) + quantityUnits(receivedQuantity));
    }
    if (goodsBase > 0n) {
      const inventory = await systemAccount(tx, opts.tenantId, "INVENTORY");
      const grni = await systemAccount(tx, opts.tenantId, "GRNI");
      await postJournal(tx, {
        tenantId: opts.tenantId,
        date: receipt.receivedAt,
        memo: `Goods receipt ${receipt.number} — PO ${po.number}`,
        sourceType: "goods_receipt",
        sourceId: receipt.id,
        createdBy: opts.actorUserId,
        lines: [
          {
            accountId: inventory.id,
            debit: fromCents(goodsBase),
            originalAmount: fromCents(goodsOriginal),
            originalCurrency: po.currency,
            exchangeRate: po.rateToBase,
          },
          { accountId: grni.id, credit: fromCents(goodsBase) },
        ],
      });
    }
    const fullyReceived = poLines.every((line) =>
      (receivedByPoLine.get(line.id) ?? 0n) === quantityUnits(line.quantity));
    if (fullyReceived) {
      await tx.update(schema.purchaseOrders).set({ status: "RECEIVED", receivedAt: receipt.receivedAt })
        .where(and(eq(schema.purchaseOrders.id, po.id), eq(schema.purchaseOrders.tenantId, opts.tenantId)));
    }
    await audit(tx, opts.tenantId, opts.actorUserId, "goods_receipt.posted", "goods_receipt", receipt.id, {
      number,
      purchaseOrderId: po.id,
      purchaseOrderNumber: po.number,
      lineCount: insertedLines.length,
      purchaseOrderStatus: fullyReceived ? "RECEIVED" : "ORDERED",
      baseValue: fromCents(goodsBase),
    });
    return {
      receipt,
      lines: insertedLines,
      purchaseOrderStatus: fullyReceived ? "RECEIVED" : "ORDERED",
      replayed: false,
    };
  }));
}
