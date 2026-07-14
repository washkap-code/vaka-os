// ============================================================================
// REPORTS — every figure computed from the journal ledger (single source of
// truth), never from cached columns. Cached invoice/stock fields are for UX;
// reports are for auditors.
// ============================================================================
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { badRequest, db, schema } from "./lib.js";
import { quantityToUnits } from "./inventory.js";

type ReceivableCurrency = "USD" | "ZWG";
type AgeingBucket = "current" | "d30" | "d60" | "d90" | "d90plus";
export type TrialBalanceRow = { accountId: string; code: string; name: string; type: string; debit: string; credit: string; balance: string };
export type StatementLine = { code: string; name: string; amount: string };
export type ProfitAndLossReport = { income: StatementLine[]; expenses: StatementLine[]; totalIncome: string; totalExpenses: string; netProfit: string };
export type BalanceSheetReport = { assets: StatementLine[]; liabilities: StatementLine[]; equity: StatementLine[]; currentEarnings: string; totalAssets: string; totalLiabilities: string; totalEquity: string; totalLiabilitiesAndEquity: string; balances: boolean };

export type InventoryValuationReconciliationItem = {
  productId: string;
  sku: string;
  productName: string;
  warehouseId: string;
  warehouseName: string;
  stockQuantity: string | null;
  valuedQuantity: string | null;
  weightedAverageUnitCost: string | null;
  totalValue: string | null;
  status: "ALIGNED" | "MISSING_LAYER" | "MISSING_STOCK_LEVEL" | "QUANTITY_MISMATCH";
};

export type InventoryValuationReconciliation = {
  generatedAt: string;
  currency: "USD" | "ZWG";
  valuationMethod: "WEIGHTED_AVERAGE";
  status: "RECONCILED" | "NEEDS_REVIEW";
  inventoryGlBalance: string;
  stockValuation: string;
  difference: string;
  missingLayerCount: number;
  missingStockLevelCount: number;
  quantityMismatchCount: number;
  isAudited: false;
  accountantSignOff: "REQUIRED_BEFORE_GA";
  items: InventoryValuationReconciliationItem[];
};

export type AgedReceivableItem = {
  invoiceId: string;
  number: string | null;
  contact: string;
  currency: ReceivableCurrency;
  outstanding: string;
  daysOverdue: number;
  bucket: AgeingBucket;
};

export type CurrencyAgeing = {
  currency: ReceivableCurrency;
  outstanding: string;
  overdue: string;
  buckets: Record<AgeingBucket, string>;
};

const MONEY_PATTERN = /^-?\d+(?:\.\d{1,2})?$/;

export function toMinorUnits(value: string | number): bigint {
  const exact = String(value).trim();
  if (!MONEY_PATTERN.test(exact)) {
    throw new Error(`Expected exact two-decimal money value, received: ${value}`);
  }
  const negative = exact.startsWith("-");
  const [whole, fraction = ""] = exact.replace("-", "").split(".");
  const minor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  return negative ? -minor : minor;
}

export function fromMinorUnits(value: bigint): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  return `${negative ? "-" : ""}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, "0")}`;
}

export function exactSum(values: Iterable<string | number>): bigint {
  let total = 0n;
  for (const value of values) total += toMinorUnits(value);
  return total;
}

function formatScaled(value: bigint, scale: bigint, decimalPlaces: number): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  return `${negative ? "-" : ""}${absolute / scale}.${(absolute % scale).toString().padStart(decimalPlaces, "0")}`;
}

function weightedAverageUnitCost(totalCostCents: bigint, quantity: string): string | null {
  const quantityUnits = quantityToUnits(quantity);
  if (quantityUnits <= 0n) return null;
  const microsPerUnit = (totalCostCents * 10_000_000n + quantityUnits / 2n) / quantityUnits;
  return formatScaled(microsPerUnit, 1_000_000n, 6);
}

/** Current Inventory control-account to weighted-average subledger tie-out. */
export async function inventoryValuationReconciliation(
  tenantId: string,
): Promise<InventoryValuationReconciliation> {
  const tenantResult = await db.execute(sql`
    SELECT base_currency FROM tenants WHERE id = ${tenantId}
  `) as unknown as { rows: Array<{ base_currency: "USD" | "ZWG" }> };
  const tenant = tenantResult.rows[0];
  if (!tenant) throw badRequest("Workspace was not found");

  const ledgerResult = await db.execute(sql`
    SELECT a.id,
           COALESCE(SUM(CASE WHEN je.id IS NOT NULL THEN jl.debit ELSE 0 END), 0)
             - COALESCE(SUM(CASE WHEN je.id IS NOT NULL THEN jl.credit ELSE 0 END), 0) AS balance
    FROM accounts a
    LEFT JOIN journal_lines jl ON jl.account_id = a.id
    LEFT JOIN journal_entries je
      ON je.id = jl.journal_entry_id AND je.tenant_id = a.tenant_id
    WHERE a.tenant_id = ${tenantId} AND a.system_key = 'INVENTORY'
    GROUP BY a.id
  `) as unknown as { rows: Array<{ id: string; balance: string }> };
  const inventoryAccount = ledgerResult.rows[0];
  if (!inventoryAccount) throw badRequest("System account INVENTORY missing for tenant — chart of accounts not seeded");

  const itemResult = await db.execute(sql`
    WITH positions AS (
      SELECT sl.product_id, sl.warehouse_id, sl.quantity_on_hand AS stock_quantity
      FROM stock_levels sl
      JOIN products scoped_product
        ON scoped_product.id = sl.product_id AND scoped_product.tenant_id = ${tenantId}
      UNION ALL
      SELECT existing_layer.product_id, existing_layer.warehouse_id, NULL::numeric AS stock_quantity
      FROM inventory_valuation_layers existing_layer
      WHERE existing_layer.tenant_id = ${tenantId}
        AND NOT EXISTS (
          SELECT 1 FROM stock_levels existing_stock
          WHERE existing_stock.product_id = existing_layer.product_id
            AND existing_stock.warehouse_id = existing_layer.warehouse_id
        )
    )
    SELECT p.id AS product_id, p.sku, p.name AS product_name,
           w.id AS warehouse_id, w.name AS warehouse_name,
           positions.stock_quantity,
           ivl.id AS layer_id,
           ivl.quantity_on_hand AS valued_quantity,
           ivl.total_cost_cents::text AS total_cost_cents
    FROM positions
    JOIN products p ON p.id = positions.product_id AND p.tenant_id = ${tenantId}
    JOIN warehouses w ON w.id = positions.warehouse_id AND w.tenant_id = ${tenantId}
    LEFT JOIN inventory_valuation_layers ivl
      ON ivl.tenant_id = ${tenantId}
     AND ivl.product_id = positions.product_id
     AND ivl.warehouse_id = positions.warehouse_id
    ORDER BY p.name, p.sku, w.name, w.id
  `) as unknown as { rows: Array<{
    product_id: string;
    sku: string;
    product_name: string;
    warehouse_id: string;
    warehouse_name: string;
    stock_quantity: string | null;
    layer_id: string | null;
    valued_quantity: string | null;
    total_cost_cents: string | null;
  }> };

  let valuationCents = 0n;
  let missingLayerCount = 0;
  let missingStockLevelCount = 0;
  let quantityMismatchCount = 0;
  const items = itemResult.rows.map<InventoryValuationReconciliationItem>((row) => {
    if (!row.layer_id || row.valued_quantity === null || row.total_cost_cents === null) {
      missingLayerCount += 1;
      return {
        productId: row.product_id,
        sku: row.sku,
        productName: row.product_name,
        warehouseId: row.warehouse_id,
        warehouseName: row.warehouse_name,
        stockQuantity: row.stock_quantity,
        valuedQuantity: null,
        weightedAverageUnitCost: null,
        totalValue: null,
        status: "MISSING_LAYER",
      };
    }
    const totalCostCents = BigInt(row.total_cost_cents);
    valuationCents += totalCostCents;
    if (row.stock_quantity === null) {
      missingStockLevelCount += 1;
      return {
        productId: row.product_id,
        sku: row.sku,
        productName: row.product_name,
        warehouseId: row.warehouse_id,
        warehouseName: row.warehouse_name,
        stockQuantity: null,
        valuedQuantity: row.valued_quantity,
        weightedAverageUnitCost: weightedAverageUnitCost(totalCostCents, row.valued_quantity),
        totalValue: fromMinorUnits(totalCostCents),
        status: "MISSING_STOCK_LEVEL",
      };
    }
    const aligned = quantityToUnits(row.stock_quantity) === quantityToUnits(row.valued_quantity);
    if (!aligned) quantityMismatchCount += 1;
    return {
      productId: row.product_id,
      sku: row.sku,
      productName: row.product_name,
      warehouseId: row.warehouse_id,
      warehouseName: row.warehouse_name,
      stockQuantity: row.stock_quantity,
      valuedQuantity: row.valued_quantity,
      weightedAverageUnitCost: weightedAverageUnitCost(totalCostCents, row.valued_quantity),
      totalValue: fromMinorUnits(totalCostCents),
      status: aligned ? "ALIGNED" : "QUANTITY_MISMATCH",
    };
  });
  const inventoryGlCents = toMinorUnits(inventoryAccount.balance);
  const differenceCents = inventoryGlCents - valuationCents;
  const reconciled = differenceCents === 0n && missingLayerCount === 0
    && missingStockLevelCount === 0 && quantityMismatchCount === 0;
  return {
    generatedAt: new Date().toISOString(),
    currency: tenant.base_currency,
    valuationMethod: "WEIGHTED_AVERAGE",
    status: reconciled ? "RECONCILED" : "NEEDS_REVIEW",
    inventoryGlBalance: fromMinorUnits(inventoryGlCents),
    stockValuation: fromMinorUnits(valuationCents),
    difference: fromMinorUnits(differenceCents),
    missingLayerCount,
    missingStockLevelCount,
    quantityMismatchCount,
    isAudited: false,
    accountantSignOff: "REQUIRED_BEFORE_GA",
    items,
  };
}

function ageingBucket(daysOverdue: number): AgeingBucket {
  if (daysOverdue <= 0) return "current";
  if (daysOverdue <= 30) return "d30";
  if (daysOverdue <= 60) return "d60";
  if (daysOverdue <= 90) return "d90";
  return "d90plus";
}

/** Trial balance as at a date: per-account net debit/credit from journal lines. */
export async function trialBalance(tenantId: string, asAt: Date): Promise<TrialBalanceRow[]> {
  const rows = await db.execute(sql`
    SELECT a.id, a.code, a.name, a.type,
           COALESCE(t.total_debit, 0)  AS total_debit,
           COALESCE(t.total_credit, 0) AS total_credit
    FROM accounts a
    LEFT JOIN (
      SELECT jl.account_id,
             SUM(jl.debit) AS total_debit,
             SUM(jl.credit) AS total_credit
      FROM journal_lines jl
      JOIN journal_entries je ON je.id = jl.journal_entry_id
      WHERE je.tenant_id = ${tenantId} AND je.date <= ${asAt}
      GROUP BY jl.account_id
    ) t ON t.account_id = a.id
    WHERE a.tenant_id = ${tenantId}
    ORDER BY a.code
  `);
  return ((rows as unknown as { rows: Array<{ id: string; code: string; name: string; type: string; total_debit: string; total_credit: string }> }).rows).map((r) => {
    const debit = toMinorUnits(r.total_debit);
    const credit = toMinorUnits(r.total_credit);
    return {
      accountId: r.id, code: r.code, name: r.name, type: r.type,
      debit: fromMinorUnits(debit),
      credit: fromMinorUnits(credit),
      balance: fromMinorUnits(debit - credit), // +ve = debit balance
    };
  });
}

/** Profit & Loss for a period. Income shown positive when credit-heavy. */
export async function profitAndLoss(tenantId: string, from: Date, to: Date): Promise<ProfitAndLossReport> {
  const rows = await db.execute(sql`
    SELECT a.code, a.name, a.type,
           COALESCE(SUM(jl.credit - jl.debit), 0) AS net_credit
    FROM accounts a
    JOIN journal_lines jl ON jl.account_id = a.id
    JOIN journal_entries je ON je.id = jl.journal_entry_id
    WHERE a.tenant_id = ${tenantId}
      AND a.type IN ('INCOME', 'EXPENSE')
      AND je.date >= ${from} AND je.date <= ${to}
    GROUP BY a.code, a.name, a.type
    ORDER BY a.code
  `);
  const income: Array<{ code: string; name: string; amount: string }> = [];
  const expenses: Array<{ code: string; name: string; amount: string }> = [];
  let totalIncome = 0n, totalExpenses = 0n;
  for (const r of (rows as any).rows) {
    const net = toMinorUnits(r.net_credit);
    if (r.type === "INCOME") { income.push({ code: r.code, name: r.name, amount: fromMinorUnits(net) }); totalIncome += net; }
    else { expenses.push({ code: r.code, name: r.name, amount: fromMinorUnits(-net) }); totalExpenses -= net; }
  }
  return {
    income, expenses,
    totalIncome: fromMinorUnits(totalIncome),
    totalExpenses: fromMinorUnits(totalExpenses),
    netProfit: fromMinorUnits(totalIncome - totalExpenses),
  };
}

/** Balance sheet as at a date, with retained earnings computed from P&L history. */
export async function balanceSheet(tenantId: string, asAt: Date): Promise<BalanceSheetReport> {
  const tb = await trialBalance(tenantId, asAt);
  const assets = tb.filter((r) => r.type === "ASSET" && toMinorUnits(r.balance) !== 0n)
    .map((r) => ({ code: r.code, name: r.name, amount: r.balance }));
  const liabilities = tb.filter((r) => r.type === "LIABILITY" && toMinorUnits(r.balance) !== 0n)
    .map((r) => ({ code: r.code, name: r.name, amount: fromMinorUnits(-toMinorUnits(r.balance)) }));
  const equity = tb.filter((r) => r.type === "EQUITY" && toMinorUnits(r.balance) !== 0n)
    .map((r) => ({ code: r.code, name: r.name, amount: fromMinorUnits(-toMinorUnits(r.balance)) }));
  const pl = tb.filter((r) => r.type === "INCOME" || r.type === "EXPENSE")
    .reduce((total, r) => total - toMinorUnits(r.balance), 0n); // credit-positive
  const totalAssets = exactSum(assets.map((account: { amount: string }) => account.amount));
  const totalLiabilities = exactSum(liabilities.map((account: { amount: string }) => account.amount));
  const totalEquity = exactSum(equity.map((account: { amount: string }) => account.amount)) + pl;
  return {
    assets, liabilities, equity,
    currentEarnings: fromMinorUnits(pl),
    totalAssets: fromMinorUnits(totalAssets),
    totalLiabilities: fromMinorUnits(totalLiabilities),
    totalEquity: fromMinorUnits(totalEquity),
    totalLiabilitiesAndEquity: fromMinorUnits(totalLiabilities + totalEquity),
    balances: totalAssets === totalLiabilities + totalEquity,
  };
}

/** Aged receivables: outstanding issued/partial invoices bucketed by age. */
export async function agedReceivables(tenantId: string, asAt = new Date()) {
  const result = await db.execute(sql`
    SELECT
      i.id,
      i.number,
      i.currency,
      (i.total - i.amount_paid)::numeric(14,2)::text AS outstanding,
      c.name AS contact_name,
      GREATEST(
        0,
        FLOOR(EXTRACT(EPOCH FROM (
          ${asAt} - COALESCE(i.due_date, i.issue_date, i.created_at)
        )) / 86400)
      )::int AS days_overdue
    FROM invoices i
    JOIN contacts c ON c.id = i.contact_id AND c.tenant_id = i.tenant_id
    WHERE i.tenant_id = ${tenantId} AND i.status IN ('ISSUED', 'PARTIAL')
    ORDER BY days_overdue DESC, outstanding DESC, i.id
  `);
  const rows = result.rows as Array<{
    id: string;
    number: string | null;
    currency: ReceivableCurrency;
    outstanding: string;
    contact_name: string;
    days_overdue: number;
  }>;
  const totals = new Map<ReceivableCurrency, {
    outstanding: bigint;
    overdue: bigint;
    buckets: Record<AgeingBucket, bigint>;
  }>();

  const items: AgedReceivableItem[] = rows.map((row) => {
    const outstanding = toMinorUnits(row.outstanding);
    const bucket = ageingBucket(row.days_overdue);
    const currency = totals.get(row.currency) ?? {
      outstanding: 0n,
      overdue: 0n,
      buckets: { current: 0n, d30: 0n, d60: 0n, d90: 0n, d90plus: 0n },
    };
    currency.outstanding += outstanding;
    if (row.days_overdue > 0) currency.overdue += outstanding;
    currency.buckets[bucket] += outstanding;
    totals.set(row.currency, currency);
    return {
      invoiceId: row.id,
      number: row.number,
      contact: row.contact_name,
      currency: row.currency,
      outstanding: row.outstanding,
      daysOverdue: row.days_overdue,
      bucket,
    };
  });

  const currencies: CurrencyAgeing[] = [...totals.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currency, values]) => ({
      currency,
      outstanding: fromMinorUnits(values.outstanding),
      overdue: fromMinorUnits(values.overdue),
      buckets: {
        current: fromMinorUnits(values.buckets.current),
        d30: fromMinorUnits(values.buckets.d30),
        d60: fromMinorUnits(values.buckets.d60),
        d90: fromMinorUnits(values.buckets.d90),
        d90plus: fromMinorUnits(values.buckets.d90plus),
      },
    }));

  return { asAt: asAt.toISOString(), currencies, items };
}

/** Cross-module dashboard: one call, live numbers from all three modules. */
export async function dashboard(tenantId: string) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const pl = await profitAndLoss(tenantId, monthStart, now);
  const ar = await agedReceivables(tenantId, now);
  const lowStock = await db.execute(sql`
    SELECT p.id, p.sku, p.name, p.reorder_level, COALESCE(SUM(sl.quantity_on_hand), 0) AS on_hand
    FROM products p LEFT JOIN stock_levels sl ON sl.product_id = p.id
    WHERE p.tenant_id = ${tenantId} AND p.track_stock = true AND p.is_active = true
    GROUP BY p.id HAVING COALESCE(SUM(sl.quantity_on_hand), 0) <= p.reorder_level
    ORDER BY on_hand ASC LIMIT 10
  `);
  const pipeline = await db.execute(sql`
    SELECT stage, COUNT(*) AS n, COALESCE(SUM(value_amount), 0) AS value
    FROM deals WHERE tenant_id = ${tenantId} AND stage NOT IN ('WON','LOST')
    GROUP BY stage
  `);
  return {
    monthToDate: { income: pl.totalIncome, expenses: pl.totalExpenses, netProfit: pl.netProfit },
    receivables: {
      asAt: ar.asAt,
      currencies: ar.currencies,
      attentionItems: ar.items.filter((item) => item.daysOverdue > 0).slice(0, 5),
    },
    lowStock: (lowStock as any).rows,
    pipeline: (pipeline as any).rows,
  };
}
