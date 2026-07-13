import type { StatutoryReportPack } from "./statutory-report-pack.js";

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

function pdfText(value: string): string {
  return value.replace(/[^\x20-\x7E]/g, "?").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function buildPdf(objects: string[]): Buffer {
  let output = "%PDF-1.4\n%\xFF\xFF\xFF\xFF\n";
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(output, "latin1")); output += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xrefOffset = Buffer.byteLength(output, "latin1");
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index++) output += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(output, "latin1");
}

function clipped(value: string, length: number): string { return value.length <= length ? value : `${value.slice(0, length - 1)}~`; }

export function renderStatutoryReportPdf(report: StatutoryReportPack): Buffer {
  const lines: string[] = [
    report.entity.companyName, `Period: ${report.period.from} to ${report.period.to}; as at ${report.period.asAt}`,
    `Currency: ${report.currency}; scope: ${report.entity.legalEntityScope}`, `Generated: ${report.generatedAt}`, "",
    "TECHNICAL PREVIEW ONLY - NOT FILING-READY. Qualified accountant approval required.",
    "Payables covers supported PO receipt sources only; no complete AP open-item subledger.", "",
    "TRIAL BALANCE", "Code     Account                                  Debit        Credit       Balance",
    ...report.trialBalance.map((row) => `${row.code.padEnd(8)} ${clipped(row.name, 36).padEnd(36)} ${row.debit.padStart(12)} ${row.credit.padStart(12)} ${row.balance.padStart(12)}`), "",
    "PROFIT AND LOSS", ...report.profitAndLoss.income.map((row) => `Income  ${row.code.padEnd(8)} ${clipped(row.name, 50).padEnd(50)} ${row.amount.padStart(12)}`),
    ...report.profitAndLoss.expenses.map((row) => `Expense ${row.code.padEnd(8)} ${clipped(row.name, 50).padEnd(50)} ${row.amount.padStart(12)}`),
    `Total income ${report.profitAndLoss.totalIncome}; expenses ${report.profitAndLoss.totalExpenses}; net profit ${report.profitAndLoss.netProfit}`, "",
    "BALANCE SHEET", ...report.balanceSheet.assets.map((row) => `Asset     ${row.code.padEnd(8)} ${clipped(row.name, 50).padEnd(50)} ${row.amount.padStart(12)}`),
    ...report.balanceSheet.liabilities.map((row) => `Liability ${row.code.padEnd(8)} ${clipped(row.name, 50).padEnd(50)} ${row.amount.padStart(12)}`),
    ...report.balanceSheet.equity.map((row) => `Equity    ${row.code.padEnd(8)} ${clipped(row.name, 50).padEnd(50)} ${row.amount.padStart(12)}`),
    `Assets ${report.balanceSheet.totalAssets}; liabilities and equity ${report.balanceSheet.totalLiabilitiesAndEquity}; balances ${report.balanceSheet.balances}`, "",
    "AGED RECEIVABLES", "Number       Counterparty                         Date       Days      Balance",
    ...report.agedReceivables.items.map((row) => `${(row.number ?? "-").padEnd(12)} ${clipped(row.counterparty, 36).padEnd(36)} ${row.sourceDate} ${String(row.daysOutstanding).padStart(5)} ${row.balance.padStart(12)}`),
    `Control ${report.agedReceivables.controlBalance}; scheduled ${report.agedReceivables.scheduledBalance}; unallocated ${report.agedReceivables.unallocatedBalance}`, "",
    "AGED PAYABLES - SUPPORTED SOURCES ONLY", "Number       Counterparty                         Date       Days      Balance",
    ...report.agedPayables.items.map((row) => `${(row.number ?? "-").padEnd(12)} ${clipped(row.counterparty, 36).padEnd(36)} ${row.sourceDate} ${String(row.daysOutstanding).padStart(5)} ${row.balance.padStart(12)}`),
    `Control ${report.agedPayables.controlBalance}; scheduled ${report.agedPayables.scheduledBalance}; unallocated ${report.agedPayables.unallocatedBalance}`,
  ];
  const linesPerPage = 39;
  const pages: string[][] = [];
  for (let index = 0; index < lines.length; index += linesPerPage) pages.push(lines.slice(index, index + linesPerPage));
  if (pages.length === 0) pages.push([]);
  const objects: string[] = ["<< /Type /Catalog /Pages 2 0 R >>"];
  const pageIds = pages.map((_, index) => 4 + index * 2);
  objects.push(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`);
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>");
  pages.forEach((page, index) => {
    const pageId = pageIds[index]; const contentId = pageId + 1;
    const commands = ["BT /F1 12 Tf 40 760 Td (Statutory report pack - technical preview) Tj ET"];
    page.forEach((line, lineIndex) => commands.push(`BT /F1 7 Tf 30 ${738 - lineIndex * 17} Td (${pdfText(line)}) Tj ET`));
    commands.push(`BT /F1 8 Tf 260 24 Td (Page ${index + 1} of ${pages.length}) Tj ET`);
    const content = commands.join("\n");
    objects[pageId - 1] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId - 1] = `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`;
  });
  return buildPdf(objects);
}
