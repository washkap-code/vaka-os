import type { MailAddress, ParsedMailAttachment, ParsedMailMessage } from "./types.js";
import { referenceIds } from "./threading.js";

const MAX_RAW_MESSAGE_BYTES = 12_000_000;
const MAX_ATTACHMENT_BYTES = 1_500_000;

function unfoldHeaders(raw: string): Map<string, string> {
  const headers = new Map<string, string>();
  const unfolded = raw.replace(/\r?\n[ \t]+/g, " ");
  for (const line of unfolded.split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator <= 0) continue;
    const name = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    headers.set(name, headers.has(name) ? `${headers.get(name)}, ${value}` : value);
  }
  return headers;
}

function decodeQuotedPrintable(value: string): Buffer {
  const joined = value.replace(/=\r?\n/g, "");
  const bytes: number[] = [];
  for (let index = 0; index < joined.length; index += 1) {
    if (joined[index] === "=" && /^[0-9a-f]{2}$/i.test(joined.slice(index + 1, index + 3))) {
      bytes.push(Number.parseInt(joined.slice(index + 1, index + 3), 16));
      index += 2;
    } else bytes.push(joined.charCodeAt(index) & 0xff);
  }
  return Buffer.from(bytes);
}

function decodeBody(value: string, encoding: string): Buffer {
  const normalised = encoding.trim().toLowerCase();
  if (normalised === "base64") return Buffer.from(value.replace(/\s/g, ""), "base64");
  if (normalised === "quoted-printable") return decodeQuotedPrintable(value);
  return Buffer.from(value, "utf8");
}

function decodeHeader(value: string): string {
  return value.replace(/=\?([^?]+)\?([bq])\?([^?]*)\?=/gi, (_match, charset: string, encoding: string, data: string) => {
    const bytes = encoding.toLowerCase() === "b"
      ? Buffer.from(data, "base64")
      : decodeQuotedPrintable(data.replace(/_/g, " "));
    return bytes.toString(charset.toLowerCase() === "us-ascii" ? "ascii" : "utf8");
  });
}

function splitAddresses(value: string): string[] {
  const parts: string[] = [];
  let quoted = false;
  let angleDepth = 0;
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === '"' && value[index - 1] !== "\\") quoted = !quoted;
    else if (!quoted && character === "<") angleDepth += 1;
    else if (!quoted && character === ">") angleDepth = Math.max(0, angleDepth - 1);
    else if (!quoted && angleDepth === 0 && character === ",") {
      parts.push(value.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(value.slice(start));
  return parts;
}

export function parseAddresses(value: string | undefined): MailAddress[] {
  if (!value) return [];
  return splitAddresses(value).flatMap((part) => {
    const trimmed = decodeHeader(part.trim());
    const angle = /^(.*?)<([^<>\s]+@[^<>\s]+)>$/.exec(trimmed);
    const address = (angle?.[2] ?? trimmed).replace(/^mailto:/i, "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return [];
    const name = angle?.[1].trim().replace(/^"|"$/g, "");
    return [{ address, ...(name ? { name } : {}) }];
  });
}

export function sanitizeMailHtml(html: string): string {
  return html
    .replace(/<(script|style|iframe|object|embed|form|meta|link)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<(script|style|iframe|object|embed|form|meta|link)\b[^>]*\/?\s*>/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s+(href|src)\s*=\s*(["'])\s*(?:javascript:|data:text\/html)[\s\S]*?\2/gi, "")
    .replace(/\s+srcdoc\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
}

function parameter(value: string, name: string): string | null {
  const pattern = new RegExp(`(?:^|;)\\s*${name}(?:\\*)?\\s*=\\s*(?:"([^"]*)"|([^;]*))`, "i");
  const match = pattern.exec(value);
  return match ? decodeHeader((match[1] ?? match[2] ?? "").trim()) : null;
}

interface MimePart {
  headers: Map<string, string>;
  body: string;
}

function splitPart(raw: string): MimePart {
  const separator = /\r?\n\r?\n/.exec(raw);
  if (!separator || separator.index === undefined) return { headers: new Map(), body: raw };
  return {
    headers: unfoldHeaders(raw.slice(0, separator.index)),
    body: raw.slice(separator.index + separator[0].length),
  };
}

function collectParts(part: MimePart, output: {
  text: string[];
  html: string[];
  attachments: ParsedMailAttachment[];
}): void {
  const contentType = part.headers.get("content-type") ?? "text/plain; charset=utf-8";
  const mediaType = contentType.split(";", 1)[0].trim().toLowerCase();
  const boundary = parameter(contentType, "boundary");
  if (mediaType.startsWith("multipart/") && boundary) {
    const delimiter = `--${boundary}`;
    for (const rawChild of part.body.split(delimiter).slice(1)) {
      const child = rawChild.replace(/^\r?\n/, "");
      if (child.startsWith("--")) break;
      collectParts(splitPart(child.replace(/\r?\n$/, "")), output);
    }
    return;
  }

  const bytes = decodeBody(part.body, part.headers.get("content-transfer-encoding") ?? "8bit");
  const disposition = part.headers.get("content-disposition") ?? "";
  const filename = parameter(disposition, "filename") ?? parameter(contentType, "name");
  if (/attachment/i.test(disposition) || filename) {
    if (!filename || bytes.length === 0 || bytes.length > MAX_ATTACHMENT_BYTES) return;
    output.attachments.push({ filename: filename.slice(0, 255), mimeType: mediaType, content: bytes });
  } else if (mediaType === "text/plain") output.text.push(bytes.toString("utf8"));
  else if (mediaType === "text/html") output.html.push(sanitizeMailHtml(bytes.toString("utf8")));
}

export function parseMimeMessage(rawBytes: Uint8Array): ParsedMailMessage {
  if (rawBytes.byteLength === 0 || rawBytes.byteLength > MAX_RAW_MESSAGE_BYTES) {
    throw new Error("Mail message size is outside supported bounds");
  }
  const raw = Buffer.from(rawBytes).toString("utf8");
  const root = splitPart(raw);
  const output = { text: [] as string[], html: [] as string[], attachments: [] as ParsedMailAttachment[] };
  collectParts(root, output);
  const dateValue = root.headers.get("date");
  const sentAt = dateValue ? new Date(dateValue) : null;
  const references = referenceIds(root.headers.get("references"));
  const inReplyTo = referenceIds(root.headers.get("in-reply-to"))[0] ?? null;
  return {
    messageId: referenceIds(root.headers.get("message-id"))[0] ?? null,
    inReplyTo,
    references,
    from: parseAddresses(root.headers.get("from")),
    to: parseAddresses(root.headers.get("to")),
    cc: parseAddresses(root.headers.get("cc")),
    subject: decodeHeader(root.headers.get("subject") ?? "").slice(0, 998),
    text: output.text.length ? output.text.join("\n").trim() || null : null,
    htmlSanitized: output.html.length ? output.html.join("\n").trim() || null : null,
    sentAt: sentAt && !Number.isNaN(sentAt.getTime()) ? sentAt : null,
    attachments: output.attachments,
  };
}
