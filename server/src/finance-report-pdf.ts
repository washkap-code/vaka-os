import { VAKA_DOCUMENT_FOOTER } from "./document-branding.js";
import { parsePdfImage } from "./invoice-documents.js";
import type { FinanceReportBranding } from "./report-branding.js";

export type FinanceReportPdfLine = { text: string; emphasis?: "section" | "total" | "warning" | "table" };

function pdfText(value: string): string {
  return value.replace(/[\u2010-\u2015]/g, "-")
    .replace(/[\u2018\u2019]/g, "'").replace(/\u2026/g, "...")
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "?")
    .replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function colour(value: string): [number, number, number] {
  const match = /^#([0-9A-Fa-f]{6})$/.exec(value);
  const hex = match?.[1] ?? "14171F";
  return [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255) as [number, number, number];
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

function clipped(value: string, max = 108): string {
  const singleLine = value.replace(/[\r\n]+/g, " ").trim();
  return singleLine.length <= max ? singleLine : `${singleLine.slice(0, max - 1)}~`;
}

export function renderBrandedFinanceReportPdf(input: {
  title: string;
  subtitle: string;
  branding: FinanceReportBranding;
  pages: FinanceReportPdfLine[][];
}): Buffer {
  const logo = parsePdfImage(input.branding.logoUrl);
  const pages = input.pages.length ? input.pages : [[]];
  const primary = colour(input.branding.primaryColor);
  const accent = colour(input.branding.accentColor);
  const objects: string[] = ["<< /Type /Catalog /Pages 2 0 R >>", "",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>"];
  let imageId: number | null = null;
  if (logo) {
    imageId = 6;
    objects.push(`<< /Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} /ColorSpace /${logo.colorSpace} /BitsPerComponent 8 /Filter [ /ASCIIHexDecode /${logo.filter === "jpeg" ? "DCTDecode" : "FlateDecode"} ] /Length ${logo.data.length * 2 + 1} >>\nstream\n${logo.data.toString("hex").toUpperCase()}>\nendstream`);
  }
  const firstPageId = objects.length + 1;
  const pageIds = pages.map((_, index) => firstPageId + index * 2);
  objects[1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  const identity = [
    input.branding.physicalAddress,
    input.branding.registrationNumber ? `Registration ${input.branding.registrationNumber}` : null,
    input.branding.taxNumber ? `Tax ${input.branding.taxNumber}` : null,
    input.branding.vatNumber ? `VAT ${input.branding.vatNumber}` : null,
  ].filter(Boolean).join("  |  ");

  pages.forEach((page, pageIndex) => {
    const pageId = pageIds[pageIndex];
    const contentId = pageId + 1;
    const commands: string[] = [
      `q ${primary.join(" ")} rg 0 774 612 18 re f Q`,
      `q ${accent.join(" ")} rg 0 768 612 6 re f Q`,
      `BT /F2 17 Tf 38 738 Td (${pdfText(clipped(input.branding.companyName, 52))}) Tj ET`,
      `BT /F2 12 Tf 38 716 Td (${pdfText(input.title)}) Tj ET`,
      `BT /F1 8 Tf 38 699 Td (${pdfText(clipped(input.subtitle, 104))}) Tj ET`,
      ...(identity ? [`BT /F1 7 Tf 38 686 Td (${pdfText(clipped(identity, 118))}) Tj ET`] : []),
      `q ${primary.join(" ")} RG 0.6 w 38 678 m 574 678 l S Q`,
    ];
    if (logo && imageId) {
      const scale = Math.min(96 / logo.width, 48 / logo.height);
      const width = Math.max(1, Math.round(logo.width * scale));
      const height = Math.max(1, Math.round(logo.height * scale));
      commands.push(`q ${width} 0 0 ${height} ${574 - width} ${708} cm /Im1 Do Q`);
    }
    page.forEach((line, index) => {
      const y = 659 - index * 16;
      const font = line.emphasis === "table" ? "F3"
        : line.emphasis === "section" || line.emphasis === "total" ? "F2" : "F1";
      const size = line.emphasis === "section" ? 9 : line.emphasis === "table" ? 7 : 7.5;
      const prefix = line.emphasis === "warning" ? "NOTICE: " : "";
      commands.push(`BT /${font} ${size} Tf 38 ${y} Td (${pdfText(clipped(`${prefix}${line.text}`))}) Tj ET`);
    });
    commands.push(`q ${accent.join(" ")} RG 0.6 w 38 34 m 574 34 l S Q`);
    commands.push(`BT /F1 7 Tf 38 20 Td (${pdfText(VAKA_DOCUMENT_FOOTER)}) Tj ET`);
    commands.push(`BT /F1 7 Tf 520 20 Td (Page ${pageIndex + 1} of ${pages.length}) Tj ET`);
    const content = commands.join("\n");
    const resources = `/Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >>${imageId ? ` /XObject << /Im1 ${imageId} 0 R >>` : ""}`;
    objects[pageId - 1] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << ${resources} >> /Contents ${contentId} 0 R >>`;
    objects[contentId - 1] = `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`;
  });
  return buildPdf(objects);
}
