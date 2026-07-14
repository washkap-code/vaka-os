// ============================================================================
// SHARED BRANDED REPORT PDF RENDERER
//
// Turns a structured report model into the TENANT's own branded PDF, built on
// the same document engine as invoices (document-layout.ts): the tenant logo,
// primary brand colour, company name and address form the letterhead. Reports
// carry no VAKA branding — they are the customer's official documents.
//
// All financial report exporters (VAT technical preview, statutory pack, and
// future reports) render through here so branding stays consistent.
// ============================================================================
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

const { page, colour, type } = ENTERPRISE_DOCUMENT;
const contentWidth = page.width - page.margin * 2;
const BODY_BOTTOM = 58;

// ---------------------------------------------------------------------------
// Report model
// ---------------------------------------------------------------------------
/** Tenant letterhead, sourced from the tenants table (see getReportBranding). */
export type ReportBranding = {
  companyName: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
  physicalAddress?: string | null;
  registrationNumber?: string | null;
  taxNumber?: string | null;
  vatNumber?: string | null;
};

export type ReportMeta = { label: string; value: string };
export type ReportSummaryItem = { label: string; value: string; strong?: boolean };
export type ReportSectionRow =
  | { kind: "columns"; text: string }
  | { kind: "row"; text: string }
  | { kind: "note"; text: string }
  | { kind: "reference"; text: string };
export type ReportSection = { heading: string; rows: ReportSectionRow[] };

export type BrandedReport = {
  /** Short document caption shown under the letterhead, e.g. "VAT Technical Preview". */
  documentKind: string;
  notFilingReady?: boolean;
  branding: ReportBranding;
  meta: ReportMeta[];
  summary: ReportSummaryItem[];
  notices: string[];
  sections: ReportSection[];
};

function nonEmpty(values: Array<string | null | undefined>): string[] {
  return values.map((value) => value?.trim()).filter((value): value is string => Boolean(value));
}

function wrapChars(value: string, maxLength = 104): string[] {
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

// ---------------------------------------------------------------------------
// Draw-op model: paginate ops top-to-bottom, redrawing letterhead + footer.
// ---------------------------------------------------------------------------
type Op =
  | { t: "summary"; label: string; value: string; strong: boolean }
  | { t: "meta"; label: string; value: string }
  | { t: "heading"; text: string }
  | { t: "columns"; text: string }
  | { t: "row"; text: string }
  | { t: "note"; text: string }
  | { t: "reference"; text: string }
  | { t: "spacer"; h: number };

const LINE_HEIGHT: Record<Exclude<Op["t"], "spacer">, number> = {
  summary: 17,
  meta: 14,
  heading: 22,
  columns: 12,
  row: 11,
  note: 11,
  reference: 10,
};

function modelToOps(report: BrandedReport): Op[] {
  const ops: Op[] = [];
  for (const m of report.meta) ops.push({ t: "meta", label: m.label, value: m.value });
  ops.push({ t: "spacer", h: 8 });
  for (const s of report.summary) ops.push({ t: "summary", label: s.label, value: s.value, strong: Boolean(s.strong) });
  if (report.notices.length) {
    ops.push({ t: "spacer", h: 8 });
    for (const notice of report.notices) for (const line of wrapChars(notice)) ops.push({ t: "note", text: line });
  }
  for (const section of report.sections) {
    ops.push({ t: "spacer", h: 10 });
    ops.push({ t: "heading", text: section.heading });
    for (const row of section.rows) {
      if (row.kind === "note") for (const line of wrapChars(row.text)) ops.push({ t: "note", text: line });
      else ops.push({ t: row.kind === "columns" ? "columns" : row.kind === "reference" ? "reference" : "row", text: row.text });
    }
  }
  return ops;
}

function drawHeader(pageView: PdfPage, report: BrandedReport, accent: PdfColour, logo: ReturnType<typeof parseDocumentImage>, first: boolean): number {
  pageView.rect(page.margin, page.height - 30, contentWidth, 4, { fill: accent });
  if (!first) {
    pageView.text(report.branding.companyName, page.margin, page.height - 54, { size: 11, font: "bold", width: 320 });
    pageView.text(`${report.documentKind} (continued)`, page.width - page.margin - 240, page.height - 54,
      { size: type.heading, font: "bold", align: "right", width: 240, colour: colour.muted });
    return page.height - 84;
  }
  pageView.text(report.branding.companyName, page.margin, page.height - 56, { size: type.company, font: "bold", width: 360 });
  const info = nonEmpty([
    ...wrapPdfText(report.branding.physicalAddress ?? "", 345, type.small, 3),
    report.branding.registrationNumber ? `Company registration: ${report.branding.registrationNumber}` : null,
    report.branding.taxNumber ? `Tax number: ${report.branding.taxNumber}` : null,
    report.branding.vatNumber ? `VAT registration: ${report.branding.vatNumber}` : null,
  ]).slice(0, 5);
  pageView.lines(info, page.margin, page.height - 74, { size: type.small, colour: colour.muted, leading: 10 });
  if (logo) {
    const fitted = fitImage(logo, 120, 58);
    pageView.image(page.width - page.margin - fitted.width, page.height - 98, fitted.width, fitted.height);
  }
  pageView.text(report.documentKind, page.margin, page.height - 150, { size: type.title, font: "bold", colour: accent });
  if (report.notFilingReady) {
    pageView.text("Technical preview - not filing-ready", page.margin, page.height - 166, { size: type.small, colour: colour.muted });
  }
  return page.height - 190;
}

function drawFooter(pageView: PdfPage, report: BrandedReport, pageNumber: number, pageCount: number) {
  pageView.line(page.margin, 43, page.width - page.margin, 43);
  pageView.text(report.branding.companyName, page.margin, page.footerY, { size: type.caption, colour: colour.muted });
  pageView.text(`Page ${pageNumber} of ${pageCount}`, page.width - page.margin - 90, page.footerY,
    { size: type.caption, colour: colour.muted, align: "right", width: 90 });
}

function drawOp(pageView: PdfPage, op: Op, y: number, accent: PdfColour) {
  switch (op.t) {
    case "meta":
      pageView.text(op.label, page.margin, y, { size: type.caption, font: "bold", colour: accent });
      pageView.text(op.value, page.margin + 108, y, { size: type.small, colour: colour.ink });
      break;
    case "summary":
      pageView.text(op.label, page.margin, y, { size: type.small, colour: colour.muted });
      pageView.text(op.value, page.margin + 150, y, { size: op.strong ? 12 : 10, font: "bold", colour: op.strong ? accent : colour.ink, mono: true });
      break;
    case "heading":
      pageView.text(op.text, page.margin, y, { size: type.heading, font: "bold", colour: accent });
      pageView.line(page.margin, y - 4, page.margin + contentWidth, y - 4);
      break;
    case "columns":
      pageView.text(op.text, page.margin, y, { size: 7.5, font: "bold", colour: colour.muted, mono: true });
      break;
    case "row":
      pageView.text(op.text, page.margin, y, { size: 7.5, colour: colour.ink, mono: true });
      break;
    case "note":
      pageView.text(op.text, page.margin, y, { size: type.small, colour: colour.muted });
      break;
    case "reference":
      pageView.text(op.text, page.margin + 8, y, { size: 7, colour: colour.muted, mono: true });
      break;
  }
}

export function renderBrandedReportPdf(report: BrandedReport): Buffer {
  const logo = parseDocumentImage(report.branding.logoUrl);
  const accent = pdfColour(report.branding.primaryColor);
  const ops = modelToOps(report);
  const pdf = new PdfDocument(logo);
  let pageView = pdf.addPage();
  let y = drawHeader(pageView, report, accent, logo, true);
  for (const op of ops) {
    if (op.t === "spacer") { y -= op.h; continue; }
    const h = LINE_HEIGHT[op.t];
    if (y - h < BODY_BOTTOM) {
      pageView = pdf.addPage();
      y = drawHeader(pageView, report, accent, logo, false);
    }
    drawOp(pageView, op, y, accent);
    y -= h;
  }
  pdf.pages.forEach((pv, index) => drawFooter(pv, report, index + 1, pdf.pages.length));
  return pdf.build();
}
