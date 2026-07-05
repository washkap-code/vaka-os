// ============================================================================
// REPORTS — every figure computed from the journal ledger (single source of
// truth), never from cached columns. Cached invoice/stock fields are for UX;
// reports are for auditors.
// ============================================================================
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db, schema } from "./lib.js";

type ReceivableCurrency = "USD" | "ZWG";
type AgeingBucket = "current" | "d30" | "d60" | "d90" | "d90plus";

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

const MONEY_PATTERN = /^-?\d+\.\d{2}$/;

function toMinorUnits(value: string): bigint {
  if (!MONEY_PATTERN.test(value)) {
    throw new Error(`Expected exact two-decimal money value, received: ${value}`);
  }
  const negative = value.startsWith("-");
  const [whole, fraction] = value.replace("-", "").split(".");
  const minor = BigInt(whole) * 100n + BigInt(fraction);
  return negative ? -minor : minor;
}

function fromMinorUnits(value: bigint): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  return `${negative ? "-" : ""}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, "0")}`;
}

function ageingBucket(daysOverdue: number): AgeingBucket {
  if (daysOverdue <= 0) return "current";
  if (daysOverdue <= 30) return "d30";
  if (daysOverdue <= 60) return "d60";
  if (daysOverdue <= 90) return "d90";
  return "d90plus";
}

/** Trial balance as at a date: per-account net debit/credit from journal lines. */
export async function trialBalance(tenantId: string, asAt: Date) {
  const rows = await db.execute(sql`
    SELECT a.id, a.code, a.name, a.type,
           COALESCE(SUM(jl.debit), 0)  AS total_debit,
           COALESCE(SUM(jl.credit), 0) AS total_credit
    FROM accounts a
    LEFT JOIN journal_lines jl ON jl.account_id = a.id
    LEFT JOIN journal_entries je ON je.id = jl.journal_entry_id AND je.date <= ${asAt}
    WHERE a.tenant_id = ${tenantId}
    GROUP BY a.id, a.code, a.name, a.type
    ORDER BY a.code
  `);
  return (rows as any).rows.map((r: any) => ({
    accountId: r.id, code: r.code, name: r.name, type: r.type,
    debit: Number(r.total_debit), credit: Number(r.total_credit),
    balance: Number(r.total_debit) - Number(r.total_credit), // +ve = debit balance
  }));
}

/** Profit & Loss for a period. Income shown positive when credit-heavy. */
export async function profitAndLoss(tenantId: string, from: Date, to: Date) {
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
  const income: any[] = [], expenses: any[] = [];
  let totalIncome = 0, totalExpenses = 0;
  for (const r of (rows as any).rows) {
    const net = Number(r.net_credit);
    if (r.type === "INCOME") { income.push({ code: r.code, name: r.name, amount: net }); totalIncome += net; }
    else { expenses.push({ code: r.code, name: r.name, amount: -net }); totalExpenses += -net; }
  }
  return { income, expenses, totalIncome, totalExpenses, netProfit: totalIncome - totalExpenses };
}

/** Balance sheet as at a date, with retained earnings computed from P&L history. */
export async function balanceSheet(tenantId: string, asAt: Date) {
  const tb = await trialBalance(tenantId, asAt);
  const assets = tb.filter((r: any) => r.type === "ASSET" && r.balance !== 0)
    .map((r: any) => ({ code: r.code, name: r.name, amount: r.balance }));
  const liabilities = tb.filter((r: any) => r.type === "LIABILITY" && r.balance !== 0)
    .map((r: any) => ({ code: r.code, name: r.name, amount: -r.balance }));
  const equity = tb.filter((r: any) => r.type === "EQUITY" && r.balance !== 0)
    .map((r: any) => ({ code: r.code, name: r.name, amount: -r.balance }));
  const pl = tb.filter((r: any) => r.type === "INCOME" || r.type === "EXPENSE")
    .reduce((acc: number, r: any) => acc + (-r.balance), 0); // credit-positive
  const totalAssets = assets.reduce((s: number, a: any) => s + a.amount, 0);
  const totalLiabilities = liabilities.reduce((s: number, a: any) => s + a.amount, 0);
  const totalEquity = equity.reduce((s: number, a: any) => s + a.amount, 0) + pl;
  return {
    assets, liabilities, equity,
    currentEarnings: pl,
    totalAssets, totalLiabilities, totalEquity,
    balances: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01,
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
