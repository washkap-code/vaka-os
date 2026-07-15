import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { revealCaptureDataUrl, protectCaptureDataUrl } from "./capture-storage.js";
import { renderInvoicePdf, type InvoiceSnapshotDocument } from "./invoice-documents.js";
import { loadFinanceReportSnapshotPdf } from "./finance-report-snapshots.js";
import { db, schema } from "./lib.js";
import { InvalidDocumentError } from "./platform/documents/errors.js";
import type { DocumentStore } from "./platform/documents/interfaces.js";
import type {
  DocumentAccessContext, DocumentDescriptor, DocumentId, DocumentPayload,
} from "./platform/documents/types.js";

export const DOCUMENT_KINDS = {
  CAPTURE: "capture",
  INVOICE_PDF: "invoice-pdf",
  FINANCE_REPORT_PDF: "finance-report-pdf",
} as const;

type ApplicationDocumentKind = typeof DOCUMENT_KINDS[keyof typeof DOCUMENT_KINDS];
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const qualifiedId = (kind: ApplicationDocumentKind, id: string): DocumentId => `${kind}:${id}`;

export const captureDocumentId = (id: string): DocumentId => qualifiedId(DOCUMENT_KINDS.CAPTURE, id);
export const invoicePdfDocumentId = (id: string): DocumentId => qualifiedId(DOCUMENT_KINDS.INVOICE_PDF, id);
export const financeReportPdfDocumentId = (id: string): DocumentId => qualifiedId(DOCUMENT_KINDS.FINANCE_REPORT_PDF, id);

export function rawDocumentId(id: DocumentId, expectedKind: ApplicationDocumentKind): string {
  const prefix = `${expectedKind}:`;
  const rawId = id.startsWith(prefix) ? id.slice(prefix.length) : "";
  if (!uuidPattern.test(rawId)) throw new InvalidDocumentError("Document identifier is malformed");
  return rawId;
}

function parseDocumentId(id: DocumentId): { kind: ApplicationDocumentKind; rawId: string } | null {
  for (const kind of Object.values(DOCUMENT_KINDS)) {
    const prefix = `${kind}:`;
    const rawId = id.startsWith(prefix) ? id.slice(prefix.length) : "";
    if (uuidPattern.test(rawId)) return { kind, rawId };
  }
  return null;
}

const checksum = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

function assertCaptureContent(mediaType: string, bytes: Uint8Array): void {
  const data = Buffer.from(bytes);
  const allowed = mediaType === "image/png" || mediaType === "image/jpeg" || mediaType === "application/pdf";
  const validSignature = mediaType === "image/png"
    ? data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    : mediaType === "image/jpeg"
      ? data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff
      : mediaType === "application/pdf" && data.subarray(0, 5).toString("ascii") === "%PDF-";
  if (!allowed || !validSignature || data.byteLength > 1_500_000) {
    throw new InvalidDocumentError("Capture content is invalid");
  }
}

export function documentDataUrl(document: DocumentPayload): string {
  return `data:${document.descriptor.mediaType};base64,${Buffer.from(document.bytes).toString("base64")}`;
}

function captureBytes(storedValue: string, expectedMediaType: string): Buffer {
  const dataUrl = revealCaptureDataUrl(storedValue);
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match || match[1] !== expectedMediaType) throw new InvalidDocumentError("Stored capture payload is invalid");
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length) throw new InvalidDocumentError("Stored capture payload is empty");
  return bytes;
}

/** Application adapter over the existing invoice snapshot and capture stores. */
export class PostgresDocumentStore implements DocumentStore {
  async put(payload: DocumentPayload, context: DocumentAccessContext): Promise<DocumentDescriptor> {
    const parsed = parseDocumentId(payload.descriptor.id);
    if (!parsed || parsed.kind !== DOCUMENT_KINDS.CAPTURE) throw new InvalidDocumentError("Only capture documents can be stored");
    if (!context.actorUserId) throw new InvalidDocumentError("Capture writes require an authenticated actor");
    const documentType = payload.descriptor.classification;
    if (!documentType || !["INVOICE", "RECEIPT", "CONTACT", "OTHER"].includes(documentType)) {
      throw new InvalidDocumentError("Capture classification is invalid");
    }
    assertCaptureContent(payload.descriptor.mediaType, payload.bytes);
    const dataUrl = `data:${payload.descriptor.mediaType};base64,${Buffer.from(payload.bytes).toString("base64")}`;
    const [created] = await db.insert(schema.captureDocuments).values({
      id: parsed.rawId,
      tenantId: context.tenantId,
      createdBy: context.actorUserId,
      documentType,
      fileName: payload.descriptor.fileName,
      mediaType: payload.descriptor.mediaType,
      byteSize: payload.bytes.byteLength,
      dataUrl: protectCaptureDataUrl(dataUrl),
      status: "CAPTURED",
    }).returning({ createdAt: schema.captureDocuments.createdAt });
    return {
      ...payload.descriptor,
      tenantId: context.tenantId,
      byteSize: payload.bytes.byteLength,
      checksum: checksum(payload.bytes),
      createdAt: created.createdAt,
    };
  }

  async get(id: DocumentId, context: DocumentAccessContext): Promise<DocumentPayload | null> {
    const parsed = parseDocumentId(id);
    if (!parsed) return null;
    if (parsed.kind === DOCUMENT_KINDS.INVOICE_PDF) {
      const [snapshot] = await db.select().from(schema.invoiceDocumentSnapshots).where(and(
        eq(schema.invoiceDocumentSnapshots.tenantId, context.tenantId),
        eq(schema.invoiceDocumentSnapshots.invoiceId, parsed.rawId),
      ));
      if (!snapshot) return null;
      const bytes = renderInvoicePdf(snapshot.document as InvoiceSnapshotDocument);
      return {
        descriptor: {
          id,
          tenantId: context.tenantId,
          kind: DOCUMENT_KINDS.INVOICE_PDF,
          version: snapshot.templateVersion,
          fileName: `invoice-${parsed.rawId}.pdf`,
          mediaType: "application/pdf",
          byteSize: bytes.byteLength,
          checksum: checksum(bytes),
          createdAt: snapshot.createdAt,
        },
        bytes,
      };
    }
    if (parsed.kind === DOCUMENT_KINDS.FINANCE_REPORT_PDF) {
      const snapshot = await loadFinanceReportSnapshotPdf(context.tenantId, parsed.rawId);
      if (!snapshot) return null;
      return {
        descriptor: {
          id,
          tenantId: context.tenantId,
          kind: DOCUMENT_KINDS.FINANCE_REPORT_PDF,
          classification: snapshot.descriptor.reportType,
          version: snapshot.descriptor.pdfTemplateVersion,
          fileName: snapshot.descriptor.fileName,
          mediaType: snapshot.descriptor.mediaType,
          byteSize: snapshot.descriptor.byteSize,
          checksum: snapshot.descriptor.checksum,
          createdAt: snapshot.descriptor.createdAt,
        },
        bytes: snapshot.bytes,
      };
    }

    const [capture] = await db.select().from(schema.captureDocuments).where(and(
      eq(schema.captureDocuments.id, parsed.rawId),
      eq(schema.captureDocuments.tenantId, context.tenantId),
    ));
    if (!capture) return null;
    const bytes = captureBytes(capture.dataUrl, capture.mediaType);
    if (bytes.byteLength !== capture.byteSize) throw new InvalidDocumentError("Stored capture byteSize does not match payload");
    return {
      descriptor: {
        id,
        tenantId: context.tenantId,
        kind: DOCUMENT_KINDS.CAPTURE,
        classification: capture.documentType,
        fileName: capture.fileName,
        mediaType: capture.mediaType,
        byteSize: capture.byteSize,
        checksum: checksum(bytes),
        createdAt: capture.createdAt,
      },
      bytes,
    };
  }
}
