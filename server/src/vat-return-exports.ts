import type { VatTechnicalReport } from "./vat-return-report.js";
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

function shortId(value: string | null | undefined): string {
  if (!value) return "-";
  return value.length > 8 ? value.slice(0, 8) : value;
}

function friendlySource(sourceType: string): string {
  return sourceType.replace(/[_:]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();
}

// Human evidence reference: prefer the invoice number, else a readable source
// label — never a raw UUID in the primary column.
function referenceLabel(row: VatTechnicalReport["evidence"][number]): string {
  if (row.invoice?.number) return row.invoice.number;
  return friendlySource(row.sourceType);
}

export function renderVatReportPdf(report: VatTechnicalReport, branding: ReportBranding): Buffer {
  const rows: ReportSectionRow[] = [{
    kind: "columns",
    text: `${"Date".padEnd(11)} ${"Account".padEnd(11)} ${"Reference".padEnd(20)} ${"Debit".padStart(12)} ${"Credit".padStart(12)} ${"Impact".padStart(12)}`,
  }];

  if (report.evidence.length === 0) {
    rows.push({ kind: "note", text: "No VAT ledger activity in this period." });
  }

  for (const row of report.evidence) {
    const reference = referenceLabel(row).slice(0, 20).padEnd(20);
    rows.push({
      kind: "row",
      text: `${row.date.slice(0, 10).padEnd(11)} ${row.account.padEnd(11)} ${reference} ${row.debit.padStart(12)} ${row.credit.padStart(12)} ${row.impact.padStart(12)}`,
    });
    if (row.invoice) {
      rows.push({
        kind: "note",
        text: `Invoice ${row.invoice.number ?? row.invoice.id} — ${row.invoice.currency} — jurisdiction ${row.invoice.taxJurisdiction ?? "unclassified"} — tax date ${row.invoice.taxDate ?? "unclassified"} — treatment ${row.invoice.taxTreatment ?? "unclassified"} — tax ${row.invoice.taxTotal}`,
      });
    }
    if (row.memo && row.memo.trim()) {
      rows.push({ kind: "note", text: `Memo: ${row.memo.trim()}` });
    }
    // Technical trace kept for auditors, de-emphasised and abbreviated so the
    // figures — not the identifiers — lead the page.
    rows.push({
      kind: "reference",
      text: `ref  journal ${shortId(row.journalEntryId)}  ·  line ${shortId(row.journalLineId)}  ·  source ${shortId(row.sourceId)}`,
    });
  }

  const model: BrandedReport = {
    documentKind: "VAT Technical Preview",
    notFilingReady: true,
    branding,
    meta: [
      { label: "Period", value: `${report.period.from} to ${report.period.to}` },
      { label: "Jurisdiction", value: `${report.entity.countryCode} - ${report.entity.countryName}` },
      { label: "Currency", value: report.currency },
      { label: "Generated", value: report.generatedAt },
    ],
    summary: [
      { label: "Output VAT", value: `${report.currency} ${report.totals.outputVat}` },
      { label: "Input VAT", value: `${report.currency} ${report.totals.inputVat}` },
      { label: "Net VAT", value: `${report.currency} ${report.totals.netVat} (${report.totals.position})`, strong: true },
    ],
    notices: [
      "Technical preview only - not filing-ready. Qualified accountant/tax approval is required.",
      "Input VAT includes posted VAT_INPUT ledger lines, including matched supplier bills; eligibility still requires professional review.",
    ],
    sections: [{ heading: `Evidence (${report.evidence.length} rows)`, rows }],
  };

  return renderBrandedReportPdf(model);
}
