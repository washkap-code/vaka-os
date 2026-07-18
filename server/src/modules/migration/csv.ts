import { badRequest } from "../../lib.js";
import type { CsvEncoding, ParsedCsvDocument } from "./types.js";

export const MAX_MIGRATION_CSV_BYTES = 2_000_000;
export const MAX_MIGRATION_ROWS = 10_000;
export const MAX_MIGRATION_COLUMNS = 100;

const DELIMITERS = [",", ";", "\t", "|"] as const;

function strictBase64(value: string): Buffer {
  const compact = value.replace(/\s+/g, "");
  if (!compact || compact.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(compact)) {
    throw badRequest("CSV contentBase64 is malformed");
  }
  const bytes = Buffer.from(compact, "base64");
  if (bytes.toString("base64") !== compact) throw badRequest("CSV contentBase64 is malformed");
  return bytes;
}

function detectEncoding(bytes: Buffer): Exclude<CsvEncoding, "auto"> {
  if (bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))) return "utf8";
  if (bytes.subarray(0, 2).equals(Buffer.from([0xff, 0xfe]))) return "utf16le";
  if (bytes.subarray(0, 2).equals(Buffer.from([0xfe, 0xff]))) return "utf16be";
  const sampleLength = Math.min(bytes.length, 200);
  let evenZeros = 0;
  let oddZeros = 0;
  for (let index = 0; index < sampleLength; index += 1) {
    if (bytes[index] !== 0) continue;
    if (index % 2 === 0) evenZeros += 1;
    else oddZeros += 1;
  }
  if (oddZeros > sampleLength / 8 && evenZeros === 0) return "utf16le";
  if (evenZeros > sampleLength / 8 && oddZeros === 0) return "utf16be";
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return "utf8";
  } catch {
    return "windows1252";
  }
}

function decodeBytes(bytes: Buffer, encoding: Exclude<CsvEncoding, "auto">): string {
  if (encoding === "utf16be") {
    const start = bytes.subarray(0, 2).equals(Buffer.from([0xfe, 0xff])) ? 2 : 0;
    const source = bytes.subarray(start);
    if (source.length % 2 !== 0) throw badRequest("UTF-16BE CSV has an incomplete code unit");
    const swapped = Buffer.allocUnsafe(source.length);
    for (let index = 0; index < source.length; index += 2) {
      swapped[index] = source[index + 1];
      swapped[index + 1] = source[index];
    }
    return new TextDecoder("utf-16le", { fatal: true }).decode(swapped);
  }
  const decoderEncoding = encoding === "windows1252" ? "windows-1252" : encoding === "utf16le" ? "utf-16le" : "utf-8";
  try {
    return new TextDecoder(decoderEncoding, { fatal: encoding !== "windows1252" }).decode(bytes);
  } catch {
    throw badRequest(`CSV cannot be decoded as ${encoding}`);
  }
}

export function decodeCsvInput(input: {
  csvText?: string;
  contentBase64?: string;
  encoding?: CsvEncoding;
}): { text: string; encoding: Exclude<CsvEncoding, "auto"> } {
  if ((input.csvText === undefined) === (input.contentBase64 === undefined)) {
    throw badRequest("Provide exactly one of csvText or contentBase64");
  }
  if (input.csvText !== undefined) {
    if (Buffer.byteLength(input.csvText, "utf8") > MAX_MIGRATION_CSV_BYTES) {
      throw badRequest("CSV exceeds the 2 MB limit");
    }
    return { text: input.csvText.replace(/^\uFEFF/, ""), encoding: "utf8" };
  }
  const bytes = strictBase64(input.contentBase64!);
  if (bytes.length > MAX_MIGRATION_CSV_BYTES) throw badRequest("CSV exceeds the 2 MB limit");
  const encoding = input.encoding && input.encoding !== "auto" ? input.encoding : detectEncoding(bytes);
  return { text: decodeBytes(bytes, encoding).replace(/^\uFEFF/, ""), encoding };
}

function delimiterCounts(text: string, delimiter: string): number[] {
  const counts: number[] = [];
  let quoted = false;
  let count = 0;
  for (let index = 0; index < text.length && counts.length < 12; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') index += 1;
      else quoted = !quoted;
    } else if (!quoted && char === delimiter) {
      count += 1;
    } else if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      if (count > 0 || counts.length > 0) counts.push(count);
      count = 0;
    }
  }
  if (count > 0) counts.push(count);
  return counts;
}

export function detectDelimiter(text: string): string {
  let best: { delimiter: string; score: number } = { delimiter: ",", score: -1 };
  for (const delimiter of DELIMITERS) {
    const counts = delimiterCounts(text, delimiter).filter((count) => count > 0);
    if (!counts.length) continue;
    const common = new Map<number, number>();
    for (const count of counts) common.set(count, (common.get(count) ?? 0) + 1);
    const [width, frequency] = [...common.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
    const score = frequency * 1_000 + width * 10 - (counts.length - frequency);
    if (score > best.score) best = { delimiter, score };
  }
  return best.delimiter;
}

function parseCells(text: string, delimiter: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let cell = "";
  let quoted = false;
  let quoteClosed = false;

  const finishRecord = () => {
    record.push(cell);
    if (record.some((value) => value.trim().length > 0)) records.push(record);
    record = [];
    cell = "";
    quoteClosed = false;
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
        quoteClosed = true;
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      if (cell.length || quoteClosed) throw badRequest("Malformed CSV quote");
      quoted = true;
    } else if (char === delimiter) {
      record.push(cell);
      cell = "";
      quoteClosed = false;
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      finishRecord();
    } else if (quoteClosed) {
      if (!/\s/.test(char)) throw badRequest("Malformed CSV content after closing quote");
    } else {
      cell += char;
    }
  }
  if (quoted) throw badRequest("CSV contains an unclosed quoted value");
  if (record.length || cell.length) finishRecord();
  return records;
}

export function parseCsvDocument(text: string): ParsedCsvDocument {
  if (!text.trim()) throw badRequest("CSV is empty");
  if (Buffer.byteLength(text, "utf8") > MAX_MIGRATION_CSV_BYTES) throw badRequest("CSV exceeds the 2 MB limit");
  const delimiter = detectDelimiter(text);
  const records = parseCells(text, delimiter);
  if (records.length < 2) throw badRequest("CSV must contain a header and at least one data row");
  if (records.length - 1 > MAX_MIGRATION_ROWS) {
    throw badRequest(`CSV exceeds the ${MAX_MIGRATION_ROWS.toLocaleString("en")} row limit`);
  }
  const headers = records[0].map((header) => header.trim());
  if (headers.length > MAX_MIGRATION_COLUMNS) throw badRequest(`CSV exceeds the ${MAX_MIGRATION_COLUMNS} column limit`);
  if (headers.some((header) => !header)) throw badRequest("CSV headers must not be blank");
  const normalised = headers.map((header) => header.toLocaleLowerCase("en"));
  if (new Set(normalised).size !== normalised.length) throw badRequest("CSV headers must be unique");
  const rows = records.slice(1).map((cells, index) => {
    const rowNumber = index + 2;
    if (cells.length !== headers.length) {
      throw badRequest(`CSV row ${rowNumber} has ${cells.length} columns; expected ${headers.length}`);
    }
    return { rowNumber, raw: Object.fromEntries(headers.map((header, position) => [header, cells[position]])) };
  });
  return { headers, rows, delimiter };
}
