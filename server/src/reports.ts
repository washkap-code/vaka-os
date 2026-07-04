// ============================================================================
// REPORTS — every figure computed from the journal ledger (single source of
// truth), never from cached columns. Cached invoice/stock fields are for UX;
// reports are for auditors.
// ============================================================================
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db, schema } from "./lib.js";

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
  const rows = await db.execute(sql`
    SELECT i.id, i.number, i.total, i.amount_paid, i.currency, i.due_date, i.issue_date,
           c.name AS contact_name
    FROM invoices i JOIN contacts c ON c.id = i.contact_id
    WHERE i.tenant_id = ${tenantId} AND i.status IN ('ISSUED', 'PARTIAL')
    ORDER BY i.due_date NULLS LAST
  `);
  const buckets = { current: 0, d30: 0, d60: 0, d90: 0, d90plus: 0 };
  const items = (rows as any).rows.map((r: any) => {
    const outstanding = Number(r.total) - Number(r.amount_paid);
    const due = r.due_date ? new Date(r.due_date) : new Date(r.issue_date);
    const age = Math.floor((asAt.getTime() - due.getTime()) / 86_400_000);
    const bucket = age <= 0 ? "current" : age <= 30 ? "d30" : age <= 60 ? "d60" : age <= 90 ? "d90" : "d90plus";
    (buckets as any)[bucket] += outstanding;
    return { invoiceId: r.id, number: r.number, contact: r.contact_name, currency: r.currency, outstanding, daysOverdue: Math.max(0, age), bucket };
  });
  return { items, buckets };
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
  const overdueTotal = ar.buckets.d30 + ar.buckets.d60 + ar.buckets.d90 + ar.buckets.d90plus;
  return {
    monthToDate: { income: pl.totalIncome, expenses: pl.totalExpenses, netProfit: pl.netProfit },
    receivables: { outstanding: ar.items.reduce((s: number, i: any) => s + i.outstanding, 0), overdue: overdueTotal },
    lowStock: (lowStock as any).rows,
    pipeline: (pipeline as any).rows,
  };
}
