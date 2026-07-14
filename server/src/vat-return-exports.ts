import type { VatTechnicalReport } from "./vat-return-report.js";
import { renderBrandedFinanceReportPdf, type FinanceReportPdfLine } from "./finance-report-pdf.js";
import type { FinanceReportBranding } from "./report-branding.js";

function safeCsvCell(value: string): string {
  const trimmed = value.trimStart();
  const unsafeFormula = /^[=+@]/.test(trimmed) || (/^-/.test(trimmed) && !/^-\d+(?:\.\d+)?$/.test(trimmed));
  const protectedValue = unsafeFormula ? `'${value}` : value;
  return `"${protectedValue.replace(/"/g, '""')}"`;
}

export function renderVatReportCsv(report: VatTechnicalReport): string {
  const rows: string[][] = [
    ["Report type", report.reportType],
    ["Filing ready", String(report.filingReady)],
    ["Entity", report.entity.companyName],
    ["Country", `${report.entity.countryCode} - ${report.entity.countryName}`],
    ["Period from", report.period.from],
    ["Period to", report.period.to],
    ["Currency", report.currency],
    ["Output VAT", report.totals.outputVat],
    ["Input VAT", report.totals.inputVat],
    ["Net VAT", report.totals.netVat],
    ["Position", report.totals.position],
    [],
    ["Journal line ID", "Journal entry ID", "Date", "Account", "Source type", "Source ID", "Invoice number", "Invoice currency", "Invoice jurisdiction", "Invoice tax date", "Invoice treatment", "Invoice tax total", "Debit", "Credit", "VAT impact", "Memo"],
    ...report.evidence.map((row) => [
      row.journalLineId,
      row.journalEntryId,
      row.date,
      row.account,
      row.sourceType,
      row.sourceId ?? "",
      row.invoice?.number ?? "",
      row.invoice?.currency ?? "",
      row.invoice?.taxJurisdiction ?? "",
      row.invoice?.taxDate ?? "",
      row.invoice?.taxTreatment ?? "",
      row.invoice?.taxTotal ?? "",
      row.debit,
      row.credit,
      row.impact,
      row.memo,
    ]),
  ];
  return `\uFEFF${rows.map((row) => row.map(safeCsvCell).join(",")).join("\r\n")}\r\n`;
}

function wrap(value: string, maxLength = 92): string[] {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (!current) current = word;
    else if (`${current} ${word}`.length <= maxLength) current += ` ${word}`;
    else { lines.push(current); current = word; }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

export function renderVatReportPdf(report: VatTechnicalReport, branding: FinanceReportBranding): Buffer {
  const evidenceHeading = "Date       Account     Source              Debit        Credit       Impact";
  const introLines: FinanceReportPdfLine[] = [
    { text: "TECHNICAL PREVIEW - NOT FILING-READY", emphasis: "warning" },
    { text: "Qualified accountant and tax approval is required before statutory use.", emphasis: "warning" },
    { text: "" },
    { text: "REPORT SCOPE", emphasis: "section" },
    { text: `Jurisdiction: ${report.entity.countryCode} - ${report.entity.countryName}` },
    { text: `Generated: ${report.generatedAt}` },
    { text: "Input VAT includes posted VAT_INPUT ledger lines only; supplier input-VAT workflow is incomplete.", emphasis: "warning" },
    { text: "" },
    { text: "VAT POSITION", emphasis: "section" },
    { text: `Output VAT: ${report.currency} ${report.totals.outputVat}`, emphasis: "total" },
    { text: `Input VAT: ${report.currency} ${report.totals.inputVat}`, emphasis: "total" },
    { text: `Net VAT: ${report.currency} ${report.totals.netVat} (${report.totals.position})`, emphasis: "total" },
    { text: "" },
    { text: `EVIDENCE (${report.evidence.length} ROWS)`, emphasis: "section" },
    { text: evidenceHeading, emphasis: "table" },
  ];
  const linesPerPage = 38;
  const pages: FinanceReportPdfLine[][] = [[...introLines]];

  for (const row of report.evidence) {
    const source = `${row.sourceType}:${row.invoice?.number ?? row.sourceId ?? "-"}`.slice(0, 18).padEnd(18);
    const main = `${row.date.slice(0, 10)} ${row.account.padEnd(11)} ${source} ${row.debit.padStart(11)} ${row.credit.padStart(11)} ${row.impact.padStart(11)}`;
    const trace = `  Journal ${row.journalEntryId}; line ${row.journalLineId}; source ${row.sourceId ?? "-"}`;
    const invoiceTax = row.invoice
      ? `  Invoice ${row.invoice.number ?? row.invoice.id}; ${row.invoice.currency}; jurisdiction ${row.invoice.taxJurisdiction ?? "unclassified"}; tax date ${row.invoice.taxDate ?? "unclassified"}; treatment ${row.invoice.taxTreatment ?? "unclassified"}; tax ${row.invoice.taxTotal}`
      : null;
    const block = [main, ...wrap(trace, 90), ...(invoiceTax ? wrap(invoiceTax, 90) : []), ...wrap(`  ${row.memo}`, 90)]
      .map((text, index) => ({ text, emphasis: index === 0 ? "table" as const : undefined }));
    let currentPage = pages[pages.length - 1];

    if (currentPage.length + block.length > linesPerPage) {
      currentPage = [{ text: "EVIDENCE CONTINUED", emphasis: "section" }, { text: evidenceHeading, emphasis: "table" }];
      pages.push(currentPage);
    }

    // A pathological memo can exceed a whole page. Preserve every line while
    // repeating the evidence context on each continuation page.
    for (const line of block) {
      if (currentPage.length >= linesPerPage) {
        currentPage = [{ text: "EVIDENCE CONTINUED", emphasis: "section" }, { text: evidenceHeading, emphasis: "table" }];
        pages.push(currentPage);
      }
      currentPage.push(line);
    }
  }

  return renderBrandedFinanceReportPdf({
    title: "VAT technical preview",
    subtitle: `Period ${report.period.from} to ${report.period.to}  |  ${report.currency}  |  tenant provisional scope`,
    branding,
    pages,
  });
}
