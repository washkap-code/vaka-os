import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import type { TaxTreatment } from "./platform/localisation/types.js";
import {
  assertIdempotencyFingerprint, audit, badRequest, conflict, db, fromCents,
  mulRate, nextDocNumber, notFound, payloadFingerprint, requireIdempotencyKey,
  schema, toCents, type DB,
} from "./lib.js";
import { postJournal, systemAccount } from "./accounting.js";
import { documentTaxTreatment, resolveTax, taxRateString } from "./tax.js";
import { DOMAIN_EVENTS, runWithPostCommitEvents } from "./platform/events/index.js";

const quantity = z.string().trim()
  .regex(/^\d{1,9}(\.\d{1,3})?$/, "Quantity must be positive with no more than 3 decimal places")
  .refine((value) => quantityUnits(value) > 0n, "Quantity must be greater than zero");
const positiveMoney = z.string().trim()
  .regex(/^\d{1,12}(\.\d{1,2})?$/, "Price must have no more than 2 decimal places")
  .refine((value) => toCents(value) > 0n, "Price must be greater than zero");
const positiveRate = z.string().trim()
  .regex(/^\d{1,12}(\.\d{1,6})?$/, "Exchange rate must have no more than 6 decimal places")
  .refine((value) => Number(value) > 0, "Exchange rate must be greater than zero");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tax date must be YYYY-MM-DD");
const draftFields = z.object({
  supplierInvoiceNumber: z.string().trim().min(1).max(120),
  billDate: z.coerce.date(),
  taxDate: isoDate,
  dueDate: z.coerce.date(),
  rateToBase: positiveRate,
  lines: z.array(z.object({
    purchaseOrderLineItemId: z.string().uuid(),
    quantity,
    unitPrice: positiveMoney,
    taxTreatment: z.enum(["standard", "zero-rated", "exempt"]).default("standard"),
  }).strict()).min(1).max(100)
    .refine((lines) => new Set(lines.map((line) => line.purchaseOrderLineItemId)).size === lines.length,
      "A purchase-order line may appear only once on a supplier bill"),
}).strict().refine((value) => value.dueDate >= value.billDate, {
  message: "Due date cannot be before bill date", path: ["dueDate"],
});

export const supplierBillCreateSchema = draftFields.extend({ purchaseOrderId: z.string().uuid() }).strict();
export const supplierBillUpdateSchema = draftFields;
export const supplierBillPostSchema = z.object({ confirmed: z.literal(true) }).strict();
export type SupplierBillDraftInput = z.infer<typeof draftFields>;

export const MATCH_REASON_CODES = [
  "SUPPLIER_MISMATCH", "CURRENCY_MISMATCH", "LINE_NOT_ON_PO", "PRICE_MISMATCH",
  "QUANTITY_EXCEEDS_RECEIVED", "QUANTITY_EXCEEDS_ORDERED", "DUPLICATE_SUPPLIER_INVOICE",
  "NO_RECEIPT_EVIDENCE",
] as const;
export type MatchReasonCode = typeof MATCH_REASON_CODES[number];
export type MatchReason = {
  code: MatchReasonCode;
  message: string;
  purchaseOrderLineItemId?: string;
};
export type MatchResult = {
  status: "MATCHED" | "BLOCKED";
  reasons: MatchReason[];
  evaluatedAt: string;
  totals: { orderedLines: number; billLines: number; receivedQuantity: string; billedQuantity: string };
  lines: Array<{
    purchaseOrderLineItemId: string;
    orderedQuantity: string;
    receivedQuantity: string;
    previouslyBilledQuantity: string;
    currentBillQuantity: string;
    approvedUnitPrice: string;
    billUnitPrice: string;
  }>;
};

type BillRow = typeof schema.supplierBills.$inferSelect;
type BillLineRow = typeof schema.supplierBillLineItems.$inferSelect;
type PoRow = typeof schema.purchaseOrders.$inferSelect;
type PoLineRow = typeof schema.purchaseOrderLineItems.$inferSelect;

function isSupplierInvoiceConflict(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; constraint?: unknown; cause?: unknown };
  if (candidate.code === "23505" && candidate.constraint === "supplier_bills_tenant_supplier_invoice") return true;
  return candidate.cause ? isSupplierInvoiceConflict(candidate.cause) : false;
}

function quantityUnits(value: string): bigint {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 1000n + BigInt((fraction + "000").slice(0, 3));
}

function fromQuantityUnits(value: bigint): string {
  const whole = value / 1000n;
  const fraction = (value % 1000n).toString().padStart(3, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function lineAmounts(unitPrice: string, quantityValue: string, rate: string) {
  const net = mulRate(toCents(unitPrice), quantityValue);
  const tax = mulRate(net, (Number(rate) / 100).toFixed(6));
  if (net + tax > 99_999_999_999_999n) throw badRequest("Supplier-bill line total exceeds the supported money range");
  return { net: fromCents(net), tax: fromCents(tax), total: fromCents(net + tax) };
}

async function loadPo(tx: DB, tenantId: string, purchaseOrderId: string, lock = false) {
  let query = tx.select().from(schema.purchaseOrders).where(and(
    eq(schema.purchaseOrders.id, purchaseOrderId), eq(schema.purchaseOrders.tenantId, tenantId),
  ));
  const rows = lock ? await query.for("update") : await query;
  const po = rows[0];
  if (!po) throw notFound("Purchase order not found");
  if (!(["ORDERED", "RECEIVED"] as string[]).includes(po.status) || !po.number || !po.approvedAt) {
    throw conflict("Supplier bills require an approved purchase order");
  }
  return po;
}

async function loadPoLines(tx: DB, po: PoRow) {
  return tx.select().from(schema.purchaseOrderLineItems)
    .where(eq(schema.purchaseOrderLineItems.purchaseOrderId, po.id)).orderBy(asc(schema.purchaseOrderLineItems.id));
}

async function assertSupplierInvoiceAvailable(
  tx: DB, tenantId: string, vendorContactId: string, supplierInvoiceNumber: string, excludeId?: string,
) {
  const predicates = [
    eq(schema.supplierBills.tenantId, tenantId),
    eq(schema.supplierBills.vendorContactId, vendorContactId),
    sql`lower(${schema.supplierBills.supplierInvoiceNumber}) = lower(${supplierInvoiceNumber})`,
  ];
  if (excludeId) predicates.push(ne(schema.supplierBills.id, excludeId));
  const [duplicate] = await tx.select({ id: schema.supplierBills.id }).from(schema.supplierBills)
    .where(and(...predicates)).limit(1);
  if (duplicate) throw conflict("DUPLICATE_SUPPLIER_INVOICE: This supplier invoice number is already recorded");
}

async function resolveDraft(
  tx: DB, tenantId: string, po: PoRow, input: SupplierBillDraftInput,
) {
  const [tenant] = await tx.select({ countryCode: schema.tenants.countryCode }).from(schema.tenants)
    .where(eq(schema.tenants.id, tenantId));
  if (!tenant) throw notFound("Tenant not found");
  const poLines = await loadPoLines(tx, po);
  const poLineById = new Map(poLines.map((line) => [line.id, line]));
  let subtotal = 0n; let taxTotal = 0n;
  const lines = input.lines.map((line, index) => {
    const poLine = poLineById.get(line.purchaseOrderLineItemId);
    if (!poLine) throw badRequest("LINE_NOT_ON_PO: Every supplier-bill line must belong to the selected purchase order");
    const resolution = resolveTax(tenant.countryCode, line.taxTreatment, input.taxDate);
    const taxRate = taxRateString(resolution);
    const amounts = lineAmounts(line.unitPrice, line.quantity, taxRate);
    subtotal += toCents(amounts.net); taxTotal += toCents(amounts.tax);
    return {
      tenantId, purchaseOrderLineItemId: poLine.id, productId: poLine.productId, position: index + 1,
      quantity: line.quantity, unitPrice: line.unitPrice, netAmount: amounts.net,
      taxTreatment: line.taxTreatment, taxRate,
      taxRateEffectiveFrom: resolution.effectiveFrom, taxRateEffectiveTo: resolution.effectiveTo,
      taxAmount: amounts.tax, lineTotal: amounts.total,
    };
  });
  return {
    lines,
    taxJurisdiction: tenant.countryCode,
    taxTreatment: documentTaxTreatment(input.lines.map((line) => line.taxTreatment as TaxTreatment)),
    subtotal: fromCents(subtotal), taxTotal: fromCents(taxTotal), total: fromCents(subtotal + taxTotal),
  };
}

async function replaceLines(
  tx: DB, tenantId: string, billId: string, lines: Awaited<ReturnType<typeof resolveDraft>>["lines"],
) {
  await tx.delete(schema.supplierBillLineItems).where(and(
    eq(schema.supplierBillLineItems.tenantId, tenantId),
    eq(schema.supplierBillLineItems.supplierBillId, billId),
  ));
  return tx.insert(schema.supplierBillLineItems).values(lines.map((line) => ({ ...line, supplierBillId: billId }))).returning();
}

async function loadBill(tx: DB, tenantId: string, billId: string, lock = false): Promise<BillRow> {
  let query = tx.select().from(schema.supplierBills).where(and(
    eq(schema.supplierBills.id, billId), eq(schema.supplierBills.tenantId, tenantId),
  ));
  const rows = lock ? await query.for("update") : await query;
  if (!rows[0]) throw notFound("Supplier bill not found");
  return rows[0];
}

async function billLines(tx: DB, tenantId: string, billId: string): Promise<BillLineRow[]> {
  return tx.select().from(schema.supplierBillLineItems).where(and(
    eq(schema.supplierBillLineItems.tenantId, tenantId),
    eq(schema.supplierBillLineItems.supplierBillId, billId),
  )).orderBy(asc(schema.supplierBillLineItems.position));
}

export async function createSupplierBill(opts: {
  tenantId: string; actorUserId: string; input: z.infer<typeof supplierBillCreateSchema>;
}) {
  try {
    return await db.transaction(async (tx) => {
      const po = await loadPo(tx, opts.tenantId, opts.input.purchaseOrderId);
      await assertSupplierInvoiceAvailable(tx, opts.tenantId, po.vendorContactId, opts.input.supplierInvoiceNumber);
      const resolved = await resolveDraft(tx, opts.tenantId, po, opts.input);
      const [bill] = await tx.insert(schema.supplierBills).values({
        tenantId: opts.tenantId, purchaseOrderId: po.id, vendorContactId: po.vendorContactId,
        supplierInvoiceNumber: opts.input.supplierInvoiceNumber, billDate: opts.input.billDate,
        taxDate: opts.input.taxDate, dueDate: opts.input.dueDate, currency: po.currency,
        rateToBase: opts.input.rateToBase, taxJurisdiction: resolved.taxJurisdiction,
        taxTreatment: resolved.taxTreatment, subtotal: resolved.subtotal, taxTotal: resolved.taxTotal,
        total: resolved.total, createdBy: opts.actorUserId, updatedBy: opts.actorUserId,
      }).returning();
      const lines = await replaceLines(tx, opts.tenantId, bill.id, resolved.lines);
      await audit(tx, opts.tenantId, opts.actorUserId, "supplier_bill.draft_created", "supplier_bill", bill.id, {
        purchaseOrderId: po.id, lineCount: lines.length, currency: po.currency,
        subtotal: bill.subtotal, taxTotal: bill.taxTotal, total: bill.total,
      });
      return { ...bill, lines };
    });
  } catch (error) {
    if (isSupplierInvoiceConflict(error)) throw conflict("DUPLICATE_SUPPLIER_INVOICE: This supplier invoice number is already recorded");
    throw error;
  }
}

export async function updateSupplierBill(opts: {
  tenantId: string; actorUserId: string; billId: string; input: SupplierBillDraftInput;
}) {
  try {
    return await db.transaction(async (tx) => {
      const bill = await loadBill(tx, opts.tenantId, opts.billId, true);
      if (bill.status !== "DRAFT") throw conflict("Posted supplier bills are immutable");
      const po = await loadPo(tx, opts.tenantId, bill.purchaseOrderId);
      await assertSupplierInvoiceAvailable(tx, opts.tenantId, po.vendorContactId, opts.input.supplierInvoiceNumber, bill.id);
      const resolved = await resolveDraft(tx, opts.tenantId, po, opts.input);
      const [updated] = await tx.update(schema.supplierBills).set({
        supplierInvoiceNumber: opts.input.supplierInvoiceNumber, billDate: opts.input.billDate,
        taxDate: opts.input.taxDate, dueDate: opts.input.dueDate, rateToBase: opts.input.rateToBase,
        taxJurisdiction: resolved.taxJurisdiction, taxTreatment: resolved.taxTreatment,
        subtotal: resolved.subtotal, taxTotal: resolved.taxTotal, total: resolved.total,
        matchStatus: "PENDING", matchEvidence: null, matchedAt: null,
        updatedBy: opts.actorUserId, updatedAt: new Date(),
      }).where(and(eq(schema.supplierBills.id, bill.id), eq(schema.supplierBills.tenantId, opts.tenantId))).returning();
      const lines = await replaceLines(tx, opts.tenantId, bill.id, resolved.lines);
      await audit(tx, opts.tenantId, opts.actorUserId, "supplier_bill.draft_updated", "supplier_bill", bill.id, {
        purchaseOrderId: po.id, lineCount: lines.length, previousTotal: bill.total, total: updated.total,
      });
      return { ...updated, lines };
    });
  } catch (error) {
    if (isSupplierInvoiceConflict(error)) throw conflict("DUPLICATE_SUPPLIER_INVOICE: This supplier invoice number is already recorded");
    throw error;
  }
}

export async function listSupplierBills(tenantId: string) {
  const headers = await db.select().from(schema.supplierBills)
    .where(eq(schema.supplierBills.tenantId, tenantId)).orderBy(desc(schema.supplierBills.createdAt));
  const lines = await db.select().from(schema.supplierBillLineItems)
    .where(eq(schema.supplierBillLineItems.tenantId, tenantId)).orderBy(asc(schema.supplierBillLineItems.position));
  return headers.map((bill) => ({ ...bill, lines: lines.filter((line) => line.supplierBillId === bill.id) }));
}

export async function getSupplierBill(tenantId: string, billId: string) {
  const bill = await loadBill(db, tenantId, billId);
  return { ...bill, lines: await billLines(db, tenantId, bill.id) };
}

async function evaluateMatchInTx(
  tx: DB, tenantId: string, bill: BillRow, lines: BillLineRow[], po?: PoRow,
): Promise<MatchResult> {
  const purchaseOrder = po ?? await loadPo(tx, tenantId, bill.purchaseOrderId);
  const poLines = await loadPoLines(tx, purchaseOrder);
  const poLineById = new Map(poLines.map((line) => [line.id, line]));
  const poLineIds = poLines.map((line) => line.id);
  const receiptLines = poLineIds.length ? await tx.select().from(schema.goodsReceiptLineItems).where(and(
    eq(schema.goodsReceiptLineItems.tenantId, tenantId),
    inArray(schema.goodsReceiptLineItems.purchaseOrderLineItemId, poLineIds),
  )) : [];
  const postedLines = poLineIds.length ? await tx.select({
    purchaseOrderLineItemId: schema.supplierBillLineItems.purchaseOrderLineItemId,
    quantity: schema.supplierBillLineItems.quantity,
  }).from(schema.supplierBillLineItems).innerJoin(schema.supplierBills, and(
    eq(schema.supplierBills.id, schema.supplierBillLineItems.supplierBillId),
    eq(schema.supplierBills.tenantId, tenantId),
    eq(schema.supplierBills.purchaseOrderId, purchaseOrder.id),
    eq(schema.supplierBills.status, "POSTED"),
    ne(schema.supplierBills.id, bill.id),
  )).where(eq(schema.supplierBillLineItems.tenantId, tenantId)) : [];
  const [duplicate] = await tx.select({ id: schema.supplierBills.id }).from(schema.supplierBills).where(and(
    eq(schema.supplierBills.tenantId, tenantId), eq(schema.supplierBills.vendorContactId, bill.vendorContactId),
    sql`lower(${schema.supplierBills.supplierInvoiceNumber}) = lower(${bill.supplierInvoiceNumber})`,
    ne(schema.supplierBills.id, bill.id),
  )).limit(1);

  const reasons: MatchReason[] = [];
  if (bill.vendorContactId !== purchaseOrder.vendorContactId) reasons.push({ code: "SUPPLIER_MISMATCH", message: "Bill supplier does not match the purchase order supplier" });
  if (bill.currency !== purchaseOrder.currency) reasons.push({ code: "CURRENCY_MISMATCH", message: "Bill currency does not match the purchase order currency" });
  if (duplicate) reasons.push({ code: "DUPLICATE_SUPPLIER_INVOICE", message: "Supplier invoice number is already recorded" });
  if (!receiptLines.length) reasons.push({ code: "NO_RECEIPT_EVIDENCE", message: "No posted goods receipt exists for this purchase order" });

  const received = new Map<string, bigint>();
  const previouslyBilled = new Map<string, bigint>();
  for (const line of receiptLines) received.set(line.purchaseOrderLineItemId,
    (received.get(line.purchaseOrderLineItemId) ?? 0n) + quantityUnits(line.quantityReceived));
  for (const line of postedLines) previouslyBilled.set(line.purchaseOrderLineItemId,
    (previouslyBilled.get(line.purchaseOrderLineItemId) ?? 0n) + quantityUnits(line.quantity));
  let receivedTotal = 0n; let billedTotal = 0n;
  for (const value of received.values()) receivedTotal += value;
  const lineEvidence: MatchResult["lines"] = [];
  for (const line of lines) {
    const poLine = poLineById.get(line.purchaseOrderLineItemId);
    if (!poLine) {
      reasons.push({ code: "LINE_NOT_ON_PO", message: "Bill line is not part of the selected purchase order", purchaseOrderLineItemId: line.purchaseOrderLineItemId });
      continue;
    }
    if (toCents(line.unitPrice) !== toCents(poLine.unitCost)) reasons.push({
      code: "PRICE_MISMATCH", message: "Bill unit price does not equal the approved purchase-order price",
      purchaseOrderLineItemId: line.purchaseOrderLineItemId,
    });
    const cumulative = (previouslyBilled.get(poLine.id) ?? 0n) + quantityUnits(line.quantity);
    billedTotal += quantityUnits(line.quantity);
    lineEvidence.push({
      purchaseOrderLineItemId: poLine.id,
      orderedQuantity: poLine.quantity,
      receivedQuantity: fromQuantityUnits(received.get(poLine.id) ?? 0n),
      previouslyBilledQuantity: fromQuantityUnits(previouslyBilled.get(poLine.id) ?? 0n),
      currentBillQuantity: line.quantity,
      approvedUnitPrice: poLine.unitCost,
      billUnitPrice: line.unitPrice,
    });
    if (cumulative > quantityUnits(poLine.quantity)) reasons.push({
      code: "QUANTITY_EXCEEDS_ORDERED", message: "Cumulative billed quantity exceeds the ordered quantity",
      purchaseOrderLineItemId: line.purchaseOrderLineItemId,
    });
    if (cumulative > (received.get(poLine.id) ?? 0n)) reasons.push({
      code: "QUANTITY_EXCEEDS_RECEIVED", message: "Cumulative billed quantity exceeds the physically received quantity",
      purchaseOrderLineItemId: line.purchaseOrderLineItemId,
    });
  }
  return {
    status: reasons.length ? "BLOCKED" : "MATCHED", reasons, evaluatedAt: new Date().toISOString(),
    totals: { orderedLines: poLines.length, billLines: lines.length,
      receivedQuantity: fromQuantityUnits(receivedTotal), billedQuantity: fromQuantityUnits(billedTotal) },
    lines: lineEvidence,
  };
}

export async function evaluateSupplierBillMatch(tenantId: string, billId: string) {
  const bill = await loadBill(db, tenantId, billId);
  return evaluateMatchInTx(db, tenantId, bill, await billLines(db, tenantId, bill.id));
}

export async function postSupplierBill(opts: {
  tenantId: string; actorUserId: string; billId: string; idempotencyKey: string; confirmed: true;
}) {
  const idempotencyKey = requireIdempotencyKey(opts.idempotencyKey);
  const fingerprint = payloadFingerprint({ action: "supplier_bill_post", billId: opts.billId });
  return runWithPostCommitEvents((queue) => db.transaction(async (tx) => {
    // Serialize identical tenant/key requests even when they target different bills or POs.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${opts.tenantId}:${idempotencyKey}`}, 0))`);
    const [replay] = await tx.select().from(schema.supplierBills).where(and(
      eq(schema.supplierBills.tenantId, opts.tenantId),
      eq(schema.supplierBills.postingIdempotencyKey, idempotencyKey),
    ));
    if (replay) {
      assertIdempotencyFingerprint(replay.postingIdempotencyFingerprint, fingerprint, "supplier-bill posting");
      return { bill: replay, replayed: true };
    }
    const bill = await loadBill(tx, opts.tenantId, opts.billId, true);
    if (bill.status !== "DRAFT") {
      if (bill.postingIdempotencyKey === idempotencyKey) {
        assertIdempotencyFingerprint(bill.postingIdempotencyFingerprint, fingerprint, "supplier-bill posting");
        return { bill, replayed: true };
      }
      throw conflict("Supplier bill is already posted and immutable");
    }
    const po = await loadPo(tx, opts.tenantId, bill.purchaseOrderId, true);
    const lines = await billLines(tx, opts.tenantId, bill.id);
    const match = await evaluateMatchInTx(tx, opts.tenantId, bill, lines, po);
    if (match.status !== "MATCHED") {
      throw conflict(`Three-way match blocked: ${match.reasons.map((reason) => reason.code).join(", ")}`);
    }

    let grniBase = 0n; let netBillBase = 0n; let vatBase = 0n;
    for (const line of lines) {
      grniBase += mulRate(toCents(line.netAmount), po.rateToBase);
      netBillBase += mulRate(toCents(line.netAmount), bill.rateToBase);
      vatBase += mulRate(toCents(line.taxAmount), bill.rateToBase);
    }
    const apBase = netBillBase + vatBase;
    const fxDifference = netBillBase - grniBase;
    const grni = await systemAccount(tx, opts.tenantId, "GRNI");
    const vatInput = vatBase > 0n ? await systemAccount(tx, opts.tenantId, "VAT_INPUT") : null;
    const ap = await systemAccount(tx, opts.tenantId, "AP");
    const fx = fxDifference !== 0n ? await systemAccount(tx, opts.tenantId, "FX_GAIN_LOSS") : null;
    const journalLines = [
      { accountId: grni.id, debit: fromCents(grniBase), originalAmount: bill.subtotal,
        originalCurrency: bill.currency, exchangeRate: po.rateToBase },
      ...(vatInput ? [{ accountId: vatInput.id, debit: fromCents(vatBase), originalAmount: bill.taxTotal,
        originalCurrency: bill.currency, exchangeRate: bill.rateToBase }] : []),
      ...(fx && fxDifference > 0n ? [{ accountId: fx.id, debit: fromCents(fxDifference) }] : []),
      { accountId: ap.id, credit: fromCents(apBase), originalAmount: bill.total,
        originalCurrency: bill.currency, exchangeRate: bill.rateToBase },
      ...(fx && fxDifference < 0n ? [{ accountId: fx.id, credit: fromCents(-fxDifference) }] : []),
    ];
    const number = await nextDocNumber(tx, opts.tenantId, "supplier_bill", "BILL");
    const postedAt = new Date();
    const journalEntryId = await postJournal(tx, {
      tenantId: opts.tenantId, date: bill.billDate, memo: `Supplier bill ${number}`,
      sourceType: "supplier_bill", sourceId: bill.id, createdBy: opts.actorUserId, lines: journalLines,
    });
    const [posted] = await tx.update(schema.supplierBills).set({
      number, status: "POSTED", matchStatus: "MATCHED", matchEvidence: match, matchedAt: postedAt,
      postingIdempotencyKey: idempotencyKey, postingIdempotencyFingerprint: fingerprint,
      postedBy: opts.actorUserId, postedAt, updatedBy: opts.actorUserId, updatedAt: postedAt,
    }).where(and(eq(schema.supplierBills.id, bill.id), eq(schema.supplierBills.tenantId, opts.tenantId))).returning();
    await audit(tx, opts.tenantId, opts.actorUserId, "supplier_bill.posted", "supplier_bill", bill.id, {
      number, purchaseOrderId: po.id, journalEntryId, matchStatus: match.status,
      subtotal: bill.subtotal, taxTotal: bill.taxTotal, total: bill.total, currency: bill.currency,
    });
    queue({
      id: `${DOMAIN_EVENTS.SUPPLIER_BILL_POSTED}:${bill.id}`, type: DOMAIN_EVENTS.SUPPLIER_BILL_POSTED,
      tenantId: opts.tenantId, actorUserId: opts.actorUserId,
      payload: { supplierBillId: bill.id, purchaseOrderId: po.id, supplierId: bill.vendorContactId,
        number, currency: bill.currency, totalCents: toCents(bill.total).toString() },
    });
    return { bill: posted, match, journalEntryId, replayed: false };
  }));
}
