import { sql } from "drizzle-orm";
import { z } from "zod";
import { DB, db } from "../lib.js";

export const businessSummaryQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
}).superRefine((value, context) => {
  if (value.from && value.to && value.from > value.to) {
    context.addIssue({ code: "custom", message: "from must be before or equal to to", path: ["from"] });
  }
  if (value.from && value.to && value.to.getTime() - value.from.getTime() > 366 * 86_400_000) {
    context.addIssue({ code: "custom", message: "period cannot exceed 366 days", path: ["to"] });
  }
});

export type BusinessSummaryQuery = z.infer<typeof businessSummaryQuerySchema>;
export type BusinessSummaryCurrency = "USD" | "ZWG";
export type BusinessSummaryPermission =
  | "reports.read"
  | "accounting.read"
  | "inventory.read"
  | "crm.read";

type AvailableSection<T> = {
  status: "available";
  data: T;
};

type UnavailableSection = {
  status: "unavailable";
  reason: "PERMISSION_REQUIRED";
  requiredPermission: BusinessSummaryPermission;
};

export type BusinessSummarySection<T> = AvailableSection<T> | UnavailableSection;

export type ExactMoney = {
  currency: BusinessSummaryCurrency;
  amount: string;
};

export type BusinessSummary = {
  schemaVersion: "1.0";
  kind: "vaka.business_summary";
  generatedAt: string;
  scope: {
    tenantId: string;
    actorUserId: string;
    baseCurrency: BusinessSummaryCurrency;
    period: {
      from: string;
      to: string;
      timeZone: "Africa/Harare";
    };
  };
  freshness: {
    dataAsOf: string;
    generatedFromLiveRecords: true;
  };
  limitations: string[];
  sections: {
    financialPerformance: BusinessSummarySection<{
      basis: "posted_journal_entries";
      currency: BusinessSummaryCurrency;
      income: string;
      expenses: string;
      netProfit: string;
      source: { report: "profit_and_loss"; from: string; to: string };
    }>;
    receivables: BusinessSummarySection<{
      basis: "current_issued_and_partial_invoices";
      totals: ExactMoney[];
      overdueTotals: ExactMoney[];
      attentionItems: Array<{
        invoiceId: string;
        invoiceNumber: string;
        customerId: string;
        customerName: string;
        currency: BusinessSummaryCurrency;
        outstanding: string;
        dueDate: string | null;
        daysOverdue: number;
      }>;
      truncated: boolean;
    }>;
    inventoryAttention: BusinessSummarySection<{
      basis: "current_stock_levels";
      items: Array<{
        productId: string;
        sku: string;
        name: string;
        quantityOnHand: string;
        reorderLevel: string;
      }>;
      truncated: boolean;
    }>;
    pipelineAttention: BusinessSummarySection<{
      basis: "current_open_deals";
      stages: Array<{
        stage: string;
        currency: BusinessSummaryCurrency;
        dealCount: number;
        value: string;
      }>;
      truncated: boolean;
    }>;
  };
};

export type BusinessSummaryContext = {
  tenantId: string;
  actorUserId: string;
  baseCurrency: BusinessSummaryCurrency;
  permissions: readonly string[];
};

const MONEY_PATTERN = /^-?\d+\.\d{2}$/;
const QUANTITY_PATTERN = /^-?\d+\.\d{3}$/;
const ATTENTION_LIMIT = 10;
const PIPELINE_LIMIT = 20;

function exactMoney(value: unknown): string {
  const formatted = String(value ?? "0.00");
  if (!MONEY_PATTERN.test(formatted)) {
    throw new Error(`Expected exact two-decimal money value, received: ${formatted}`);
  }
  return formatted;
}

function exactQuantity(value: unknown): string {
  const formatted = String(value ?? "0.000");
  if (!QUANTITY_PATTERN.test(formatted)) {
    throw new Error(`Expected exact three-decimal quantity value, received: ${formatted}`);
  }
  return formatted;
}

function permissionRequired(permission: BusinessSummaryPermission): UnavailableSection {
  return { status: "unavailable", reason: "PERMISSION_REQUIRED", requiredPermission: permission };
}

function hasPermission(context: BusinessSummaryContext, permission: BusinessSummaryPermission) {
  return context.permissions.includes(permission);
}

function monthStart(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function normalisePeriod(query: BusinessSummaryQuery, generatedAt: Date) {
  const to = query.to ?? generatedAt;
  const from = query.from ?? monthStart(to);
  return { from, to };
}

export async function getBusinessSummary(
  context: BusinessSummaryContext,
  query: BusinessSummaryQuery = {},
  options: { database?: DB; generatedAt?: Date } = {},
): Promise<BusinessSummary> {
  const database = options.database ?? db;
  const generatedAt = options.generatedAt ?? new Date();
  const { from, to } = normalisePeriod(query, generatedAt);

  if (from > to) throw new Error("from must be before or equal to to");
  if (to.getTime() - from.getTime() > 366 * 86_400_000) throw new Error("period cannot exceed 366 days");

  const financialPerformance = hasPermission(context, "reports.read")
    ? await loadFinancialPerformance(database, context, from, to)
    : permissionRequired("reports.read");

  const receivables = hasPermission(context, "accounting.read")
    ? await loadReceivables(database, context, generatedAt)
    : permissionRequired("accounting.read");

  const inventoryAttention = hasPermission(context, "inventory.read")
    ? await loadInventoryAttention(database, context)
    : permissionRequired("inventory.read");

  const pipelineAttention = hasPermission(context, "crm.read")
    ? await loadPipelineAttention(database, context)
    : permissionRequired("crm.read");

  return {
    schemaVersion: "1.0",
    kind: "vaka.business_summary",
    generatedAt: generatedAt.toISOString(),
    scope: {
      tenantId: context.tenantId,
      actorUserId: context.actorUserId,
      baseCurrency: context.baseCurrency,
      period: {
        from: from.toISOString(),
        to: to.toISOString(),
        timeZone: "Africa/Harare",
      },
    },
    freshness: {
      dataAsOf: generatedAt.toISOString(),
      generatedFromLiveRecords: true,
    },
    limitations: [
      "This read model contains deterministic records and calculations only; it is not an AI interpretation.",
      "Receivables, inventory, and pipeline sections describe current record state at generation time.",
      "Unavailable sections indicate missing permission, not zero activity.",
    ],
    sections: {
      financialPerformance,
      receivables,
      inventoryAttention,
      pipelineAttention,
    },
  };
}

async function loadFinancialPerformance(
  database: DB,
  context: BusinessSummaryContext,
  from: Date,
  to: Date,
): Promise<AvailableSection<BusinessSummary["sections"]["financialPerformance"] extends BusinessSummarySection<infer T> ? T : never>> {
  const result = await database.execute(sql`
    SELECT
      COALESCE(SUM(CASE WHEN a.type = 'INCOME' THEN jl.credit - jl.debit ELSE 0 END), 0)::numeric(14,2)::text AS income,
      COALESCE(SUM(CASE WHEN a.type = 'EXPENSE' THEN jl.debit - jl.credit ELSE 0 END), 0)::numeric(14,2)::text AS expenses
    FROM journal_entries je
    JOIN journal_lines jl ON jl.journal_entry_id = je.id
    JOIN accounts a ON a.id = jl.account_id
    WHERE je.tenant_id = ${context.tenantId}
      AND je.date >= ${from}
      AND je.date <= ${to}
  `);
  const row = result.rows[0] as { income: string; expenses: string } | undefined;
  const income = exactMoney(row?.income);
  const expenses = exactMoney(row?.expenses);
  const netProfit = subtractMoney(income, expenses);

  return {
    status: "available",
    data: {
      basis: "posted_journal_entries",
      currency: context.baseCurrency,
      income,
      expenses,
      netProfit,
      source: { report: "profit_and_loss", from: from.toISOString(), to: to.toISOString() },
    },
  };
}

async function loadReceivables(
  database: DB,
  context: BusinessSummaryContext,
  asAt: Date,
): Promise<AvailableSection<BusinessSummary["sections"]["receivables"] extends BusinessSummarySection<infer T> ? T : never>> {
  const totalsResult = await database.execute(sql`
    SELECT
      i.currency,
      COALESCE(SUM(i.total - i.amount_paid), 0)::numeric(14,2)::text AS outstanding,
      COALESCE(SUM(
        CASE WHEN COALESCE(i.due_date, i.issue_date, i.created_at) < ${asAt}
          THEN i.total - i.amount_paid ELSE 0 END
      ), 0)::numeric(14,2)::text AS overdue
    FROM invoices i
    WHERE i.tenant_id = ${context.tenantId}
      AND i.status IN ('ISSUED', 'PARTIAL')
    GROUP BY i.currency
    ORDER BY i.currency
  `);
  const itemsResult = await database.execute(sql`
    SELECT
      i.id AS invoice_id,
      i.number AS invoice_number,
      i.currency,
      (i.total - i.amount_paid)::numeric(14,2)::text AS outstanding,
      i.due_date,
      c.id AS customer_id,
      c.name AS customer_name,
      GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (${asAt} - COALESCE(i.due_date, i.issue_date, i.created_at))) / 86400))::int AS days_overdue
    FROM invoices i
    JOIN contacts c ON c.id = i.contact_id AND c.tenant_id = i.tenant_id
    WHERE i.tenant_id = ${context.tenantId}
      AND i.status IN ('ISSUED', 'PARTIAL')
      AND COALESCE(i.due_date, i.issue_date, i.created_at) < ${asAt}
    ORDER BY days_overdue DESC, outstanding DESC, i.id
    LIMIT ${ATTENTION_LIMIT + 1}
  `);

  const totalRows = totalsResult.rows as Array<{ currency: BusinessSummaryCurrency; outstanding: string; overdue: string }>;
  const itemRows = itemsResult.rows as Array<{
    invoice_id: string;
    invoice_number: string | null;
    customer_id: string;
    customer_name: string;
    currency: BusinessSummaryCurrency;
    outstanding: string;
    due_date: Date | string | null;
    days_overdue: number;
  }>;

  return {
    status: "available",
    data: {
      basis: "current_issued_and_partial_invoices",
      totals: totalRows.map((row) => ({ currency: row.currency, amount: exactMoney(row.outstanding) })),
      overdueTotals: totalRows.map((row) => ({ currency: row.currency, amount: exactMoney(row.overdue) })),
      attentionItems: itemRows.slice(0, ATTENTION_LIMIT).map((row) => ({
        invoiceId: row.invoice_id,
        invoiceNumber: row.invoice_number ?? "UNISSUED",
        customerId: row.customer_id,
        customerName: row.customer_name,
        currency: row.currency,
        outstanding: exactMoney(row.outstanding),
        dueDate: row.due_date ? new Date(row.due_date).toISOString() : null,
        daysOverdue: Number(row.days_overdue),
      })),
      truncated: itemRows.length > ATTENTION_LIMIT,
    },
  };
}

async function loadInventoryAttention(
  database: DB,
  context: BusinessSummaryContext,
): Promise<AvailableSection<BusinessSummary["sections"]["inventoryAttention"] extends BusinessSummarySection<infer T> ? T : never>> {
  const result = await database.execute(sql`
    SELECT
      p.id AS product_id,
      p.sku,
      p.name,
      COALESCE(SUM(sl.quantity_on_hand), 0)::numeric(12,3)::text AS quantity_on_hand,
      p.reorder_level::numeric(12,3)::text AS reorder_level
    FROM products p
    LEFT JOIN stock_levels sl ON sl.product_id = p.id
    WHERE p.tenant_id = ${context.tenantId}
      AND p.track_stock = true
      AND p.is_active = true
    GROUP BY p.id
    HAVING COALESCE(SUM(sl.quantity_on_hand), 0) <= p.reorder_level
    ORDER BY quantity_on_hand ASC, p.sku
    LIMIT ${ATTENTION_LIMIT + 1}
  `);
  const rows = result.rows as Array<{
    product_id: string;
    sku: string;
    name: string;
    quantity_on_hand: string;
    reorder_level: string;
  }>;

  return {
    status: "available",
    data: {
      basis: "current_stock_levels",
      items: rows.slice(0, ATTENTION_LIMIT).map((row) => ({
        productId: row.product_id,
        sku: row.sku,
        name: row.name,
        quantityOnHand: exactQuantity(row.quantity_on_hand),
        reorderLevel: exactQuantity(row.reorder_level),
      })),
      truncated: rows.length > ATTENTION_LIMIT,
    },
  };
}

async function loadPipelineAttention(
  database: DB,
  context: BusinessSummaryContext,
): Promise<AvailableSection<BusinessSummary["sections"]["pipelineAttention"] extends BusinessSummarySection<infer T> ? T : never>> {
  const result = await database.execute(sql`
    SELECT
      d.stage,
      d.value_currency AS currency,
      COUNT(*)::int AS deal_count,
      COALESCE(SUM(d.value_amount), 0)::numeric(14,2)::text AS value
    FROM deals d
    WHERE d.tenant_id = ${context.tenantId}
      AND d.stage NOT IN ('WON', 'LOST')
    GROUP BY d.stage, d.value_currency
    ORDER BY value DESC, d.stage, d.value_currency
    LIMIT ${PIPELINE_LIMIT + 1}
  `);
  const rows = result.rows as Array<{
    stage: string;
    currency: BusinessSummaryCurrency;
    deal_count: number;
    value: string;
  }>;

  return {
    status: "available",
    data: {
      basis: "current_open_deals",
      stages: rows.slice(0, PIPELINE_LIMIT).map((row) => ({
        stage: row.stage,
        currency: row.currency,
        dealCount: Number(row.deal_count),
        value: exactMoney(row.value),
      })),
      truncated: rows.length > PIPELINE_LIMIT,
    },
  };
}

function subtractMoney(left: string, right: string): string {
  const toMinor = (value: string) => {
    const negative = value.startsWith("-");
    const [whole, fraction] = value.replace("-", "").split(".");
    const minor = BigInt(whole) * 100n + BigInt(fraction);
    return negative ? -minor : minor;
  };
  const value = toMinor(left) - toMinor(right);
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  return `${negative ? "-" : ""}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, "0")}`;
}
