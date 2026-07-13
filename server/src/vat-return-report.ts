import { and, asc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "./lib.js";
import { fromMinorUnits, toMinorUnits } from "./reports.js";
import { LOCALISATION_SERVICE, platformKernel } from "./platform-runtime.js";

const DAY_MS = 86_400_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_PERIOD_DAYS = 366;

function isCalendarDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export const vatReportPeriodSchema = z.object({
  from: z.string().refine(isCalendarDate, "From date must be a valid YYYY-MM-DD calendar date"),
  to: z.string().refine(isCalendarDate, "To date must be a valid YYYY-MM-DD calendar date"),
}).superRefine((period, context) => {
  if (!isCalendarDate(period.from) || !isCalendarDate(period.to)) return;
  const from = Date.parse(`${period.from}T00:00:00.000Z`);
  const to = Date.parse(`${period.to}T00:00:00.000Z`);
  if (to < from) {
    context.addIssue({ code: "custom", path: ["to"], message: "To date must be on or after from date" });
    return;
  }
  if (Math.floor((to - from) / DAY_MS) + 1 > MAX_PERIOD_DAYS) {
    context.addIssue({ code: "custom", path: ["to"], message: `VAT report period cannot exceed ${MAX_PERIOD_DAYS} days` });
  }
});

export type VatReportPeriod = z.infer<typeof vatReportPeriodSchema>;
export type VatAccountKind = "VAT_OUTPUT" | "VAT_INPUT";

export type VatEvidenceRow = {
  journalLineId: string;
  journalEntryId: string;
  date: string;
  memo: string;
  sourceType: string;
  sourceId: string | null;
  account: VatAccountKind;
  debit: string;
  credit: string;
  impact: string;
  invoice: null | {
    id: string;
    number: string | null;
    currency: "USD" | "ZWG";
    taxJurisdiction: string | null;
    taxDate: string | null;
    taxTreatment: string | null;
    taxTotal: string;
  };
};

export type VatTechnicalReport = {
  reportType: "vat-technical-preview";
  filingReady: false;
  generatedAt: string;
  entity: { tenantId: string; companyName: string; countryCode: string; countryName: string };
  period: VatReportPeriod;
  currency: "USD" | "ZWG";
  totals: {
    outputVat: string;
    inputVat: string;
    netVat: string;
    position: "payable" | "credit" | "nil";
  };
  evidence: VatEvidenceRow[];
  coverage: {
    source: "posted-vat-control-accounts";
    inputVat: "posted-vat-input-ledger-only";
    blockerCodes: readonly ["PROFESSIONAL_APPROVAL_REQUIRED", "SUPPLIER_INPUT_VAT_WORKFLOW_INCOMPLETE", "LEGAL_ENTITY_MODEL_INCOMPLETE"];
  };
};

export async function getVatTechnicalReport(opts: {
  tenantId: string;
  period: VatReportPeriod;
  generatedAt?: Date;
}): Promise<VatTechnicalReport> {
  const period = vatReportPeriodSchema.parse(opts.period);
  const from = new Date(`${period.from}T00:00:00.000Z`);
  const toExclusive = new Date(Date.parse(`${period.to}T00:00:00.000Z`) + DAY_MS);
  const [tenant] = await db.select({
    id: schema.tenants.id,
    companyName: schema.tenants.companyName,
    countryCode: schema.tenants.countryCode,
    baseCurrency: schema.tenants.baseCurrency,
  }).from(schema.tenants).where(eq(schema.tenants.id, opts.tenantId));
  if (!tenant) throw new Error("Tenant context is unavailable");
  const country = platformKernel().container.get(LOCALISATION_SERVICE).pack(tenant.countryCode);

  const rows = await db.select({
    journalLineId: schema.journalLines.id,
    journalEntryId: schema.journalEntries.id,
    date: schema.journalEntries.date,
    memo: schema.journalEntries.memo,
    sourceType: schema.journalEntries.sourceType,
    sourceId: schema.journalEntries.sourceId,
    account: schema.accounts.systemKey,
    debit: schema.journalLines.debit,
    credit: schema.journalLines.credit,
    invoiceId: schema.invoices.id,
    invoiceNumber: schema.invoices.number,
    invoiceCurrency: schema.invoices.currency,
    invoiceTaxJurisdiction: schema.invoices.taxJurisdiction,
    invoiceTaxDate: schema.invoices.taxDate,
    invoiceTaxTreatment: schema.invoices.taxTreatment,
    invoiceTaxTotal: schema.invoices.taxTotal,
  }).from(schema.journalLines)
    .innerJoin(schema.journalEntries, and(
      eq(schema.journalEntries.id, schema.journalLines.journalEntryId),
      eq(schema.journalEntries.tenantId, opts.tenantId),
    ))
    .innerJoin(schema.accounts, and(
      eq(schema.accounts.id, schema.journalLines.accountId),
      eq(schema.accounts.tenantId, opts.tenantId),
    ))
    .leftJoin(schema.invoices, and(
      eq(schema.invoices.tenantId, opts.tenantId),
      eq(schema.journalEntries.sourceType, "invoice"),
      sql`${schema.invoices.id}::text = ${schema.journalEntries.sourceId}`,
    ))
    .where(and(
      inArray(schema.accounts.systemKey, ["VAT_OUTPUT", "VAT_INPUT"]),
      gte(schema.journalEntries.date, from),
      lt(schema.journalEntries.date, toExclusive),
    ))
    .orderBy(asc(schema.journalEntries.date), asc(schema.journalEntries.createdAt), asc(schema.journalLines.id));

  let outputVat = 0n;
  let inputVat = 0n;
  const evidence: VatEvidenceRow[] = rows.map((row) => {
    const account = row.account as VatAccountKind;
    const debit = toMinorUnits(row.debit);
    const credit = toMinorUnits(row.credit);
    const impact = account === "VAT_OUTPUT" ? credit - debit : debit - credit;
    if (account === "VAT_OUTPUT") outputVat += impact;
    else inputVat += impact;
    return {
      journalLineId: row.journalLineId,
      journalEntryId: row.journalEntryId,
      date: row.date.toISOString(),
      memo: row.memo,
      sourceType: row.sourceType,
      sourceId: row.sourceId,
      account,
      debit: fromMinorUnits(debit),
      credit: fromMinorUnits(credit),
      impact: fromMinorUnits(impact),
      invoice: row.invoiceId && row.invoiceCurrency && row.invoiceTaxTotal ? {
        id: row.invoiceId,
        number: row.invoiceNumber,
        currency: row.invoiceCurrency,
        taxJurisdiction: row.invoiceTaxJurisdiction,
        taxDate: row.invoiceTaxDate,
        taxTreatment: row.invoiceTaxTreatment,
        taxTotal: row.invoiceTaxTotal,
      } : null,
    };
  });
  const netVat = outputVat - inputVat;

  return {
    reportType: "vat-technical-preview",
    filingReady: false,
    generatedAt: (opts.generatedAt ?? new Date()).toISOString(),
    entity: {
      tenantId: tenant.id,
      companyName: tenant.companyName,
      countryCode: country.code,
      countryName: country.name,
    },
    period,
    currency: tenant.baseCurrency,
    totals: {
      outputVat: fromMinorUnits(outputVat),
      inputVat: fromMinorUnits(inputVat),
      netVat: fromMinorUnits(netVat),
      position: netVat > 0n ? "payable" : netVat < 0n ? "credit" : "nil",
    },
    evidence,
    coverage: {
      source: "posted-vat-control-accounts",
      inputVat: "posted-vat-input-ledger-only",
      blockerCodes: [
        "PROFESSIONAL_APPROVAL_REQUIRED",
        "SUPPLIER_INPUT_VAT_WORKFLOW_INCOMPLETE",
        "LEGAL_ENTITY_MODEL_INCOMPLETE",
      ],
    },
  };
}
