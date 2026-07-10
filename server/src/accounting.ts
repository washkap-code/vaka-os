// ============================================================================
// ACCOUNTING CORE — double-entry journal engine + Zimbabwe chart of accounts.
// Every financial effect anywhere in the platform posts through postJournal().
// An entry that does not balance (Σdebits === Σcredits) throws and rolls back
// the surrounding transaction. Amounts are in tenant base currency.
// ============================================================================
import { and, eq } from "drizzle-orm";
import { DB, schema, badRequest, toCents, fromCents } from "./lib.js";

export interface JournalLineInput {
  accountId: string;
  debit?: string;   // "123.45"
  credit?: string;
  originalAmount?: string;
  originalCurrency?: "USD" | "ZWG";
  exchangeRate?: string;
}

export async function postJournal(
  tx: DB,
  opts: {
    tenantId: string; date: Date; memo: string;
    sourceType: string; sourceId?: string; createdBy?: string | null;
    lines: JournalLineInput[];
  },
): Promise<string> {
  if (opts.lines.length < 2) throw badRequest("Journal entry needs at least 2 lines");
  const accountIds = [...new Set(opts.lines.map((line) => line.accountId))];
  const accounts = await tx.select({
    id: schema.accounts.id,
  }).from(schema.accounts).where(and(
    eq(schema.accounts.tenantId, opts.tenantId),
    eq(schema.accounts.isActive, true),
  ));
  const validAccountIds = new Set(accounts.map((account) => account.id));
  if (accountIds.some((accountId) => !validAccountIds.has(accountId))) {
    throw badRequest("Journal line account is invalid for this tenant");
  }

  let d = 0n, c = 0n;
  for (const l of opts.lines) {
    const debit = toCents(l.debit ?? "0");
    const credit = toCents(l.credit ?? "0");
    if (debit < 0n || credit < 0n) throw badRequest("Journal amounts must be non-negative");
    if (debit > 0n && credit > 0n) throw badRequest("A journal line cannot be both debit and credit");
    d += debit; c += credit;
  }
  if (d !== c) throw badRequest(`Journal entry does not balance: debits ${fromCents(d)} vs credits ${fromCents(c)}`);
  if (d === 0n) throw badRequest("Journal entry has zero value");

  const [entry] = await tx.insert(schema.journalEntries).values({
    tenantId: opts.tenantId, date: opts.date, memo: opts.memo,
    sourceType: opts.sourceType, sourceId: opts.sourceId ?? null,
    createdBy: opts.createdBy ?? null,
  }).returning({ id: schema.journalEntries.id });

  await tx.insert(schema.journalLines).values(opts.lines.map((l) => ({
    journalEntryId: entry.id,
    accountId: l.accountId,
    debit: l.debit ?? "0",
    credit: l.credit ?? "0",
    originalAmount: l.originalAmount ?? null,
    originalCurrency: l.originalCurrency ?? null,
    exchangeRate: l.exchangeRate ?? null,
  })));
  return entry.id;
}

/** Fetch a tenant's system account by key (AR, SALES, VAT_OUTPUT, ...). */
export async function systemAccount(tx: DB, tenantId: string, key: string) {
  const [acc] = await tx.select().from(schema.accounts)
    .where(and(eq(schema.accounts.tenantId, tenantId), eq(schema.accounts.systemKey, key)));
  if (!acc) throw badRequest(`System account ${key} missing for tenant — chart of accounts not seeded`);
  return acc;
}

// ---------------------------------------------------------------------------
// Default Zimbabwe SME chart of accounts.
// NOTE FOR DEPLOYMENT: have a registered Zimbabwean accountant review this
// template (codes, VAT treatment, QPD/income-tax accounts) before go-live.
// ---------------------------------------------------------------------------
type CoARow = { code: string; name: string; type: "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE"; systemKey?: string };
export const ZW_DEFAULT_COA: CoARow[] = [
  // Assets
  { code: "1000", name: "Bank — USD (Nostro FCA)", type: "ASSET", systemKey: "BANK" },
  { code: "1010", name: "Bank — ZWG", type: "ASSET" },
  { code: "1050", name: "Cash on Hand", type: "ASSET" },
  { code: "1100", name: "Accounts Receivable", type: "ASSET", systemKey: "AR" },
  { code: "1200", name: "Inventory on Hand", type: "ASSET", systemKey: "INVENTORY" },
  { code: "1300", name: "VAT Input (Receivable)", type: "ASSET", systemKey: "VAT_INPUT" },
  { code: "1500", name: "Equipment & Fixtures", type: "ASSET" },
  // Liabilities
  { code: "2000", name: "Accounts Payable", type: "LIABILITY", systemKey: "AP" },
  { code: "2100", name: "VAT Output (Payable to ZIMRA)", type: "LIABILITY", systemKey: "VAT_OUTPUT" },
  { code: "2200", name: "PAYE Payable", type: "LIABILITY" },
  { code: "2210", name: "NSSA Payable", type: "LIABILITY" },
  { code: "2300", name: "Income Tax / QPD Provision", type: "LIABILITY" },
  { code: "2400", name: "Loans Payable", type: "LIABILITY" },
  // Equity
  { code: "3000", name: "Owner's Capital", type: "EQUITY" },
  { code: "3100", name: "Opening Balance Equity", type: "EQUITY", systemKey: "OPENING_EQUITY" },
  { code: "3900", name: "Retained Earnings", type: "EQUITY" },
  // Income
  { code: "4000", name: "Sales Revenue", type: "INCOME", systemKey: "SALES" },
  { code: "4100", name: "Service Revenue", type: "INCOME" },
  { code: "4900", name: "Exchange Gain/(Loss)", type: "INCOME", systemKey: "FX_GAIN_LOSS" },
  // Expenses
  { code: "5000", name: "Cost of Goods Sold", type: "EXPENSE", systemKey: "COGS" },
  { code: "6000", name: "Salaries & Wages", type: "EXPENSE" },
  { code: "6100", name: "Rent", type: "EXPENSE" },
  { code: "6200", name: "Utilities & Connectivity", type: "EXPENSE" },
  { code: "6300", name: "Transport & Fuel", type: "EXPENSE" },
  { code: "6400", name: "Bank Charges & IMTT", type: "EXPENSE" },
  { code: "6500", name: "Licences & Regulatory Fees", type: "EXPENSE" },
  { code: "6600", name: "Marketing", type: "EXPENSE" },
  { code: "6900", name: "General Expenses", type: "EXPENSE" },
];

export async function seedChartOfAccounts(tx: DB, tenantId: string) {
  await tx.insert(schema.accounts).values(ZW_DEFAULT_COA.map((a) => ({
    tenantId, code: a.code, name: a.name, type: a.type,
    isSystem: !!a.systemKey, systemKey: a.systemKey ?? null,
  })));
}
