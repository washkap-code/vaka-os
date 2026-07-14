import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { renderStatutoryReportPdf } from "./statutory-report-exports.js";
import {
  getStatutoryReportPack, type StatutoryReportPack, type StatutoryReportPeriod,
} from "./statutory-report-pack.js";
import { FINANCE_REPORT_PDF_VERSION } from "./finance-report-pdf.js";
import { renderVatReportPdf } from "./vat-return-exports.js";
import { getVatTechnicalReport, type VatReportPeriod, type VatTechnicalReport } from "./vat-return-report.js";
import {
  FINANCE_REPORT_BRANDING_VERSION, getFinanceReportBranding, type FinanceReportBranding,
} from "./report-branding.js";
import {
  assertIdempotencyFingerprint, audit, db, notFound, payloadFingerprint, schema,
} from "./lib.js";
import { InvalidDocumentError } from "./platform/documents/errors.js";

export const FINANCE_REPORT_SNAPSHOT_TYPES = ["VAT", "STATUTORY"] as const;
export type FinanceReportSnapshotType = typeof FINANCE_REPORT_SNAPSHOT_TYPES[number];
export type FinanceReportSnapshotInput =
  | { reportType: "VAT"; period: VatReportPeriod }
  | { reportType: "STATUTORY"; period: StatutoryReportPeriod };

type SnapshotRow = typeof schema.financeReportSnapshots.$inferSelect;

const checksum = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

function descriptor(row: SnapshotRow) {
  return {
    id: row.id,
    reportType: row.reportType as FinanceReportSnapshotType,
    reportVersion: row.reportVersion,
    pdfTemplateVersion: row.pdfTemplateVersion,
    brandingVersion: row.brandingVersion,
    parameters: row.parameters,
    fileName: row.fileName,
    mediaType: row.mediaType,
    byteSize: row.byteSize,
    checksum: row.checksum,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
  };
}

function renderStoredSnapshot(row: SnapshotRow): Buffer {
  if (row.mediaType !== "application/pdf" || row.pdfTemplateVersion !== FINANCE_REPORT_PDF_VERSION
    || row.brandingVersion !== FINANCE_REPORT_BRANDING_VERSION) {
    throw new InvalidDocumentError("Stored finance report snapshot version is unsupported");
  }
  const branding = row.brandingDocument as unknown as FinanceReportBranding;
  if (row.reportType === "VAT") {
    return renderVatReportPdf(row.reportDocument as unknown as VatTechnicalReport, branding);
  }
  if (row.reportType === "STATUTORY") {
    return renderStatutoryReportPdf(row.reportDocument as unknown as StatutoryReportPack, branding);
  }
  throw new InvalidDocumentError("Stored finance report snapshot type is unsupported");
}

export async function createFinanceReportSnapshot(input: FinanceReportSnapshotInput & {
  tenantId: string;
  actorUserId: string;
  idempotencyKey: string;
}) {
  const fingerprint = payloadFingerprint({ reportType: input.reportType, period: input.period });
  const [replay] = await db.select().from(schema.financeReportSnapshots).where(and(
    eq(schema.financeReportSnapshots.tenantId, input.tenantId),
    eq(schema.financeReportSnapshots.idempotencyKey, input.idempotencyKey),
  ));
  if (replay) {
    assertIdempotencyFingerprint(replay.idempotencyFingerprint, fingerprint, "finance report snapshot");
    return { ...descriptor(replay), deduplicated: true };
  }
  const [report, branding] = input.reportType === "VAT"
    ? await Promise.all([
      getVatTechnicalReport({ tenantId: input.tenantId, period: input.period }),
      getFinanceReportBranding(input.tenantId),
    ])
    : await Promise.all([
      getStatutoryReportPack({ tenantId: input.tenantId, period: input.period }),
      getFinanceReportBranding(input.tenantId),
    ]);
  const pdf = input.reportType === "VAT"
    ? renderVatReportPdf(report as VatTechnicalReport, branding)
    : renderStatutoryReportPdf(report as StatutoryReportPack, branding);
  if (!pdf.subarray(0, 5).equals(Buffer.from("%PDF-")) || pdf.byteLength > 10_000_000) {
    throw new InvalidDocumentError("Generated finance report snapshot is invalid");
  }
  const period = input.period;
  const fileName = input.reportType === "VAT"
    ? `vat-technical-preview-${period.from}-${period.to}.pdf`
    : `management-accounts-technical-preview-${period.from}-${period.to}.pdf`;
  const reportVersion = input.reportType === "VAT" ? "vat-technical-preview-v1" : (report as StatutoryReportPack).version;
  const digest = checksum(pdf);

  return db.transaction(async (tx) => {
    const [created] = await tx.insert(schema.financeReportSnapshots).values({
      tenantId: input.tenantId,
      reportType: input.reportType,
      reportVersion,
      pdfTemplateVersion: FINANCE_REPORT_PDF_VERSION,
      brandingVersion: branding.version,
      parameters: period,
      reportDocument: report as unknown as Record<string, unknown>,
      brandingDocument: branding as unknown as Record<string, unknown>,
      fileName,
      mediaType: "application/pdf",
      byteSize: pdf.byteLength,
      checksum: digest,
      idempotencyKey: input.idempotencyKey,
      idempotencyFingerprint: fingerprint,
      createdBy: input.actorUserId,
    }).onConflictDoNothing({
      target: [schema.financeReportSnapshots.tenantId, schema.financeReportSnapshots.idempotencyKey],
    }).returning();
    if (created) {
      await audit(tx, input.tenantId, input.actorUserId, "report.snapshot_created", "finance_report_snapshot", created.id, {
        reportType: created.reportType,
        reportVersion: created.reportVersion,
        pdfTemplateVersion: created.pdfTemplateVersion,
        brandingVersion: created.brandingVersion,
        parameters: created.parameters,
        byteSize: created.byteSize,
        checksum: created.checksum,
      });
      return { ...descriptor(created), deduplicated: false };
    }
    const [existing] = await tx.select().from(schema.financeReportSnapshots).where(and(
      eq(schema.financeReportSnapshots.tenantId, input.tenantId),
      eq(schema.financeReportSnapshots.idempotencyKey, input.idempotencyKey),
    ));
    if (!existing) throw new InvalidDocumentError("Finance report snapshot idempotency claim is unavailable");
    assertIdempotencyFingerprint(existing.idempotencyFingerprint, fingerprint, "finance report snapshot");
    return { ...descriptor(existing), deduplicated: true };
  });
}

export async function listFinanceReportSnapshots(tenantId: string, limit = 50) {
  const rows = await db.select().from(schema.financeReportSnapshots)
    .where(eq(schema.financeReportSnapshots.tenantId, tenantId))
    .orderBy(desc(schema.financeReportSnapshots.createdAt), desc(schema.financeReportSnapshots.id))
    .limit(Math.min(Math.max(limit, 1), 100));
  return rows.map(descriptor);
}

export async function getFinanceReportSnapshot(tenantId: string, id: string) {
  const [row] = await db.select().from(schema.financeReportSnapshots).where(and(
    eq(schema.financeReportSnapshots.id, id),
    eq(schema.financeReportSnapshots.tenantId, tenantId),
  ));
  if (!row) throw notFound("Finance report snapshot not found");
  return descriptor(row);
}

export async function loadFinanceReportSnapshotPdf(tenantId: string, id: string) {
  const [row] = await db.select().from(schema.financeReportSnapshots).where(and(
    eq(schema.financeReportSnapshots.id, id),
    eq(schema.financeReportSnapshots.tenantId, tenantId),
  ));
  if (!row) return null;
  const bytes = renderStoredSnapshot(row);
  if (bytes.byteLength !== row.byteSize || checksum(bytes) !== row.checksum) {
    throw new InvalidDocumentError("Stored finance report snapshot failed integrity verification");
  }
  return { descriptor: descriptor(row), bytes };
}
