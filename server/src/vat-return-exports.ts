import type { VatTechnicalReport } from "./vat-return-report.js";

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

function pdfText(value: string): string {
  return value.replace(/[^\x20-\x7E]/g, "?")
    .replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
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

function buildPdf(objects: string[]): Buffer {
  let output = "%PDF-1.4\n%\xFF\xFF\xFF\xFF\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(output, "latin1"));
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(output, "latin1");
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index++) {
    output += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(output, "latin1");
}

export function renderVatReportPdf(report: VatTechnicalReport): Buffer {
  const evidenceHeading = "Date       Account     Source              Debit        Credit       Impact";
  const introLines = [
    report.entity.companyName,
    `Period: ${report.period.from} to ${report.period.to}`,
    `Jurisdiction: ${report.entity.countryCode} - ${report.entity.countryName}`,
    `Currency: ${report.currency}`,
    `Generated: ${report.generatedAt}`,
    "",
    `Output VAT: ${report.currency} ${report.totals.outputVat}`,
    `Input VAT: ${report.currency} ${report.totals.inputVat}`,
    `Net VAT: ${report.currency} ${report.totals.netVat} (${report.totals.position})`,
    "",
    "Technical preview only - not filing-ready. Qualified accountant/tax approval is required.",
    "Input VAT includes posted VAT_INPUT ledger lines only; supplier input-VAT workflow is incomplete.",
    "",
    `Evidence rows: ${report.evidence.length}`,
  ];
  const linesPerPage = 38;
  const pages: string[][] = [[...introLines, evidenceHeading]];

  for (const row of report.evidence) {
    const source = `${row.sourceType}:${row.invoice?.number ?? row.sourceId ?? "-"}`.slice(0, 18).padEnd(18);
    const main = `${row.date.slice(0, 10)} ${row.account.padEnd(11)} ${source} ${row.debit.padStart(11)} ${row.credit.padStart(11)} ${row.impact.padStart(11)}`;
    const trace = `  Journal ${row.journalEntryId}; line ${row.journalLineId}; source ${row.sourceId ?? "-"}`;
    const invoiceTax = row.invoice
      ? `  Invoice ${row.invoice.number ?? row.invoice.id}; ${row.invoice.currency}; jurisdiction ${row.invoice.taxJurisdiction ?? "unclassified"}; tax date ${row.invoice.taxDate ?? "unclassified"}; treatment ${row.invoice.taxTreatment ?? "unclassified"}; tax ${row.invoice.taxTotal}`
      : null;
    const block = [main, ...wrap(trace, 90), ...(invoiceTax ? wrap(invoiceTax, 90) : []), ...wrap(`  ${row.memo}`, 90)];
    let currentPage = pages[pages.length - 1];

    if (currentPage.length + block.length > linesPerPage) {
      currentPage = ["Evidence continued", evidenceHeading];
      pages.push(currentPage);
    }

    // A pathological memo can exceed a whole page. Preserve every line while
    // repeating the evidence context on each continuation page.
    for (const line of block) {
      if (currentPage.length >= linesPerPage) {
        currentPage = ["Evidence continued", evidenceHeading];
        pages.push(currentPage);
      }
      currentPage.push(line);
    }
  }

  const objects: string[] = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  const pageIds = pages.map((_, index) => 4 + index * 2);
  objects.push(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`);
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>");

  pages.forEach((page, index) => {
    const pageId = pageIds[index];
    const contentId = pageId + 1;
    const commands: string[] = [
      "BT /F1 13 Tf 40 760 Td (VAT technical preview - not filing-ready) Tj ET",
    ];
    page.forEach((line, lineIndex) => {
      const y = 735 - lineIndex * 17;
      commands.push(`BT /F1 8 Tf 40 ${y} Td (${pdfText(line)}) Tj ET`);
    });
    commands.push(`BT /F1 8 Tf 260 24 Td (Page ${index + 1} of ${pages.length}) Tj ET`);
    const content = commands.join("\n");
    objects[pageId - 1] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId - 1] = `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`;
  });

  return buildPdf(objects);
}
