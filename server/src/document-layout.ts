import { deflateSync, inflateSync } from "node:zlib";

export const ENTERPRISE_DOCUMENT = {
  page: { width: 595, height: 842, margin: 36, footerY: 27 },
  colour: {
    ink: [0.08, 0.10, 0.14] as PdfColour,
    muted: [0.34, 0.38, 0.44] as PdfColour,
    line: [0.82, 0.84, 0.87] as PdfColour,
    surface: [0.96, 0.97, 0.98] as PdfColour,
    white: [1, 1, 1] as PdfColour,
  },
  type: { title: 24, company: 18, heading: 10, body: 8.5, small: 7.5, caption: 6.8 },
} as const;

export type PdfColour = readonly [number, number, number];
export type PdfFont = "regular" | "bold";

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
  const distances = [Math.abs(estimate - left), Math.abs(estimate - up), Math.abs(estimate - upperLeft)];
  if (distances[0] <= distances[1] && distances[0] <= distances[2]) return left;
  return distances[1] <= distances[2] ? up : upperLeft;
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
      width = chunk.readUInt32BE(0); height = chunk.readUInt32BE(4);
      bitDepth = chunk[8]; colorType = chunk[9]; interlace = chunk[12];
    } else if (type === "PLTE") palette = chunk;
    else if (type === "tRNS") transparency = chunk;
    else if (type === "IDAT") idat.push(chunk);
    else if (type === "IEND") break;
    offset = chunkEnd + 4;
  }
  const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[colorType];
  if (!width || !height || bitDepth !== 8 || interlace !== 0 || !channels || !idat.length) return null;
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
    for (let i = 0; i < row.length; i++) {
      const left = i >= channels ? row[i - channels] : 0;
      const up = previous[i] ?? 0;
      const upperLeft = i >= channels ? (previous[i - channels] ?? 0) : 0;
      if (filter === 1) row[i] = (row[i] + left) & 0xff;
      else if (filter === 2) row[i] = (row[i] + up) & 0xff;
      else if (filter === 3) row[i] = (row[i] + Math.floor((left + up) / 2)) & 0xff;
      else if (filter === 4) row[i] = (row[i] + paeth(left, up, upperLeft)) & 0xff;
    }
    for (let x = 0; x < width; x++) {
      let red = 255; let green = 255; let blue = 255; let alpha = 255;
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

export function parseDocumentImage(dataUrl: string | null | undefined): PdfImage | null {
  if (!dataUrl) return null;
  const match = /^data:image\/(png|jpeg|jpg);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) return null;
  let data: Buffer;
  try { data = Buffer.from(match[2], "base64"); } catch { return null; }
  if (!data.length) return null;
  return match[1] === "png" ? decodePng(data) : decodeJpeg(data);
}

export function safePdfText(value: unknown): string {
  return String(value ?? "")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u00A0/g, " ")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[^\x09\x0A\x0D\x20-\xFF]/g, "?");
}

function escaped(value: unknown): string {
  return safePdfText(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

export function approximateTextWidth(value: string, size: number): number {
  return safePdfText(value).length * size * 0.52;
}

export function wrapPdfText(value: unknown, width: number, size: number, maxLines = 20): string[] {
  const output: string[] = [];
  for (const sourceLine of safePdfText(value).split(/\r?\n/)) {
    const words = sourceLine.trim().split(/\s+/).filter(Boolean);
    if (!words.length) { output.push(""); continue; }
    let current = "";
    for (const sourceWord of words) {
      let word = sourceWord;
      while (approximateTextWidth(word, size) > width && word.length > 1) {
        let splitAt = Math.max(1, Math.floor(width / (size * 0.52)));
        while (splitAt > 1 && approximateTextWidth(word.slice(0, splitAt), size) > width) splitAt--;
        const fragment = word.slice(0, splitAt);
        if (current) output.push(current);
        output.push(fragment);
        current = "";
        word = word.slice(splitAt);
      }
      const candidate = current ? `${current} ${word}` : word;
      if (current && approximateTextWidth(candidate, size) > width) {
        output.push(current); current = word;
      } else current = candidate;
      if (output.length >= maxLines) break;
    }
    if (current && output.length < maxLines) output.push(current);
    if (output.length >= maxLines) break;
  }
  if (output.length === maxLines && approximateTextWidth(output[maxLines - 1], size) > width - size) {
    output[maxLines - 1] = `${output[maxLines - 1].slice(0, -3)}...`;
  }
  return output.slice(0, maxLines);
}

function colourCommand(colour: PdfColour, stroke = false): string {
  return `${colour.map((value) => value.toFixed(3)).join(" ")} ${stroke ? "RG" : "rg"}`;
}

export class PdfPage {
  readonly commands: string[] = [];

  text(value: unknown, x: number, y: number, options: {
    size?: number; font?: PdfFont; colour?: PdfColour; align?: "left" | "right"; width?: number; mono?: boolean;
  } = {}) {
    const size = options.size ?? ENTERPRISE_DOCUMENT.type.body;
    const font = options.mono ? "F3" : options.font === "bold" ? "F2" : "F1";
    const text = safePdfText(value);
    const glyphWidth = options.mono ? size * 0.6 : approximateTextWidth(text, size);
    const xPosition = options.align === "right" && options.width
      ? x + options.width - (options.mono ? text.length * glyphWidth : glyphWidth) : x;
    this.commands.push(`BT /${font} ${size} Tf ${colourCommand(options.colour ?? ENTERPRISE_DOCUMENT.colour.ink)} ${xPosition.toFixed(2)} ${y.toFixed(2)} Td (${escaped(text)}) Tj ET`);
  }

  lines(values: string[], x: number, y: number, options: { size?: number; font?: PdfFont; colour?: PdfColour; leading?: number } = {}) {
    const size = options.size ?? ENTERPRISE_DOCUMENT.type.body;
    const leading = options.leading ?? size + 2.5;
    values.forEach((value, index) => this.text(value, x, y - index * leading, { ...options, size }));
  }

  rect(x: number, y: number, width: number, height: number, options: {
    fill?: PdfColour; stroke?: PdfColour; lineWidth?: number;
  } = {}) {
    const commands = ["q", `${(options.lineWidth ?? 0.7).toFixed(2)} w`];
    if (options.fill) commands.push(colourCommand(options.fill));
    if (options.stroke) commands.push(colourCommand(options.stroke, true));
    commands.push(`${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re`);
    commands.push(options.fill && options.stroke ? "B" : options.fill ? "f" : "S", "Q");
    this.commands.push(commands.join(" "));
  }

  line(x1: number, y1: number, x2: number, y2: number, colour = ENTERPRISE_DOCUMENT.colour.line, width = 0.7) {
    this.commands.push(`q ${width.toFixed(2)} w ${colourCommand(colour, true)} ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S Q`);
  }

  image(x: number, y: number, width: number, height: number) {
    this.commands.push(`q ${width.toFixed(2)} 0 0 ${height.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /Im1 Do Q`);
  }
}

export class PdfDocument {
  readonly pages: PdfPage[] = [];
  constructor(private readonly image: PdfImage | null = null) {}

  addPage(): PdfPage {
    const page = new PdfPage();
    this.pages.push(page);
    return page;
  }

  build(): Buffer {
    if (!this.pages.length) this.addPage();
    const objects: string[] = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>",
    ];
    const imageRef = this.image ? objects.length + 1 : null;
    if (this.image) {
      objects.push(`<< /Type /XObject /Subtype /Image /Width ${this.image.width} /Height ${this.image.height} /ColorSpace /${this.image.colorSpace} /BitsPerComponent 8 /Filter [ /ASCIIHexDecode /${this.image.filter === "jpeg" ? "DCTDecode" : "FlateDecode"} ] /Length ${this.image.data.length * 2 + 1} >>\nstream\n${this.image.data.toString("hex").toUpperCase()}>\nendstream`);
    }
    const pageRefs: number[] = [];
    for (const page of this.pages) {
      const pageRef = objects.length + 1;
      const contentRef = pageRef + 1;
      pageRefs.push(pageRef);
      const resources = `/Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >>${imageRef ? ` /XObject << /Im1 ${imageRef} 0 R >>` : ""}`;
      objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${ENTERPRISE_DOCUMENT.page.width} ${ENTERPRISE_DOCUMENT.page.height}] /Resources << ${resources} >> /Contents ${contentRef} 0 R >>`);
      const content = page.commands.join("\n");
      objects.push(`<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`);
    }
    objects[1] = `<< /Type /Pages /Kids [${pageRefs.map((ref) => `${ref} 0 R`).join(" ")}] /Count ${pageRefs.length} >>`;

    const chunks: Buffer[] = [];
    const offsets = [0];
    let length = 0;
    const append = (value: string) => { const chunk = Buffer.from(value, "latin1"); chunks.push(chunk); length += chunk.length; };
    append("%PDF-1.4\n%\xFF\xFF\xFF\xFF\n");
    objects.forEach((object, index) => {
      offsets.push(length);
      append(`${index + 1} 0 obj\n${object}\nendobj\n`);
    });
    const xrefOffset = length;
    append(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
    for (let index = 1; index <= objects.length; index++) append(`${String(offsets[index]).padStart(10, "0")} 00000 n \n`);
    append(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);
    return Buffer.concat(chunks);
  }
}

export function pdfColour(hex: string | null | undefined, fallback: PdfColour = [0.09, 0.20, 0.32]): PdfColour {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return fallback;
  const colour: PdfColour = [parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255];
  const luminance = colour[0] * 0.2126 + colour[1] * 0.7152 + colour[2] * 0.0722;
  return luminance > 0.82 ? fallback : colour;
}

export function fitImage(image: PdfImage, boxWidth: number, boxHeight: number) {
  const scale = Math.min(boxWidth / image.width, boxHeight / image.height);
  return { width: Math.max(1, image.width * scale), height: Math.max(1, image.height * scale) };
}
