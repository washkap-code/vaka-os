import { deflateSync, inflateSync } from "node:zlib";
import { VAKA_DOCUMENT_FOOTER } from "./document-branding.js";

export type InvoiceSnapshotDocument = {
  issuer: { companyName: string; logoUrl?: string | null; physicalAddress: string | null; registrationNumber: string | null; taxNumber: string | null; vatNumber: string | null };
  customer: { name: string; address: string | null; taxNumber: string | null };
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

function escapePdfText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)").replace(/[\r\n]/g, " ");
}

type PdfImage = {
  width: number;
  height: number;
  colorSpace: "DeviceGray" | "DeviceRGB";
  filter: "jpeg" | "flate";
  data: Buffer;
};

const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function paeth(left: number, up: number, upperLeft: number): number {
  const estimate = left + up - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= upDistance && leftDistance <= upperLeftDistance) return left;
  if (upDistance <= upperLeftDistance) return up;
  return upperLeft;
}

function decodePng(data: Buffer): PdfImage | null {
  if (!data.subarray(0, pngSignature.length).equals(pngSignature)) return null;
  let offset = pngSignature.length;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  let palette: Buffer | null = null;
  let transparency: Buffer | null = null;
  const idat: Buffer[] = [];
  while (offset + 12 <= data.length) {
    const length = data.readUInt32BE(offset);
    const type = data.subarray(offset + 4, offset + 8).toString("ascii");
    const chunkStart = offset + 8;
    const chunkEnd = chunkStart + length;
    if (chunkEnd + 4 > data.length) return null;
    const chunk = data.subarray(chunkStart, chunkEnd);
    if (type === "IHDR" && chunk.length >= 13) {
      width = chunk.readUInt32BE(0);
      height = chunk.readUInt32BE(4);
      bitDepth = chunk[8];
      colorType = chunk[9];
      interlace = chunk[12];
    } else if (type === "PLTE") palette = chunk;
    else if (type === "tRNS") transparency = chunk;
    else if (type === "IDAT") idat.push(chunk);
    else if (type === "IEND") break;
    offset = chunkEnd + 4;
  }
  const channelsByColorType: Record<number, number | undefined> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
  const channels = channelsByColorType[colorType];
  if (!width || !height || bitDepth !== 8 || interlace !== 0 || channels === undefined || !idat.length) return null;
  if (colorType === 3 && (!palette || palette.length % 3 !== 0)) return null;
  let decoded: Buffer;
  try { decoded = inflateSync(Buffer.concat(idat)); } catch { return null; }
  const rowLength = width * channels;
  if (decoded.length < height * (rowLength + 1)) return null;
  const rgb = Buffer.alloc(width * height * 3);
  let decodedOffset = 0;
  let outputOffset = 0;
  let previous = Buffer.alloc(rowLength);
  for (let y = 0; y < height; y++) {
    const filter = decoded[decodedOffset++];
    const row = Buffer.from(decoded.subarray(decodedOffset, decodedOffset + rowLength));
    decodedOffset += rowLength;
    if (row.length !== rowLength || filter > 4) return null;
    const bytesPerPixel = channels;
    for (let i = 0; i < row.length; i++) {
      const left = i >= bytesPerPixel ? row[i - bytesPerPixel] : 0;
      const up = previous[i] ?? 0;
      const upperLeft = i >= bytesPerPixel ? (previous[i - bytesPerPixel] ?? 0) : 0;
      if (filter === 1) row[i] = (row[i] + left) & 0xff;
      else if (filter === 2) row[i] = (row[i] + up) & 0xff;
      else if (filter === 3) row[i] = (row[i] + Math.floor((left + up) / 2)) & 0xff;
      else if (filter === 4) row[i] = (row[i] + paeth(left, up, upperLeft)) & 0xff;
    }
    for (let x = 0; x < width; x++) {
      let red = 255;
      let green = 255;
      let blue = 255;
      let alpha = 255;
      if (colorType === 0) {
        red = green = blue = row[x];
        if (transparency && transparency.length >= 2 && row[x] === transparency.readUInt16BE(0)) alpha = 0;
      } else if (colorType === 2) {
        red = row[x * 3]; green = row[x * 3 + 1]; blue = row[x * 3 + 2];
      } else if (colorType === 3) {
        const index = row[x];
        if (!palette || index * 3 + 2 >= palette.length) return null;
        red = palette[index * 3]; green = palette[index * 3 + 1]; blue = palette[index * 3 + 2];
        alpha = transparency?.[index] ?? 255;
      } else if (colorType === 4) {
        red = green = blue = row[x * 2]; alpha = row[x * 2 + 1];
      } else {
        red = row[x * 4]; green = row[x * 4 + 1]; blue = row[x * 4 + 2]; alpha = row[x * 4 + 3];
      }
      rgb[outputOffset++] = Math.round((red * alpha + 255 * (255 - alpha)) / 255);
      rgb[outputOffset++] = Math.round((green * alpha + 255 * (255 - alpha)) / 255);
      rgb[outputOffset++] = Math.round((blue * alpha + 255 * (255 - alpha)) / 255);
    }
    previous = row;
  }
  return { width, height, colorSpace: "DeviceRGB", filter: "flate", data: deflateSync(rgb) };
}

function decodeJpeg(data: Buffer): PdfImage | null {
  if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 4 <= data.length) {
    if (data[offset] !== 0xff) { offset++; continue; }
    while (data[offset] === 0xff) offset++;
    const marker = data[offset++];
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > data.length) return null;
    const length = data.readUInt16BE(offset);
    if (length < 2 || offset + length > data.length) return null;
    const isFrame = (marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7)
      || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf);
    if (isFrame && length >= 8) {
      const height = data.readUInt16BE(offset + 3);
      const width = data.readUInt16BE(offset + 5);
      const components = data[offset + 7];
      if (!width || !height || (components !== 1 && components !== 3)) return null;
      return { width, height, colorSpace: components === 1 ? "DeviceGray" : "DeviceRGB", filter: "jpeg", data };
    }
    offset += length;
  }
  return null;
}

function parseLogo(logoUrl: string | null | undefined): PdfImage | null {
  if (!logoUrl) return null;
  const match = /^data:image\/(png|jpeg|jpg);base64,([A-Za-z0-9+/=]+)$/.exec(logoUrl);
  if (!match) return null;
  let data: Buffer;
  try { data = Buffer.from(match[2], "base64"); } catch { return null; }
  if (!data.length) return null;
  return match[1] === "png" ? decodePng(data) : decodeJpeg(data);
}

export function renderInvoicePdf(document: InvoiceSnapshotDocument): Buffer {
  const logo = parseLogo(document.issuer.logoUrl);
  const lines: string[] = [];
  const add = (text: string, size = 10) => {
    const y = 760 - lines.length * 18;
    lines.push(`BT /F1 ${size} Tf 40 ${y} Td (${escapePdfText(text)}) Tj ET`);
  };
  add(document.issuer.companyName, 18);
  add("VAKA invoice", 11);
  add(`Invoice: ${document.invoice.number ?? "Issued invoice"}`);
  add(`Issued: ${document.invoice.issueDate.slice(0, 10)}    Due: ${document.invoice.dueDate?.slice(0, 10) ?? "—"}`);
  if (document.invoice.taxTreatment) {
    add(`VAT treatment: ${document.invoice.taxTreatment}    Jurisdiction: ${document.invoice.taxJurisdiction ?? "—"}    Tax date: ${document.invoice.taxDate ?? "—"}`, 9);
  }
  add(`Customer: ${document.customer.name}`);
  if (document.customer.address) add(document.customer.address);
  add(" ");
  add("Description                         Qty       Unit price       Total", 9);
  for (const line of document.lines) {
    add(`${line.description}    ${line.quantity}    ${document.invoice.currency} ${line.unitPrice}    ${document.invoice.currency} ${line.lineTotal}`, 9);
    if (line.taxTreatment) {
      add(`  VAT: ${line.taxTreatment} at ${line.taxRate}% = ${document.invoice.currency} ${line.taxAmount ?? "0.00"}`, 8);
    }
  }
  add(" ");
  add(`Subtotal: ${document.invoice.currency} ${document.invoice.subtotal}`);
  add(`Tax: ${document.invoice.currency} ${document.invoice.taxTotal}`);
  add(`Total: ${document.invoice.currency} ${document.invoice.total}`, 13);
  if (document.invoice.notes) add(`Notes: ${document.invoice.notes}`);
  add("Generated from the issued VAKA invoice record.", 8);
  lines.push(`BT /F1 7 Tf 40 22 Td (${escapePdfText(VAKA_DOCUMENT_FOOTER)}) Tj ET`);

  if (logo) {
    const boxWidth = 110;
    const boxHeight = 60;
    const scale = Math.min(boxWidth / logo.width, boxHeight / logo.height);
    const width = Math.max(1, Math.round(logo.width * scale));
    const height = Math.max(1, Math.round(logo.height * scale));
    const x = 612 - 40 - width;
    const y = 792 - 40 - height;
    lines.unshift(`q ${width} 0 0 ${height} ${x} ${y} cm /Im1 Do Q`);
  }
  const content = lines.join("\n");
  const imageObject = logo ? `<< /Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} /ColorSpace /${logo.colorSpace} /BitsPerComponent 8 /Filter [ /ASCIIHexDecode /${logo.filter === "jpeg" ? "DCTDecode" : "FlateDecode"} ] /Length ${logo.data.length * 2 + 1} >>\nstream\n${logo.data.toString("hex").toUpperCase()}>\nendstream` : null;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >>${logo ? " /XObject << /Im1 6 0 R >>" : ""} >> /Contents 5 0 R >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n${content}\nendstream`,
  ];
  if (imageObject) objects.push(imageObject);
  let output = "%PDF-1.4\n%\xFF\xFF\xFF\xFF\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(output, "utf8"));
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(output, "utf8");
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index++) output += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(output, "utf8");
}
