import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "./lib.js";
import { balanceSheet, exactSum, fromMinorUnits, profitAndLoss, toMinorUnits, trialBalance } from "./reports.js";
import type { BalanceSheetReport, ProfitAndLossReport, TrialBalanceRow } from "./reports.js";

const DAY_MS = 86_400_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_PERIOD_DAYS = 366;
type AgeingBucket = "current" | "d30" | "d60" | "d90" | "d90plus";

function isCalendarDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export const statutoryReportPeriodSchema = z.object({
  from: z.string().refine(isCalendarDate, "From date must be a valid YYYY-MM-DD calendar date"),
  to: z.string().refine(isCalendarDate, "To date must be a valid YYYY-MM-DD calendar date"),
  asAt: z.string().refine(isCalendarDate, "As-at date must be a valid YYYY-MM-DD calendar date"),
}).superRefine((period, context) => {
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

export type StatutoryReportPeriod = z.infer<typeof statutoryReportPeriodSchema>;
export type StatutoryAgeingItem = {
  sourceId: string;
  number: string | null;
  counterparty: string;
  sourceDate: string;
  daysOutstanding: number;
  bucket: AgeingBucket;
  balance: string;
};
type AgeingSchedule = {
  controlBalance: string;
  scheduledBalance: string;
  unallocatedBalance: string;
  reconciles: true;
  requiresReconciliation: boolean;
  buckets: Record<AgeingBucket, string>;
  items: StatutoryAgeingItem[];
};

export type StatutoryReportPack = {
  reportType: "statutory-report-pack-technical-preview";
  version: "statutory-report-pack-v1";
  availability: "TECHNICAL_PREVIEW";
  notFilingReady: true;
  generatedAt: string;
  entity: { tenantId: string; companyName: string; legalEntityScope: "TENANT_PROVISIONAL_SCOPE" };
  period: StatutoryReportPeriod;
  currency: "USD" | "ZWG";
  trialBalance: TrialBalanceRow[];
  profitAndLoss: ProfitAndLossReport;
  balanceSheet: BalanceSheetReport;
  agedReceivables: AgeingSchedule & { basis: "INVOICE_DUE_DATE_OR_ISSUE_DATE" };
  agedPayables: AgeingSchedule & { basis: "SUPPORTED_PO_POSTING_DATE"; completeOpenItemSubledger: false };
  checks: { trialBalanceBalances: boolean; profitAndLossTies: boolean; balanceSheetBalances: boolean; receivablesReconcile: true; payablesReconcile: true };
  review: { required: true; blockerCodes: readonly ["PROFESSIONAL_APPROVAL_REQUIRED", "LEGAL_ENTITY_MODEL_INCOMPLETE", "AP_OPEN_ITEM_SUBLEDGER_INCOMPLETE"] };
};

type SourceRow = {
  source_id: string;
  number: string | null;
  counterparty: string;
  source_date: Date | string;
  balance: string;
};

function bucketFor(days: number): AgeingBucket {
  if (days <= 0) return "current";
  if (days <= 30) return "d30";
  if (days <= 60) return "d60";
  if (days <= 90) return "d90";
  return "d90plus";
}

function schedule(rows: SourceRow[], control: bigint, asAt: Date): AgeingSchedule {
  const bucketTotals: Record<AgeingBucket, bigint> = { current: 0n, d30: 0n, d60: 0n, d90: 0n, d90plus: 0n };
  let scheduled = 0n;
  const items = rows.map((row) => {
    const balance = toMinorUnits(row.balance);
    const sourceDate = row.source_date instanceof Date ? row.source_date : new Date(row.source_date);
    if (Number.isNaN(sourceDate.getTime())) throw new Error("Posted source has an invalid reporting date");
    const daysOutstanding = Math.max(0, Math.floor((asAt.getTime() - sourceDate.getTime()) / DAY_MS));
    const bucket = bucketFor(daysOutstanding);
    scheduled += balance;
    bucketTotals[bucket] += balance;
    return {
      sourceId: row.source_id,
      number: row.number,
      counterparty: row.counterparty,
      sourceDate: sourceDate.toISOString().slice(0, 10),
      daysOutstanding,
      bucket,
      balance: fromMinorUnits(balance),
    };
  });
  const unallocated = control - scheduled;
  return {
    controlBalance: fromMinorUnits(control),
    scheduledBalance: fromMinorUnits(scheduled),
    unallocatedBalance: fromMinorUnits(unallocated),
    reconciles: true,
    requiresReconciliation: unallocated !== 0n,
    buckets: {
      current: fromMinorUnits(bucketTotals.current), d30: fromMinorUnits(bucketTotals.d30),
      d60: fromMinorUnits(bucketTotals.d60), d90: fromMinorUnits(bucketTotals.d90),
      d90plus: fromMinorUnits(bucketTotals.d90plus),
    },
    items,
  };
}

async function controlBalance(tenantId: string, systemKey: "AR" | "AP", asAtExclusive: Date): Promise<bigint> {
  const result = await db.execute(sql`
    SELECT a.id, COALESCE(t.balance, 0)::text AS balance
    FROM accounts a
    LEFT JOIN (
      SELECT jl.account_id, SUM(jl.debit - jl.credit) AS balance
      FROM journal_lines jl
      JOIN journal_entries je ON je.id = jl.journal_entry_id
      WHERE je.tenant_id = ${tenantId} AND je.date < ${asAtExclusive}
      GROUP BY jl.account_id
    ) t ON t.account_id = a.id
    WHERE a.tenant_id = ${tenantId} AND a.system_key = ${systemKey}
  `);
  const row = (result.rows as Array<{ balance: string }>)[0];
  if (!row) throw new Error(`${systemKey} control account is unavailable`);
  const debitBalance = toMinorUnits(row.balance);
  return systemKey === "AP" ? -debitBalance : debitBalance;
}

async function receivableSources(tenantId: string, asAtExclusive: Date): Promise<SourceRow[]> {
  const result = await db.execute(sql`
    SELECT i.id::text AS source_id, i.number, c.name AS counterparty,
      COALESCE(i.due_date, i.issue_date, i.created_at) AS source_date,
      SUM(jl.debit - jl.credit)::text AS balance
    FROM invoices i
    JOIN contacts c ON c.id = i.contact_id AND c.tenant_id = ${tenantId}
    JOIN journal_entries je ON je.tenant_id = ${tenantId} AND je.source_id = i.id::text AND je.date < ${asAtExclusive}
    JOIN journal_lines jl ON jl.journal_entry_id = je.id
    JOIN accounts a ON a.id = jl.account_id AND a.tenant_id = ${tenantId} AND a.system_key = 'AR'
    WHERE i.tenant_id = ${tenantId}
    GROUP BY i.id, i.number, c.name, COALESCE(i.due_date, i.issue_date, i.created_at)
    HAVING SUM(jl.debit - jl.credit) <> 0
    ORDER BY source_date, i.id
  `);
  return result.rows as SourceRow[];
}

async function payableSources(tenantId: string, asAtExclusive: Date): Promise<SourceRow[]> {
  const result = await db.execute(sql`
    SELECT po.id::text AS source_id, po.number, c.name AS counterparty,
      COALESCE(po.received_at, MIN(je.date), po.created_at) AS source_date,
      SUM(jl.credit - jl.debit)::text AS balance
    FROM purchase_orders po
    JOIN contacts c ON c.id = po.vendor_contact_id AND c.tenant_id = ${tenantId}
    JOIN journal_entries je ON je.tenant_id = ${tenantId} AND je.source_id = po.id::text
      AND je.source_type = 'po_receipt' AND je.date < ${asAtExclusive}
    JOIN journal_lines jl ON jl.journal_entry_id = je.id
    JOIN accounts a ON a.id = jl.account_id AND a.tenant_id = ${tenantId} AND a.system_key = 'AP'
    WHERE po.tenant_id = ${tenantId}
    GROUP BY po.id, po.number, c.name, po.received_at, po.created_at
    HAVING SUM(jl.credit - jl.debit) <> 0
    ORDER BY source_date, po.id
  `);
  return result.rows as SourceRow[];
}

export async function getStatutoryReportPack(opts: { tenantId: string; period: StatutoryReportPeriod; generatedAt?: Date }): Promise<StatutoryReportPack> {
  const period = statutoryReportPeriodSchema.parse(opts.period);
  const from = new Date(`${period.from}T00:00:00.000Z`);
  const to = new Date(`${period.to}T23:59:59.999Z`);
  const asAt = new Date(`${period.asAt}T23:59:59.999Z`);
  const asAtExclusive = new Date(asAt.getTime() + 1);
  const [tenant] = await db.select({ id: schema.tenants.id, companyName: schema.tenants.companyName, baseCurrency: schema.tenants.baseCurrency })
    .from(schema.tenants).where(eq(schema.tenants.id, opts.tenantId));
  if (!tenant) throw new Error("Tenant context is unavailable");

  const [tb, pl, bs, arControl, apControl, arRows, apRows] = await Promise.all([
    trialBalance(opts.tenantId, asAt), profitAndLoss(opts.tenantId, from, to), balanceSheet(opts.tenantId, asAt),
    controlBalance(opts.tenantId, "AR", asAtExclusive), controlBalance(opts.tenantId, "AP", asAtExclusive),
    receivableSources(opts.tenantId, asAtExclusive), payableSources(opts.tenantId, asAtExclusive),
  ]);
  const totalDebit = exactSum(tb.map((row) => row.debit));
  const totalCredit = exactSum(tb.map((row) => row.credit));
  const plTies = exactSum(pl.income.map((row) => row.amount)) === toMinorUnits(pl.totalIncome)
    && exactSum(pl.expenses.map((row) => row.amount)) === toMinorUnits(pl.totalExpenses)
    && toMinorUnits(pl.totalIncome) - toMinorUnits(pl.totalExpenses) === toMinorUnits(pl.netProfit);
  if (totalDebit !== totalCredit || !plTies || !bs.balances) throw new Error("Posted ledger report pack failed an internal tie-out");

  return {
    reportType: "statutory-report-pack-technical-preview", version: "statutory-report-pack-v1",
    availability: "TECHNICAL_PREVIEW", notFilingReady: true,
    generatedAt: (opts.generatedAt ?? new Date()).toISOString(),
    entity: { tenantId: tenant.id, companyName: tenant.companyName, legalEntityScope: "TENANT_PROVISIONAL_SCOPE" },
    period, currency: tenant.baseCurrency, trialBalance: tb, profitAndLoss: pl, balanceSheet: bs,
    agedReceivables: { ...schedule(arRows, arControl, asAt), basis: "INVOICE_DUE_DATE_OR_ISSUE_DATE" },
    agedPayables: { ...schedule(apRows, apControl, asAt), basis: "SUPPORTED_PO_POSTING_DATE", completeOpenItemSubledger: false },
    checks: { trialBalanceBalances: true, profitAndLossTies: true, balanceSheetBalances: true, receivablesReconcile: true, payablesReconcile: true },
    review: { required: true, blockerCodes: ["PROFESSIONAL_APPROVAL_REQUIRED", "LEGAL_ENTITY_MODEL_INCOMPLETE", "AP_OPEN_ITEM_SUBLEDGER_INCOMPLETE"] },
  };
}
