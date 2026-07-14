import { VAKA_DOCUMENT_FOOTER } from "./document-branding.js";
import {
  ENTERPRISE_DOCUMENT,
  PdfDocument,
  type PdfColour,
  type PdfPage,
  fitImage,
  parseDocumentImage,
  pdfColour,
  wrapPdfText,
} from "./document-layout.js";

export type InvoiceSnapshotDocument = {
  issuer: {
    companyName: string;
    logoUrl?: string | null;
    brandPrimaryColor?: string | null;
    brandSecondaryColor?: string | null;
    physicalAddress: string | null;
    registrationNumber: string | null;
    taxNumber: string | null;
    vatNumber: string | null;
    paymentTerms?: string | null;
    bankDetails?: {
      bankName?: string | null;
      accountName?: string | null;
      accountNumber?: string | null;
      branch?: string | null;
      swiftCode?: string | null;
      currency?: string | null;
    } | null;
  };
  customer: { name: string; address: string | null; registrationNumber?: string | null; taxNumber: string | null };
  invoice: {
    number: string | null; issueDate: string; dueDate: string | null; currency: string;
    taxJurisdiction?: string | null; taxDate?: string | null; taxTreatment?: string | null;
    subtotal: string; taxTotal: string; total: string; notes: string | null;
  };
  lines: Array<{
    description: string; quantity: string; unitPrice: string; taxRate: string;
    taxTreatment?: string | null; taxAmount?: string | null;
    taxRateEffectiveFrom?: string | null; taxRateEffectiveTo?: string | null;
    lineTotal: string;
  }>;
};

const { page, colour, type } = ENTERPRISE_DOCUMENT;
const contentWidth = page.width - page.margin * 2;

function date(value: string | null | undefined): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value.slice(0, 10);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${String(parsed.getUTCDate()).padStart(2, "0")} ${months[parsed.getUTCMonth()]} ${parsed.getUTCFullYear()}`;
}

function displayTreatment(value: string | null | undefined): string {
  if (value === "zero-rated") return "Zero-rated";
  if (value === "exempt") return "Exempt";
  if (value === "mixed") return "Mixed";
  return value === "standard" ? "Standard-rated" : "-";
}

function formatAmount(value: string): string {
  const match = /^(-?)(\d+)(\.\d+)?$/.exec(value.trim());
  if (!match) return value;
  return `${match[1]}${match[2].replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${match[3] ?? ""}`;
}

function nonEmpty(values: Array<string | null | undefined>): string[] {
  return values.map((value) => value?.trim()).filter((value): value is string => Boolean(value));
}

function addressLines(value: string | null | undefined, width: number, maxLines = 4): string[] {
  return wrapPdfText(value ?? "", width, type.body, maxLines).filter(Boolean);
}

function drawLabel(pageView: PdfPage, label: string, x: number, y: number, accent: PdfColour) {
  pageView.text(label.toUpperCase(), x, y, { size: type.caption, font: "bold", colour: accent });
}

function drawBox(pageView: PdfPage, x: number, y: number, width: number, height: number) {
  pageView.rect(x, y, width, height, { fill: colour.white, stroke: colour.line });
}

function drawFirstPageHeader(pageView: PdfPage, document: InvoiceSnapshotDocument, logo: ReturnType<typeof parseDocumentImage>, accent: PdfColour) {
  pageView.rect(page.margin, 812, contentWidth, 4, { fill: accent });
  pageView.text(document.issuer.companyName, page.margin, 786, { size: type.company, font: "bold", width: 350 });
  const issuerSummary = nonEmpty([
    ...addressLines(document.issuer.physicalAddress, 345, 3),
    document.issuer.registrationNumber ? `Company registration: ${document.issuer.registrationNumber}` : null,
    document.issuer.taxNumber ? `Tax number: ${document.issuer.taxNumber}` : null,
    document.issuer.vatNumber ? `VAT registration: ${document.issuer.vatNumber}` : null,
  ]).slice(0, 6);
  pageView.lines(issuerSummary, page.margin, 766, { size: type.small, colour: colour.muted, leading: 10 });
  if (logo) {
    const fitted = fitImage(logo, 112, 62);
    pageView.image(page.width - page.margin - fitted.width, 746, fitted.width, fitted.height);
  }

  pageView.text("INVOICE", page.margin, 690, { size: type.title, font: "bold" });
  pageView.text("Authoritative issued document", page.margin, 674, { size: type.small, colour: colour.muted });
  pageView.text(`VAT treatment: ${displayTreatment(document.invoice.taxTreatment)}`, page.margin, 661,
    { size: type.small, colour: colour.muted });
  if (document.invoice.taxDate) pageView.text(`Tax date: ${date(document.invoice.taxDate)}`, page.margin + 142, 661,
    { size: type.small, colour: colour.muted });

  const metaX = 286;
  const metaY = 660;
  const metaWidth = page.width - page.margin - metaX;
  drawBox(pageView, metaX, metaY, metaWidth, 61);
  const leftX = metaX + 12;
  const rightX = metaX + 150;
  drawLabel(pageView, "Invoice number", leftX, 704, accent);
  pageView.text(document.invoice.number ?? "Issued invoice", leftX, 688, { size: type.heading, font: "bold" });
  drawLabel(pageView, "Currency", rightX, 704, accent);
  pageView.text(document.invoice.currency, rightX, 688, { size: type.heading, font: "bold" });
  drawLabel(pageView, "Issue date", leftX, 675, accent);
  pageView.text(date(document.invoice.issueDate), leftX, 663, { size: type.small });
  drawLabel(pageView, "Due date", rightX, 675, accent);
  pageView.text(date(document.invoice.dueDate), rightX, 663, { size: type.small });

  const partyY = 540;
  const partyHeight = 104;
  const gap = 12;
  const partyWidth = (contentWidth - gap) / 2;
  drawBox(pageView, page.margin, partyY, partyWidth, partyHeight);
  drawBox(pageView, page.margin + partyWidth + gap, partyY, partyWidth, partyHeight);
  drawLabel(pageView, "From", page.margin + 12, partyY + partyHeight - 17, accent);
  pageView.text(document.issuer.companyName, page.margin + 12, partyY + partyHeight - 34, { size: type.heading, font: "bold" });
  const fromLines = nonEmpty([
    ...addressLines(document.issuer.physicalAddress, partyWidth - 24, 4),
    document.issuer.registrationNumber ? `Registration: ${document.issuer.registrationNumber}` : null,
    document.issuer.vatNumber ? `VAT: ${document.issuer.vatNumber}` : null,
  ]).slice(0, 6);
  pageView.lines(fromLines, page.margin + 12, partyY + partyHeight - 49, { size: type.small, colour: colour.muted, leading: 9 });

  const customerX = page.margin + partyWidth + gap;
  drawLabel(pageView, "Bill to", customerX + 12, partyY + partyHeight - 17, accent);
  pageView.text(document.customer.name, customerX + 12, partyY + partyHeight - 34, { size: type.heading, font: "bold" });
  const customerLines = nonEmpty([
    ...addressLines(document.customer.address, partyWidth - 24, 4),
    document.customer.registrationNumber ? `Registration: ${document.customer.registrationNumber}` : null,
    document.customer.taxNumber ? `Tax / BP: ${document.customer.taxNumber}` : null,
  ]).slice(0, 6);
  pageView.lines(customerLines, customerX + 12, partyY + partyHeight - 49, { size: type.small, colour: colour.muted, leading: 9 });
}

function drawContinuationHeader(pageView: PdfPage, document: InvoiceSnapshotDocument, accent: PdfColour) {
  pageView.rect(page.margin, 812, contentWidth, 4, { fill: accent });
  pageView.text(document.issuer.companyName, page.margin, 786, { size: 12, font: "bold" });
  pageView.text(`Invoice ${document.invoice.number ?? "Issued invoice"}`, page.width - page.margin - 190, 786,
    { size: type.heading, font: "bold", align: "right", width: 190 });
  pageView.text("Line items continued", page.margin, 769, { size: type.small, colour: colour.muted });
}

const tableColumns = [
  { label: "Description", x: 36, width: 220, align: "left" as const },
  { label: "Qty", x: 256, width: 46, align: "right" as const },
  { label: "Unit price", x: 302, width: 82, align: "right" as const },
  { label: "VAT", x: 384, width: 76, align: "right" as const },
  { label: "Amount", x: 460, width: 99, align: "right" as const },
];

type PreparedLine = InvoiceSnapshotDocument["lines"][number] & { descriptionLines: string[]; height: number };

function prepareLines(document: InvoiceSnapshotDocument): PreparedLine[] {
  return document.lines.map((line) => {
    const descriptionLines = wrapPdfText(line.description, tableColumns[0].width - 18, type.body, 5);
    return { ...line, descriptionLines, height: Math.max(28, descriptionLines.length * 10 + 10) };
  });
}

function drawTableHeader(pageView: PdfPage, top: number, accent: PdfColour) {
  pageView.rect(page.margin, top - 24, contentWidth, 24, { fill: accent, stroke: accent });
  for (const column of tableColumns) {
    pageView.text(column.label.toUpperCase(), column.x + (column.align === "left" ? 8 : 0), top - 16,
      { size: type.caption, font: "bold", colour: colour.white, align: column.align, width: column.width - 8 });
  }
}

function drawRows(pageView: PdfPage, document: InvoiceSnapshotDocument, rows: PreparedLine[], top: number): number {
  let y = top - 24;
  rows.forEach((line, index) => {
    const bottom = y - line.height;
    if (index % 2 === 1) pageView.rect(page.margin, bottom, contentWidth, line.height, { fill: colour.surface });
    pageView.line(page.margin, bottom, page.margin + contentWidth, bottom);
    pageView.lines(line.descriptionLines, tableColumns[0].x + 8, y - 12, { size: type.body, leading: 10 });
    pageView.text(line.quantity, tableColumns[1].x, y - 14, { size: type.body, align: "right", width: tableColumns[1].width - 8 });
    pageView.text(`${document.invoice.currency} ${formatAmount(line.unitPrice)}`, tableColumns[2].x, y - 14, { size: type.body, align: "right", width: tableColumns[2].width - 8 });
    pageView.text(`${line.taxRate}%`, tableColumns[3].x, y - 12, { size: type.body, align: "right", width: tableColumns[3].width - 8 });
    pageView.text(`${document.invoice.currency} ${formatAmount(line.taxAmount ?? "0.00")}`, tableColumns[3].x, y - 22, { size: type.caption, colour: colour.muted, align: "right", width: tableColumns[3].width - 8 });
    pageView.text(`${document.invoice.currency} ${formatAmount(line.lineTotal)}`, tableColumns[4].x, y - 14, { size: type.body, font: "bold", align: "right", width: tableColumns[4].width - 8 });
    y = bottom;
  });
  pageView.rect(page.margin, y, contentWidth, top - 24 - y, { stroke: colour.line });
  for (const column of tableColumns.slice(1)) pageView.line(column.x, top, column.x, y);
  return y;
}

function drawSummary(pageView: PdfPage, document: InvoiceSnapshotDocument, tableBottom: number, accent: PdfColour) {
  const top = Math.min(tableBottom - 14, 315);
  const boxHeight = 82;
  const bottom = top - boxHeight;
  const gap = 12;
  const totalsWidth = 214;
  const notesWidth = contentWidth - totalsWidth - gap;
  drawBox(pageView, page.margin, bottom, notesWidth, boxHeight);
  drawLabel(pageView, "Invoice notes", page.margin + 12, top - 17, accent);
  const noteText = document.invoice.notes?.trim() || "Please quote the invoice number with all correspondence.";
  pageView.lines(wrapPdfText(noteText, notesWidth - 24, type.small, 5), page.margin + 12, top - 34,
    { size: type.small, colour: colour.muted, leading: 10 });

  const totalsX = page.margin + notesWidth + gap;
  pageView.rect(totalsX, bottom, totalsWidth, boxHeight, { fill: colour.surface, stroke: colour.line });
  const totalRows = [
    ["Subtotal", document.invoice.subtotal],
    ["VAT", document.invoice.taxTotal],
    ["TOTAL", document.invoice.total],
  ];
  totalRows.forEach(([label, value], index) => {
    const y = top - 19 - index * 22;
    pageView.text(label, totalsX + 12, y, { size: index === 2 ? type.heading : type.body, font: index === 2 ? "bold" : "regular" });
    pageView.text(`${document.invoice.currency} ${formatAmount(value)}`, totalsX + 92, y,
      { size: index === 2 ? type.heading : type.body, font: "bold", align: "right", width: totalsWidth - 104 });
    if (index < 2) pageView.line(totalsX + 12, y - 8, totalsX + totalsWidth - 12, y - 8);
  });

  const paymentTop = bottom - 12;
  const paymentHeight = 88;
  const paymentBottom = paymentTop - paymentHeight;
  drawBox(pageView, page.margin, paymentBottom, contentWidth, paymentHeight);
  const half = (contentWidth - gap) / 2;
  drawLabel(pageView, "Payment details", page.margin + 12, paymentTop - 17, accent);
  const bank = document.issuer.bankDetails;
  const bankLines = nonEmpty([
    bank?.bankName,
    bank?.accountName ? `Account name: ${bank.accountName}` : null,
    bank?.accountNumber ? `Account number: ${bank.accountNumber}` : null,
    bank?.branch ? `Branch: ${bank.branch}` : null,
    bank?.swiftCode ? `SWIFT / BIC: ${bank.swiftCode}` : null,
    bank?.currency ? `Account currency: ${bank.currency}` : null,
  ]);
  const paymentLines = bankLines.length ? bankLines : [`Payment reference: ${document.invoice.number ?? "invoice number"}`];
  pageView.lines(paymentLines.slice(0, 6), page.margin + 12, paymentTop - 34,
    { size: type.small, colour: colour.muted, leading: 9 });
  const termsX = page.margin + half + gap;
  pageView.line(termsX - gap / 2, paymentBottom + 10, termsX - gap / 2, paymentTop - 10);
  drawLabel(pageView, "Payment terms", termsX, paymentTop - 17, accent);
  const terms = document.issuer.paymentTerms?.trim()
    || (document.invoice.dueDate ? `Payment due by ${date(document.invoice.dueDate)}.` : "Payment is due on receipt.");
  pageView.lines(wrapPdfText(terms, half - 12, type.small, 6), termsX, paymentTop - 34,
    { size: type.small, colour: colour.muted, leading: 9 });
}

function drawFooter(pageView: PdfPage, pageNumber: number, pageCount: number) {
  pageView.line(page.margin, 43, page.width - page.margin, 43);
  pageView.text(VAKA_DOCUMENT_FOOTER, page.margin, page.footerY, { size: type.caption, colour: colour.muted });
  pageView.text(`Page ${pageNumber} of ${pageCount}`, page.width - page.margin - 90, page.footerY,
    { size: type.caption, colour: colour.muted, align: "right", width: 90 });
}

function partitionLines(lines: PreparedLine[]): PreparedLine[][] {
  const pages: PreparedLine[][] = [];
  let index = 0;
  while (index < lines.length) {
    const tableTop = pages.length === 0 ? 535 : 750;
    const remaining = lines.slice(index);
    const remainingHeight = remaining.reduce((sum, line) => sum + line.height, 0);
    const finalCapacity = tableTop - 335;
    const normalCapacity = tableTop - 72;
    if (remainingHeight <= finalCapacity) {
      pages.push(remaining);
      break;
    }
    const nextFinalCapacity = 750 - 335;
    if (remainingHeight <= normalCapacity + nextFinalCapacity) {
      let bestSplit = 1;
      let bestScore = Number.POSITIVE_INFINITY;
      for (let split = 1; split < remaining.length; split++) {
        const leftHeight = remaining.slice(0, split).reduce((sum, line) => sum + line.height, 0);
        const rightHeight = remainingHeight - leftHeight;
        if (leftHeight > normalCapacity || rightHeight > nextFinalCapacity) continue;
        const score = Math.abs(leftHeight - rightHeight);
        if (score < bestScore) { bestSplit = split; bestScore = score; }
      }
      pages.push(remaining.slice(0, bestSplit));
      index += bestSplit;
      continue;
    }
    const pageRows: PreparedLine[] = [];
    let available = normalCapacity;
    while (index < lines.length - 1 && lines[index].height <= available) {
      pageRows.push(lines[index]);
      available -= lines[index].height;
      index++;
    }
    if (!pageRows.length) pageRows.push(lines[index++]);
    pages.push(pageRows);
  }
  return pages.length ? pages : [[]];
}

export function renderInvoicePdf(document: InvoiceSnapshotDocument): Buffer {
  const logo = parseDocumentImage(document.issuer.logoUrl);
  const accent = pdfColour(document.issuer.brandSecondaryColor ?? document.issuer.brandPrimaryColor);
  const pdf = new PdfDocument(logo);
  const linePages = partitionLines(prepareLines(document));
  linePages.forEach((rows, index) => {
    const pageView = pdf.addPage();
    const tableTop = index === 0 ? 535 : 750;
    if (index === 0) drawFirstPageHeader(pageView, document, logo, accent);
    else drawContinuationHeader(pageView, document, accent);
    drawTableHeader(pageView, tableTop, accent);
    const tableBottom = drawRows(pageView, document, rows, tableTop);
    if (index === linePages.length - 1) drawSummary(pageView, document, tableBottom, accent);
  });
  pdf.pages.forEach((pageView, index) => drawFooter(pageView, index + 1, pdf.pages.length));
  return pdf.build();
}
