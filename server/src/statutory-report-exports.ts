import type { StatutoryReportPack } from "./statutory-report-pack.js";
import { renderBrandedFinanceReportPdf, type FinanceReportPdfLine } from "./finance-report-pdf.js";
import type { FinanceReportBranding } from "./report-branding.js";

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
    ["AGED PAYABLES - SUPPORTED SOURCES ONLY"], ["Source ID", "Number", "Counterparty", "Source date", "Days outstanding", "Bucket", "Balance"],
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

export function renderStatutoryReportPdf(report: StatutoryReportPack, branding: FinanceReportBranding): Buffer {
  const section = (text: string): FinanceReportPdfLine => ({ text, emphasis: "section" });
  const total = (text: string): FinanceReportPdfLine => ({ text, emphasis: "total" });
  const plain = (text: string): FinanceReportPdfLine => ({ text });
  const table = (text: string): FinanceReportPdfLine => ({ text, emphasis: "table" });
  const lines: FinanceReportPdfLine[] = [
    { text: "TECHNICAL PREVIEW - NOT FILING-READY", emphasis: "warning" },
    { text: "Qualified accountant approval is required before statutory use.", emphasis: "warning" },
    { text: `Generated ${report.generatedAt}; scope ${report.entity.legalEntityScope}` },
    { text: "Payables covers supported PO receipt sources only; no complete AP open-item subledger.", emphasis: "warning" },
    plain(""), section("TRIAL BALANCE"), table("Code     Account                                  Debit        Credit       Balance"),
    ...report.trialBalance.map((row) => table(`${row.code.padEnd(8)} ${clipped(row.name, 36).padEnd(36)} ${row.debit.padStart(12)} ${row.credit.padStart(12)} ${row.balance.padStart(12)}`)),
    plain(""), section("PROFIT AND LOSS"),
    ...report.profitAndLoss.income.map((row) => table(`Income  ${row.code.padEnd(8)} ${clipped(row.name, 50).padEnd(50)} ${row.amount.padStart(12)}`)),
    ...report.profitAndLoss.expenses.map((row) => table(`Expense ${row.code.padEnd(8)} ${clipped(row.name, 50).padEnd(50)} ${row.amount.padStart(12)}`)),
    total(`Total income ${report.profitAndLoss.totalIncome}; expenses ${report.profitAndLoss.totalExpenses}; net profit ${report.profitAndLoss.netProfit}`),
    plain(""), section("BALANCE SHEET"),
    ...report.balanceSheet.assets.map((row) => table(`Asset     ${row.code.padEnd(8)} ${clipped(row.name, 50).padEnd(50)} ${row.amount.padStart(12)}`)),
    ...report.balanceSheet.liabilities.map((row) => table(`Liability ${row.code.padEnd(8)} ${clipped(row.name, 50).padEnd(50)} ${row.amount.padStart(12)}`)),
    ...report.balanceSheet.equity.map((row) => table(`Equity    ${row.code.padEnd(8)} ${clipped(row.name, 50).padEnd(50)} ${row.amount.padStart(12)}`)),
    total(`Assets ${report.balanceSheet.totalAssets}; liabilities and equity ${report.balanceSheet.totalLiabilitiesAndEquity}; balances ${report.balanceSheet.balances}`),
    plain(""), section("AGED RECEIVABLES"), table("Number       Counterparty                         Date       Days      Balance"),
    ...report.agedReceivables.items.map((row) => table(`${(row.number ?? "-").padEnd(12)} ${clipped(row.counterparty, 36).padEnd(36)} ${row.sourceDate} ${String(row.daysOutstanding).padStart(5)} ${row.balance.padStart(12)}`)),
    total(`Control ${report.agedReceivables.controlBalance}; scheduled ${report.agedReceivables.scheduledBalance}; unallocated ${report.agedReceivables.unallocatedBalance}`),
    plain(""), section("AGED PAYABLES - SUPPORTED SOURCES ONLY"), table("Number       Counterparty                         Date       Days      Balance"),
    ...report.agedPayables.items.map((row) => table(`${(row.number ?? "-").padEnd(12)} ${clipped(row.counterparty, 36).padEnd(36)} ${row.sourceDate} ${String(row.daysOutstanding).padStart(5)} ${row.balance.padStart(12)}`)),
    total(`Control ${report.agedPayables.controlBalance}; scheduled ${report.agedPayables.scheduledBalance}; unallocated ${report.agedPayables.unallocatedBalance}`),
  ];
  const linesPerPage = 39;
  const pages: FinanceReportPdfLine[][] = [];
  for (let index = 0; index < lines.length; index += linesPerPage) pages.push(lines.slice(index, index + linesPerPage));
  if (pages.length === 0) pages.push([]);
  return renderBrandedFinanceReportPdf({
    title: "Management accounts and statutory report pack",
    subtitle: `Period ${report.period.from} to ${report.period.to}  |  as at ${report.period.asAt}  |  ${report.currency}`,
    branding,
    pages,
  });
}
