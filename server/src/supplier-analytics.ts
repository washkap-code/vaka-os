import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, notFound, schema } from "./lib.js";
import { fromMinorUnits as fromCents, toMinorUnits as toCents } from "./reports.js";
import {
  evaluateSupplierBillMatch, MATCH_REASON_CODES, type MatchReasonCode,
} from "./supplier-bills.js";

const DAY_MS = 86_400_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_PERIOD_DAYS = 366;
const DECIMAL_PATTERN = /^-?\d+(?:\.\d{1,6})?$/;
type Currency = "USD" | "ZWG";

function isCalendarDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export const supplierAnalyticsQuerySchema = z.object({
  from: z.string().refine(isCalendarDate, "From date must be a valid YYYY-MM-DD calendar date"),
  to: z.string().refine(isCalendarDate, "To date must be a valid YYYY-MM-DD calendar date"),
  asAt: z.string().refine(isCalendarDate, "As-at date must be a valid YYYY-MM-DD calendar date"),
  supplierId: z.string().uuid().optional(),
}).strict().superRefine((period, context) => {
  if (![period.from, period.to, period.asAt].every(isCalendarDate)) return;
  const from = Date.parse(`${period.from}T00:00:00.000Z`);
  const to = Date.parse(`${period.to}T00:00:00.000Z`);
  const asAt = Date.parse(`${period.asAt}T00:00:00.000Z`);
  if (to < from) context.addIssue({ code: "custom", path: ["to"], message: "To date must be on or after from date" });
  if (asAt < to) context.addIssue({ code: "custom", path: ["asAt"], message: "As-at date must be on or after to date" });
  if (Math.floor((to - from) / DAY_MS) + 1 > MAX_PERIOD_DAYS) {
    context.addIssue({ code: "custom", path: ["to"], message: `Report period cannot exceed ${MAX_PERIOD_DAYS} days` });
  }
});

export type SupplierAnalyticsQuery = z.infer<typeof supplierAnalyticsQuerySchema>;

type SpendRow = {
  bill_id: string;
  supplier_id: string;
  supplier_name: string;
  currency: Currency;
  rate_to_base: string;
  subtotal: string;
  tax_total: string;
  total: string;
  line_net: string;
  line_tax: string;
  ap_base: string;
};

type DeliveryRow = {
  supplier_id: string;
  supplier_name: string;
  purchase_order_id: string;
  expected_date: Date | string | null;
  received_at: Date | string;
};

type DraftRow = {
  bill_id: string;
  supplier_id: string;
  supplier_name: string;
  supplier_invoice_number: string;
};

type DraftVarianceRow = {
  bill_id: string;
  supplier_id: string;
  supplier_name: string;
  supplier_invoice_number: string;
  purchase_order_id: string;
  purchase_order_line_id: string;
  currency: Currency;
  po_rate: string;
  quantity: string;
  approved_unit_price: string;
  bill_unit_price: string;
};

type ReceiptExposureRow = {
  supplier_id: string;
  supplier_name: string;
  currency: Currency;
  po_rate: string;
  quantity: string;
  line_total: string;
};

type BillExposureRow = ReceiptExposureRow;

type ApExposureRow = {
  bill_id: string;
  supplier_id: string;
  supplier_name: string;
  currency: Currency;
  original_total: string;
  base_total: string;
};

export type SupplierSpendRow = {
  supplierId: string;
  supplierName: string;
  currency: Currency;
  postedBillCount: number;
  originalNet: string;
  originalTax: string;
  originalGross: string;
  baseNet: string;
  baseTax: string;
  baseGross: string;
  baseSourceDifference: string;
};

export type SupplierDeliveryRow = {
  supplierId: string;
  supplierName: string;
  completedOrders: number;
  eligibleOrders: number;
  onTimeOrders: number;
  lateOrders: number;
  missingExpectedDate: number;
  onTimeRateBasisPoints: number | null;
};

export type SupplierExposureRow = {
  supplierId: string;
  supplierName: string;
  currency: Currency;
  receivedQuantity: string;
  billedQuantity: string;
  receivedOriginal: string;
  billedOriginal: string;
  openOriginal: string;
  receivedBase: string;
  billedBase: string;
  openBase: string;
};

export type SupplierApExposureRow = {
  supplierId: string;
  supplierName: string;
  currency: Currency;
  postedBillCount: number;
  originalGross: string;
  baseGross: string;
};

function rowsOf<T>(result: unknown): T[] {
  return (result as { rows: T[] }).rows;
}

function quantityUnits(value: string): bigint {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 1000n + BigInt((fraction + "000").slice(0, 3));
}

function mulRate(cents: bigint, decimal: string): bigint {
  const value = decimal.trim();
  if (!DECIMAL_PATTERN.test(value)) throw new Error(`Expected an exact six-decimal value, received: ${decimal}`);
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = value.replace("-", "").split(".");
  const units = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
  const product = cents * (negative ? -units : units);
  const absolute = product < 0n ? -product : product;
  const rounded = (absolute + 500_000n) / 1_000_000n;
  return product < 0n ? -rounded : rounded;
}

function fromQuantityUnits(value: bigint): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const fraction = (absolute % 1000n).toString().padStart(3, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${absolute / 1000n}${fraction ? `.${fraction}` : ""}`;
}

function basisPoints(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : Math.round((numerator * 10_000) / denominator);
}

function utcDate(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Supplier analytics source has an invalid date");
  return date.toISOString().slice(0, 10);
}

function filterBySupplier<T extends { supplierId: string }>(rows: T[], supplierId?: string): T[] {
  return supplierId ? rows.filter((row) => row.supplierId === supplierId) : rows;
}

async function controlCreditBalance(tenantId: string, systemKey: "GRNI" | "AP", asAtExclusive: Date): Promise<bigint> {
  const result = await db.execute(sql`
    SELECT a.id, COALESCE(t.credit_balance, 0)::text AS credit_balance
    FROM accounts a
    LEFT JOIN (
      SELECT jl.account_id, SUM(jl.credit - jl.debit) AS credit_balance
      FROM journal_lines jl
      JOIN journal_entries je ON je.id = jl.journal_entry_id
      WHERE je.tenant_id = ${tenantId} AND je.date < ${asAtExclusive}
      GROUP BY jl.account_id
    ) t ON t.account_id = a.id
    WHERE a.tenant_id = ${tenantId} AND a.system_key = ${systemKey}
  `);
  const row = rowsOf<{ credit_balance: string }>(result)[0];
  if (!row) throw new Error(`${systemKey} control account is unavailable`);
  return toCents(row.credit_balance);
}

async function spendRows(tenantId: string, from: Date, toExclusive: Date): Promise<SpendRow[]> {
  const result = await db.execute(sql`
    SELECT sb.id::text AS bill_id, sb.vendor_contact_id::text AS supplier_id,
      c.name AS supplier_name, sb.currency, sb.rate_to_base::text,
      sb.subtotal::text, sb.tax_total::text, sb.total::text,
      sbl.net_amount::text AS line_net, sbl.tax_amount::text AS line_tax,
      COALESCE(ap.base_total, 0)::text AS ap_base
    FROM supplier_bills sb
    JOIN contacts c ON c.id = sb.vendor_contact_id AND c.tenant_id = sb.tenant_id
    JOIN supplier_bill_line_items sbl ON sbl.supplier_bill_id = sb.id AND sbl.tenant_id = sb.tenant_id
    LEFT JOIN (
      SELECT je.source_id, SUM(jl.credit - jl.debit) AS base_total
      FROM journal_entries je
      JOIN journal_lines jl ON jl.journal_entry_id = je.id
      JOIN accounts a ON a.id = jl.account_id AND a.tenant_id = je.tenant_id AND a.system_key = 'AP'
      WHERE je.tenant_id = ${tenantId} AND je.source_type = 'supplier_bill'
      GROUP BY je.source_id
    ) ap ON ap.source_id = sb.id::text
    WHERE sb.tenant_id = ${tenantId} AND sb.status = 'POSTED'
      AND sb.posted_at >= ${from} AND sb.posted_at < ${toExclusive}
    ORDER BY c.name, sb.currency, sb.id, sbl.position
  `);
  return rowsOf<SpendRow>(result);
}

function buildSpend(rows: SpendRow[]): SupplierSpendRow[] {
  type Mutable = Omit<SupplierSpendRow,
    "originalNet" | "originalTax" | "originalGross" | "baseNet" | "baseTax" | "baseGross" | "baseSourceDifference"> & {
      originalNet: bigint; originalTax: bigint; originalGross: bigint;
      baseNet: bigint; baseTax: bigint; baseGross: bigint; baseSourceDifference: bigint;
    };
  const groups = new Map<string, Mutable>();
  const seenBills = new Set<string>();
  for (const row of rows) {
    const key = `${row.supplier_id}:${row.currency}`;
    const group = groups.get(key) ?? {
      supplierId: row.supplier_id, supplierName: row.supplier_name, currency: row.currency,
      postedBillCount: 0, originalNet: 0n, originalTax: 0n, originalGross: 0n,
      baseNet: 0n, baseTax: 0n, baseGross: 0n, baseSourceDifference: 0n,
    };
    group.baseNet += mulRate(toCents(row.line_net), row.rate_to_base);
    group.baseTax += mulRate(toCents(row.line_tax), row.rate_to_base);
    if (!seenBills.has(row.bill_id)) {
      seenBills.add(row.bill_id);
      group.postedBillCount += 1;
      group.originalNet += toCents(row.subtotal);
      group.originalTax += toCents(row.tax_total);
      group.originalGross += toCents(row.total);
      group.baseGross += toCents(row.ap_base);
    }
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({
    ...group,
    originalNet: fromCents(group.originalNet), originalTax: fromCents(group.originalTax),
    originalGross: fromCents(group.originalGross), baseNet: fromCents(group.baseNet),
    baseTax: fromCents(group.baseTax), baseGross: fromCents(group.baseGross),
    baseSourceDifference: fromCents(group.baseGross - group.baseNet - group.baseTax),
  }));
}

async function deliveryRows(tenantId: string, from: Date, toExclusive: Date): Promise<DeliveryRow[]> {
  const result = await db.execute(sql`
    SELECT po.vendor_contact_id::text AS supplier_id, c.name AS supplier_name,
      po.id::text AS purchase_order_id, po.expected_date, po.received_at
    FROM purchase_orders po
    JOIN contacts c ON c.id = po.vendor_contact_id AND c.tenant_id = po.tenant_id
    WHERE po.tenant_id = ${tenantId} AND po.status = 'RECEIVED'
      AND po.received_at >= ${from} AND po.received_at < ${toExclusive}
    ORDER BY c.name, po.received_at, po.id
  `);
  return rowsOf<DeliveryRow>(result);
}

function buildDelivery(rows: DeliveryRow[]): SupplierDeliveryRow[] {
  const groups = new Map<string, SupplierDeliveryRow>();
  for (const row of rows) {
    const group = groups.get(row.supplier_id) ?? {
      supplierId: row.supplier_id, supplierName: row.supplier_name,
      completedOrders: 0, eligibleOrders: 0, onTimeOrders: 0, lateOrders: 0,
      missingExpectedDate: 0, onTimeRateBasisPoints: null,
    };
    group.completedOrders += 1;
    if (!row.expected_date) group.missingExpectedDate += 1;
    else {
      group.eligibleOrders += 1;
      if (utcDate(row.received_at) <= utcDate(row.expected_date)) group.onTimeOrders += 1;
      else group.lateOrders += 1;
    }
    group.onTimeRateBasisPoints = basisPoints(group.onTimeOrders, group.eligibleOrders);
    groups.set(row.supplier_id, group);
  }
  return [...groups.values()];
}

async function currentDrafts(tenantId: string, from: Date, toExclusive: Date): Promise<DraftRow[]> {
  const result = await db.execute(sql`
    SELECT sb.id::text AS bill_id, sb.vendor_contact_id::text AS supplier_id,
      c.name AS supplier_name, sb.supplier_invoice_number
    FROM supplier_bills sb
    JOIN contacts c ON c.id = sb.vendor_contact_id AND c.tenant_id = sb.tenant_id
    WHERE sb.tenant_id = ${tenantId} AND sb.status = 'DRAFT'
      AND sb.bill_date >= ${from} AND sb.bill_date < ${toExclusive}
    ORDER BY c.name, sb.bill_date, sb.id
  `);
  return rowsOf<DraftRow>(result);
}

async function currentDraftVariance(tenantId: string, from: Date, toExclusive: Date): Promise<DraftVarianceRow[]> {
  const result = await db.execute(sql`
    SELECT sb.id::text AS bill_id, sb.vendor_contact_id::text AS supplier_id,
      c.name AS supplier_name, sb.supplier_invoice_number,
      po.id::text AS purchase_order_id, pol.id::text AS purchase_order_line_id,
      sb.currency, po.rate_to_base::text AS po_rate, sbl.quantity::text,
      pol.unit_cost::text AS approved_unit_price, sbl.unit_price::text AS bill_unit_price
    FROM supplier_bills sb
    JOIN contacts c ON c.id = sb.vendor_contact_id AND c.tenant_id = sb.tenant_id
    JOIN purchase_orders po ON po.id = sb.purchase_order_id AND po.tenant_id = sb.tenant_id
    JOIN supplier_bill_line_items sbl ON sbl.supplier_bill_id = sb.id AND sbl.tenant_id = sb.tenant_id
    JOIN purchase_order_line_items pol ON pol.id = sbl.purchase_order_line_item_id AND pol.purchase_order_id = po.id
    WHERE sb.tenant_id = ${tenantId} AND sb.status = 'DRAFT'
      AND sb.bill_date >= ${from} AND sb.bill_date < ${toExclusive}
    ORDER BY c.name, sb.id, sbl.position
  `);
  return rowsOf<DraftVarianceRow>(result);
}

async function matchExceptions(tenantId: string, drafts: DraftRow[]) {
  const counts = new Map<MatchReasonCode, number>(MATCH_REASON_CODES.map((code) => [code, 0]));
  const bills: Array<{
    billId: string; supplierId: string; supplierName: string; supplierInvoiceNumber: string;
    reasons: Array<{ code: MatchReasonCode; purchaseOrderLineItemId?: string }>;
  }> = [];
  for (const draft of drafts) {
    const match = await evaluateSupplierBillMatch(tenantId, draft.bill_id);
    if (match.status === "MATCHED") continue;
    const reasons = match.reasons.map((reason) => ({
      code: reason.code,
      ...(reason.purchaseOrderLineItemId ? { purchaseOrderLineItemId: reason.purchaseOrderLineItemId } : {}),
    }));
    for (const reason of reasons) counts.set(reason.code, (counts.get(reason.code) ?? 0) + 1);
    bills.push({
      billId: draft.bill_id, supplierId: draft.supplier_id, supplierName: draft.supplier_name,
      supplierInvoiceNumber: draft.supplier_invoice_number, reasons,
    });
  }
  return {
    draftsEvaluated: drafts.length,
    blockedDrafts: bills.length,
    reasonCounts: MATCH_REASON_CODES.map((code) => ({ code, count: counts.get(code) ?? 0 }))
      .filter((row) => row.count > 0),
    bills,
  };
}

function buildDraftVariance(rows: DraftVarianceRow[]) {
  return rows.flatMap((row) => {
    const variancePerUnit = toCents(row.bill_unit_price) - toCents(row.approved_unit_price);
    if (variancePerUnit === 0n) return [];
    const originalVariance = mulRate(variancePerUnit, row.quantity);
    return [{
      billId: row.bill_id, supplierId: row.supplier_id, supplierName: row.supplier_name,
      supplierInvoiceNumber: row.supplier_invoice_number, purchaseOrderId: row.purchase_order_id,
      purchaseOrderLineItemId: row.purchase_order_line_id, currency: row.currency,
      quantity: row.quantity, approvedUnitPrice: row.approved_unit_price,
      billUnitPrice: row.bill_unit_price, variancePerUnit: fromCents(variancePerUnit),
      originalVariance: fromCents(originalVariance),
      baseVarianceAtPoRate: fromCents(mulRate(originalVariance, row.po_rate)),
      rateToBase: row.po_rate,
    }];
  });
}

async function receiptExposureRows(tenantId: string, asAtExclusive: Date): Promise<ReceiptExposureRow[]> {
  const result = await db.execute(sql`
    SELECT po.vendor_contact_id::text AS supplier_id, c.name AS supplier_name,
      po.currency, po.rate_to_base::text AS po_rate,
      grl.quantity_received::text AS quantity, grl.line_total::text
    FROM goods_receipt_line_items grl
    JOIN goods_receipts gr ON gr.id = grl.goods_receipt_id AND gr.tenant_id = grl.tenant_id
    JOIN purchase_orders po ON po.id = gr.purchase_order_id AND po.tenant_id = gr.tenant_id
    JOIN contacts c ON c.id = po.vendor_contact_id AND c.tenant_id = po.tenant_id
    WHERE grl.tenant_id = ${tenantId} AND gr.received_at < ${asAtExclusive}
    ORDER BY c.name, po.currency, gr.received_at, grl.id
  `);
  return rowsOf<ReceiptExposureRow>(result);
}

async function billExposureRows(tenantId: string, asAtExclusive: Date): Promise<BillExposureRow[]> {
  const result = await db.execute(sql`
    SELECT po.vendor_contact_id::text AS supplier_id, c.name AS supplier_name,
      po.currency, po.rate_to_base::text AS po_rate,
      sbl.quantity::text AS quantity, sbl.net_amount::text AS line_total
    FROM supplier_bill_line_items sbl
    JOIN supplier_bills sb ON sb.id = sbl.supplier_bill_id AND sb.tenant_id = sbl.tenant_id
    JOIN purchase_orders po ON po.id = sb.purchase_order_id AND po.tenant_id = sb.tenant_id
    JOIN contacts c ON c.id = po.vendor_contact_id AND c.tenant_id = po.tenant_id
    JOIN journal_entries je ON je.tenant_id = sb.tenant_id AND je.source_type = 'supplier_bill'
      AND je.source_id = sb.id::text AND je.date < ${asAtExclusive}
    WHERE sbl.tenant_id = ${tenantId} AND sb.status = 'POSTED' AND sb.posted_at < ${asAtExclusive}
    ORDER BY c.name, po.currency, sb.posted_at, sbl.id
  `);
  return rowsOf<BillExposureRow>(result);
}

function buildGrni(receipts: ReceiptExposureRow[], bills: BillExposureRow[]): SupplierExposureRow[] {
  type Mutable = Omit<SupplierExposureRow,
    "receivedQuantity" | "billedQuantity" | "receivedOriginal" | "billedOriginal" | "openOriginal" |
    "receivedBase" | "billedBase" | "openBase"> & {
      receivedQuantity: bigint; billedQuantity: bigint; receivedOriginal: bigint; billedOriginal: bigint;
      receivedBase: bigint; billedBase: bigint;
    };
  const groups = new Map<string, Mutable>();
  const groupFor = (row: ReceiptExposureRow) => {
    const key = `${row.supplier_id}:${row.currency}`;
    const group = groups.get(key) ?? {
      supplierId: row.supplier_id, supplierName: row.supplier_name, currency: row.currency,
      receivedQuantity: 0n, billedQuantity: 0n, receivedOriginal: 0n, billedOriginal: 0n,
      receivedBase: 0n, billedBase: 0n,
    };
    groups.set(key, group);
    return group;
  };
  for (const row of receipts) {
    const group = groupFor(row);
    const original = toCents(row.line_total);
    group.receivedQuantity += quantityUnits(row.quantity);
    group.receivedOriginal += original;
    group.receivedBase += mulRate(original, row.po_rate);
  }
  for (const row of bills) {
    const group = groupFor(row);
    const original = toCents(row.line_total);
    group.billedQuantity += quantityUnits(row.quantity);
    group.billedOriginal += original;
    group.billedBase += mulRate(original, row.po_rate);
  }
  return [...groups.values()].map((group) => ({
    ...group,
    receivedQuantity: fromQuantityUnits(group.receivedQuantity),
    billedQuantity: fromQuantityUnits(group.billedQuantity),
    receivedOriginal: fromCents(group.receivedOriginal), billedOriginal: fromCents(group.billedOriginal),
    openOriginal: fromCents(group.receivedOriginal - group.billedOriginal),
    receivedBase: fromCents(group.receivedBase), billedBase: fromCents(group.billedBase),
    openBase: fromCents(group.receivedBase - group.billedBase),
  })).filter((row) => toCents(row.openBase) !== 0n || toCents(row.openOriginal) !== 0n);
}

async function apExposureRows(tenantId: string, asAtExclusive: Date): Promise<ApExposureRow[]> {
  const result = await db.execute(sql`
    SELECT sb.id::text AS bill_id, sb.vendor_contact_id::text AS supplier_id,
      c.name AS supplier_name, sb.currency, sb.total::text AS original_total,
      COALESCE(SUM(jl.credit - jl.debit), 0)::text AS base_total
    FROM supplier_bills sb
    JOIN contacts c ON c.id = sb.vendor_contact_id AND c.tenant_id = sb.tenant_id
    JOIN journal_entries je ON je.tenant_id = sb.tenant_id AND je.source_type = 'supplier_bill'
      AND je.source_id = sb.id::text AND je.date < ${asAtExclusive}
    JOIN journal_lines jl ON jl.journal_entry_id = je.id
    JOIN accounts a ON a.id = jl.account_id AND a.tenant_id = sb.tenant_id AND a.system_key = 'AP'
    WHERE sb.tenant_id = ${tenantId} AND sb.status = 'POSTED' AND sb.posted_at < ${asAtExclusive}
    GROUP BY sb.id, sb.vendor_contact_id, c.name, sb.currency, sb.total
    ORDER BY c.name, sb.currency, sb.id
  `);
  return rowsOf<ApExposureRow>(result);
}

function buildAp(rows: ApExposureRow[]): SupplierApExposureRow[] {
  type Mutable = Omit<SupplierApExposureRow, "originalGross" | "baseGross"> & {
    originalGross: bigint; baseGross: bigint;
  };
  const groups = new Map<string, Mutable>();
  for (const row of rows) {
    const key = `${row.supplier_id}:${row.currency}`;
    const group = groups.get(key) ?? {
      supplierId: row.supplier_id, supplierName: row.supplier_name, currency: row.currency,
      postedBillCount: 0, originalGross: 0n, baseGross: 0n,
    };
    group.postedBillCount += 1;
    group.originalGross += toCents(row.original_total);
    group.baseGross += toCents(row.base_total);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({
    ...group, originalGross: fromCents(group.originalGross), baseGross: fromCents(group.baseGross),
  }));
}

function sumMoney<T>(rows: T[], select: (row: T) => string): bigint {
  return rows.reduce((total, row) => total + toCents(select(row)), 0n);
}

export async function getSupplierAnalytics(opts: {
  tenantId: string;
  query: SupplierAnalyticsQuery;
  generatedAt?: Date;
}) {
  const query = supplierAnalyticsQuerySchema.parse(opts.query);
  const from = new Date(`${query.from}T00:00:00.000Z`);
  const toExclusive = new Date(`${query.to}T00:00:00.000Z`);
  toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);
  const asAtExclusive = new Date(`${query.asAt}T00:00:00.000Z`);
  asAtExclusive.setUTCDate(asAtExclusive.getUTCDate() + 1);

  const [tenant] = await db.select({
    id: schema.tenants.id, companyName: schema.tenants.companyName, baseCurrency: schema.tenants.baseCurrency,
  }).from(schema.tenants).where(eq(schema.tenants.id, opts.tenantId));
  if (!tenant) throw new Error("Tenant context is unavailable");

  let selectedSupplier: { id: string; name: string } | null = null;
  if (query.supplierId) {
    const [supplier] = await db.select({ id: schema.contacts.id, name: schema.contacts.name })
      .from(schema.contacts).where(and(
        eq(schema.contacts.id, query.supplierId), eq(schema.contacts.tenantId, opts.tenantId),
        eq(schema.contacts.isVendor, true),
      ));
    if (!supplier) throw notFound("Supplier not found");
    selectedSupplier = supplier;
  }

  const [spendSource, deliverySource, draftSource, varianceSource, receipts, billed, apSource, grniControl, apControl] = await Promise.all([
    spendRows(opts.tenantId, from, toExclusive), deliveryRows(opts.tenantId, from, toExclusive),
    currentDrafts(opts.tenantId, from, toExclusive), currentDraftVariance(opts.tenantId, from, toExclusive),
    receiptExposureRows(opts.tenantId, asAtExclusive), billExposureRows(opts.tenantId, asAtExclusive),
    apExposureRows(opts.tenantId, asAtExclusive), controlCreditBalance(opts.tenantId, "GRNI", asAtExclusive),
    controlCreditBalance(opts.tenantId, "AP", asAtExclusive),
  ]);

  const allSpend = buildSpend(spendSource);
  const allDelivery = buildDelivery(deliverySource);
  const allGrni = buildGrni(receipts, billed);
  const allAp = buildAp(apSource);
  const selectedDrafts = query.supplierId
    ? draftSource.filter((row) => row.supplier_id === query.supplierId)
    : draftSource;
  const match = await matchExceptions(opts.tenantId, selectedDrafts);
  const spend = filterBySupplier(allSpend, query.supplierId);
  const delivery = filterBySupplier(allDelivery, query.supplierId);
  const grni = filterBySupplier(allGrni, query.supplierId);
  const ap = filterBySupplier(allAp, query.supplierId);
  const priceVariance = buildDraftVariance(varianceSource)
    .filter((row) => !query.supplierId || row.supplierId === query.supplierId);
  const deliveryEligible = delivery.reduce((total, row) => total + row.eligibleOrders, 0);
  const deliveryOnTime = delivery.reduce((total, row) => total + row.onTimeOrders, 0);
  const tenantGrniScheduled = sumMoney(allGrni, (row) => row.openBase);
  const tenantApScheduled = sumMoney(allAp, (row) => row.baseGross);
  const selectedGrni = sumMoney(grni, (row) => row.openBase);
  const selectedAp = sumMoney(ap, (row) => row.baseGross);
  const supplierIds = new Set([
    ...spend.map((row) => row.supplierId), ...delivery.map((row) => row.supplierId),
    ...grni.map((row) => row.supplierId), ...ap.map((row) => row.supplierId),
  ]);

  return {
    reportType: "supplier-performance-and-spend-analytics" as const,
    version: "supplier-analytics-v1" as const,
    availability: "MANAGEMENT_REPORT" as const,
    generatedAt: (opts.generatedAt ?? new Date()).toISOString(),
    entity: {
      tenantId: tenant.id, companyName: tenant.companyName,
      legalEntityScope: "TENANT_PROVISIONAL_SCOPE" as const,
    },
    period: query,
    baseCurrency: tenant.baseCurrency,
    supplierFilter: selectedSupplier,
    summary: {
      supplierCount: supplierIds.size,
      baseSpend: fromCents(sumMoney(spend, (row) => row.baseGross)),
      onTimeOrders: deliveryOnTime,
      eligibleDeliveryOrders: deliveryEligible,
      onTimeRateBasisPoints: basisPoints(deliveryOnTime, deliveryEligible),
      openGrniBase: fromCents(selectedGrni),
      sourceScheduledApBase: fromCents(selectedAp),
      currentBlockedDrafts: match.blockedDrafts,
    },
    spend: {
      basis: "POSTED_SUPPLIER_BILL_POSTED_AT" as const,
      rows: spend,
      baseGrossTiesToApSource: spend.every((row) => toCents(row.baseSourceDifference) === 0n),
    },
    delivery: {
      basis: "FINAL_RECEIPT_UTC_DATE_VS_EXPECTED_UTC_DATE" as const,
      rows: delivery,
    },
    priceVariance: {
      postedPolicy: "STRICT_EXACT_MATCH" as const,
      postedBaseVariance: "0.00",
      currentDraftBasis: "CURRENT_DRAFT_BILL_DATE" as const,
      rows: priceVariance,
    },
    matchExceptions: {
      basis: "CURRENT_DRAFT_REEVALUATION" as const,
      historicalAttemptCoverage: "NOT_RECORDED_ROLLED_BACK_ATTEMPTS" as const,
      ...match,
    },
    exposure: {
      asAt: query.asAt,
      grni: {
        basis: "RECEIPT_VALUE_LESS_POSTED_MATCHED_BILL_NET_AT_PO_RATE" as const,
        rows: grni,
        selectedScheduleBase: fromCents(selectedGrni),
        tenantScheduleBase: fromCents(tenantGrniScheduled),
        tenantControlBase: fromCents(grniControl),
        tenantUnallocatedBase: fromCents(grniControl - tenantGrniScheduled),
        tenantTies: grniControl === tenantGrniScheduled,
      },
      accountsPayable: {
        basis: "SOURCE_SCHEDULE_NOT_COMPLETE_OPEN_ITEM_SUBLEDGER" as const,
        completeOpenItemSubledger: false,
        rows: ap,
        selectedScheduleBase: fromCents(selectedAp),
        tenantScheduleBase: fromCents(tenantApScheduled),
        tenantControlBase: fromCents(apControl),
        tenantUnallocatedBase: fromCents(apControl - tenantApScheduled),
        tenantTies: apControl === tenantApScheduled,
      },
    },
    review: {
      required: true,
      blockerCodes: ["PROFESSIONAL_APPROVAL_REQUIRED", "LEGAL_ENTITY_MODEL_INCOMPLETE", "AP_OPEN_ITEM_SUBLEDGER_INCOMPLETE"] as const,
    },
  };
}
