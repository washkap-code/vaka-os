import type { StatutoryReportPack } from "./statutory-report-pack.js";
import {
  renderBrandedReportPdf,
  type BrandedReport,
  type ReportBranding,
  type ReportSectionRow,
} from "./report-pdf.js";

function safeCsvCell(value: string): string {
  const trimmed = value.trimStart();
  const unsafeFormula = /^[=+@]/.test(trimmed) || (/^-/.test(trimmed) && !/^-\d+(?:\.\d+)?$/.test(trimmed));
  const protectedValue = unsafeFormula ? `'${value}` : value;
  return `"${protectedValue.replace(/"/g, '""')}"`;
}

export function renderStatutoryReportCsv(report: StatutoryReportPack): string {
  const rows: string[][] = [
    ["Report type", report.reportType], ["Version", report.version], ["Availability", report.availability],
    ["Filing ready", String(!report.notFilingReady)], ["Entity", report.entity.companyName],
    ["Legal entity scope", report.entity.legalEntityScope], ["Period from", report.period.from], ["Period to", report.period.to],
    ["As at", report.period.asAt], ["Currency", report.currency], ["Professional review required", "true"], [],
    ["TRIAL BALANCE"], ["Code", "Account", "Type", "Debit", "Credit", "Balance"],
    ...report.trialBalance.map((row) => [row.code, row.name, row.type, row.debit, row.credit, row.balance]), [],
    ["PROFIT AND LOSS"], ["Section", "Code", "Account", "Amount"],
    ...report.profitAndLoss.income.map((row) => ["Income", row.code, row.name, row.amount]),
    ...report.profitAndLoss.expenses.map((row) => ["Expense", row.code, row.name, row.amount]),
    ["Total income", "", "", report.profitAndLoss.totalIncome], ["Total expenses", "", "", report.profitAndLoss.totalExpenses],
    ["Net profit", "", "", report.profitAndLoss.netProfit], [],
    ["BALANCE SHEET"], ["Section", "Code", "Account", "Amount"],
    ...report.balanceSheet.assets.map((row) => ["Asset", row.code, row.name, row.amount]),
    ...report.balanceSheet.liabilities.map((row) => ["Liability", row.code, row.name, row.amount]),
    ...report.balanceSheet.equity.map((row) => ["Equity", row.code, row.name, row.amount]),
    ["Current earnings", "", "", report.balanceSheet.currentEarnings], ["Total assets", "", "", report.balanceSheet.totalAssets],
    ["Total liabilities and equity", "", "", report.balanceSheet.totalLiabilitiesAndEquity], [],
    ["AGED RECEIVABLES"], ["Source ID", "Number", "Counterparty", "Source date", "Days overdue", "Bucket", "Balance"],
    ...report.agedReceivables.items.map((row) => [row.sourceId, row.number ?? "", row.counterparty, row.sourceDate, String(row.daysOutstanding), row.bucket, row.balance]),
    ["Control balance", "", "", "", "", "", report.agedReceivables.controlBalance],
    ["Scheduled balance", "", "", "", "", "", report.agedReceivables.scheduledBalance],
    ["Unallocated balance", "", "", "", "", "", report.agedReceivables.unallocatedBalance], [],
    ["AGED PAYABLES - SUPPLIER BILLS"], ["Source ID", "Number", "Counterparty", "Source date", "Days outstanding", "Bucket", "Balance"],
    ...report.agedPayables.items.map((row) => [row.sourceId, row.number ?? "", row.counterparty, row.sourceDate, String(row.daysOutstanding), row.bucket, row.balance]),
    ["Control balance", "", "", "", "", "", report.agedPayables.controlBalance],
    ["Scheduled balance", "", "", "", "", "", report.agedPayables.scheduledBalance],
    ["Unallocated balance", "", "", "", "", "", report.agedPayables.unallocatedBalance], [],
    ["LIMITATIONS"], ["Technical preview only; not filing-ready. Qualified accountant approval is required."],
    ["Tenant is a provisional reporting scope; a canonical legal-entity model is not implemented."],
    ["Payables ageing covers supported PO receipt sources only; supplier due dates and a complete AP open-item subledger are not implemented."],
  ];
  return `\uFEFF${rows.map((row) => row.map(safeCsvCell).join(",")).join("\r\n")}\r\n`;
}

function clipped(value: string, length: number): string { return value.length <= length ? value : `${value.slice(0, length - 1)}~`; }

export function renderStatutoryReportPdf(report: StatutoryReportPack, branding: ReportBranding): Buffer {
  const trialBalance: ReportSectionRow[] = [
    { kind: "columns", text: `${"Code".padEnd(8)} ${"Account".padEnd(36)} ${"Debit".padStart(12)} ${"Credit".padStart(12)} ${"Balance".padStart(12)}` },
    ...report.trialBalance.map((row): ReportSectionRow => ({
      kind: "row",
      text: `${row.code.padEnd(8)} ${clipped(row.name, 36).padEnd(36)} ${row.debit.padStart(12)} ${row.credit.padStart(12)} ${row.balance.padStart(12)}`,
    })),
  ];

  const profitAndLoss: ReportSectionRow[] = [
    { kind: "columns", text: `${"Section".padEnd(8)} ${"Code".padEnd(8)} ${"Account".padEnd(50)} ${"Amount".padStart(12)}` },
    ...report.profitAndLoss.income.map((row): ReportSectionRow => ({
      kind: "row", text: `${"Income".padEnd(8)} ${row.code.padEnd(8)} ${clipped(row.name, 50).padEnd(50)} ${row.amount.padStart(12)}`,
    })),
    ...report.profitAndLoss.expenses.map((row): ReportSectionRow => ({
      kind: "row", text: `${"Expense".padEnd(8)} ${row.code.padEnd(8)} ${clipped(row.name, 50).padEnd(50)} ${row.amount.padStart(12)}`,
    })),
    { kind: "note", text: `Total income ${report.profitAndLoss.totalIncome} — total expenses ${report.profitAndLoss.totalExpenses} — net profit ${report.profitAndLoss.netProfit}` },
  ];

  const balanceSheet: ReportSectionRow[] = [
    { kind: "columns", text: `${"Section".padEnd(9)} ${"Code".padEnd(8)} ${"Account".padEnd(50)} ${"Amount".padStart(12)}` },
    ...report.balanceSheet.assets.map((row): ReportSectionRow => ({
      kind: "row", text: `${"Asset".padEnd(9)} ${row.code.padEnd(8)} ${clipped(row.name, 50).padEnd(50)} ${row.amount.padStart(12)}`,
    })),
    ...report.balanceSheet.liabilities.map((row): ReportSectionRow => ({
      kind: "row", text: `${"Liability".padEnd(9)} ${row.code.padEnd(8)} ${clipped(row.name, 50).padEnd(50)} ${row.amount.padStart(12)}`,
    })),
    ...report.balanceSheet.equity.map((row): ReportSectionRow => ({
      kind: "row", text: `${"Equity".padEnd(9)} ${row.code.padEnd(8)} ${clipped(row.name, 50).padEnd(50)} ${row.amount.padStart(12)}`,
    })),
    { kind: "note", text: `Total assets ${report.balanceSheet.totalAssets} — liabilities and equity ${report.balanceSheet.totalLiabilitiesAndEquity} — balances ${report.balanceSheet.balances}` },
  ];

  const agedColumns: ReportSectionRow = {
    kind: "columns", text: `${"Number".padEnd(12)} ${"Counterparty".padEnd(36)} ${"Date".padEnd(10)} ${"Days".padStart(5)} ${"Balance".padStart(12)}`,
  };
  const agedReceivables: ReportSectionRow[] = [
    agedColumns,
    ...report.agedReceivables.items.map((row): ReportSectionRow => ({
      kind: "row", text: `${(row.number ?? "-").padEnd(12)} ${clipped(row.counterparty, 36).padEnd(36)} ${row.sourceDate.padEnd(10)} ${String(row.daysOutstanding).padStart(5)} ${row.balance.padStart(12)}`,
    })),
    { kind: "note", text: `Control ${report.agedReceivables.controlBalance} — scheduled ${report.agedReceivables.scheduledBalance} — unallocated ${report.agedReceivables.unallocatedBalance}` },
  ];
  const agedPayables: ReportSectionRow[] = [
    agedColumns,
    ...report.agedPayables.items.map((row): ReportSectionRow => ({
      kind: "row", text: `${(row.number ?? "-").padEnd(12)} ${clipped(row.counterparty, 36).padEnd(36)} ${row.sourceDate.padEnd(10)} ${String(row.daysOutstanding).padStart(5)} ${row.balance.padStart(12)}`,
    })),
    { kind: "note", text: `Control ${report.agedPayables.controlBalance} — scheduled ${report.agedPayables.scheduledBalance} — unallocated ${report.agedPayables.unallocatedBalance}` },
  ];

  const model: BrandedReport = {
    documentKind: "Statutory Report Pack",
    notFilingReady: true,
    branding,
    meta: [
      { label: "Period", value: `${report.period.from} to ${report.period.to} (as at ${report.period.asAt})` },
      { label: "Currency", value: report.currency },
      { label: "Scope", value: report.entity.legalEntityScope },
      { label: "Generated", value: report.generatedAt },
    ],
    summary: [
      { label: "Net profit", value: `${report.currency} ${report.profitAndLoss.netProfit}` },
      { label: "Total assets", value: `${report.currency} ${report.balanceSheet.totalAssets}` },
      { label: "Liabilities and equity", value: `${report.currency} ${report.balanceSheet.totalLiabilitiesAndEquity}`, strong: true },
    ],
    notices: [
      "Technical preview only - not filing-ready. Qualified accountant approval is required.",
      "Payables covers supported PO receipt sources only; no complete AP open-item subledger.",
    ],
    sections: [
      { heading: "Trial balance", rows: trialBalance },
      { heading: "Profit and loss", rows: profitAndLoss },
      { heading: "Balance sheet", rows: balanceSheet },
      { heading: "Aged receivables", rows: agedReceivables },
      { heading: "Aged payables - supplier bills", rows: agedPayables },
    ],
  };

  return renderBrandedReportPdf(model);
}
