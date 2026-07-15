// ============================================================================
// PD-001 — Documents workspace: folders, versioned uploads, classification.
//
// Built on the P1-007 document service: binary content is written here as
// immutable version rows (protected at rest with the capture-storage
// envelope) and read back through the kernel DocumentService under the
// `workspace-doc` kind. Documents are never edited in place — a new upload
// is a new version. The whole surface ships dark behind the
// `documents.workspace` feature flag; the API fails closed regardless of UI.
// ============================================================================
import { createHash, randomUUID } from "node:crypto";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { audit, badRequest, conflict, db, notFound, schema } from "./lib.js";
import { protectCaptureDataUrl } from "./capture-storage.js";

export const DOCUMENT_CLASSIFICATIONS = [
  "POLICY", "CONTRACT", "CERTIFICATE", "LICENCE", "REPORT", "CORRESPONDENCE", "OTHER",
] as const;

const classificationSchema = z.enum(DOCUMENT_CLASSIFICATIONS);
const safeFileName = (value: string) => value.replace(/[^a-zA-Z0-9._ -]/g, "_");

export const folderSchema = z.object({
  name: z.string().trim().min(1).max(120),
  parentId: z.string().uuid().optional(),
});

export const createDocumentSchema = z.object({
  title: z.string().trim().min(1).max(200),
  classification: classificationSchema,
  folderId: z.string().uuid().optional(),
  fileName: z.string().trim().min(1).max(180),
  dataUrl: z.string().max(2_000_000),
});

export const addVersionSchema = z.object({
  fileName: z.string().trim().min(1).max(180),
  dataUrl: z.string().max(2_000_000),
});

/** Same envelope as mobile capture: PNG/JPEG/PDF, signature-checked, ≤1.5 MB. */
export function parseUploadDataUrl(value: string): { mediaType: string; bytes: Buffer } {
  const match = /^data:(image\/png|image\/jpeg|application\/pdf);base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match) throw badRequest("Document must be a PNG, JPEG or PDF data URL");
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > 1_500_000) throw badRequest("Document must be smaller than 1.5 MB");
  const validSignature = match[1] === "image/png"
    ? bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    : match[1] === "image/jpeg"
      ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
      : bytes.subarray(0, 5).toString("ascii") === "%PDF-";
  if (!validSignature) throw badRequest("Document file signature is invalid");
  return { mediaType: match[1], bytes };
}

const checksumOf = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");

// ---------------------------------------------------------------------------
// Folders
// ---------------------------------------------------------------------------
export async function listFolders(tenantId: string) {
  return db.select({
    id: schema.documentFolders.id,
    name: schema.documentFolders.name,
    parentId: schema.documentFolders.parentId,
    createdAt: schema.documentFolders.createdAt,
  }).from(schema.documentFolders)
    .where(eq(schema.documentFolders.tenantId, tenantId))
    .orderBy(asc(schema.documentFolders.name)).limit(500);
}

export async function createFolder(
  tenantId: string, userId: string, input: z.infer<typeof folderSchema>,
) {
  if (input.parentId) {
    const [parent] = await db.select({ id: schema.documentFolders.id })
      .from(schema.documentFolders).where(and(
        eq(schema.documentFolders.id, input.parentId),
        eq(schema.documentFolders.tenantId, tenantId),
      ));
    if (!parent) throw badRequest("Parent folder not found in this workspace");
  }
  return db.transaction(async (tx) => {
    const [folder] = await tx.insert(schema.documentFolders).values({
      tenantId, name: input.name, parentId: input.parentId ?? null, createdBy: userId,
    }).returning().catch((error: unknown) => {
      const code = (error as { code?: string }).code
        ?? ((error as { cause?: { code?: string } }).cause?.code);
      if (code === "23505") throw conflict("A folder with this name already exists here");
      throw error;
    });
    await audit(tx, tenantId, userId, "document_folder.created", "document_folder", folder.id, {
      name: folder.name, parentId: folder.parentId,
    });
    return folder;
  });
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------
export async function listDocuments(
  tenantId: string,
  filter: { folderId?: string; status: "ACTIVE" | "ARCHIVED" | "ALL" },
) {
  const conditions = [eq(schema.workspaceDocuments.tenantId, tenantId)];
  if (filter.folderId) conditions.push(eq(schema.workspaceDocuments.folderId, filter.folderId));
  if (filter.status !== "ALL") conditions.push(eq(schema.workspaceDocuments.status, filter.status));
  return db.select({
    id: schema.workspaceDocuments.id,
    folderId: schema.workspaceDocuments.folderId,
    title: schema.workspaceDocuments.title,
    classification: schema.workspaceDocuments.classification,
    status: schema.workspaceDocuments.status,
    currentVersion: schema.workspaceDocuments.currentVersion,
    createdAt: schema.workspaceDocuments.createdAt,
    updatedAt: schema.workspaceDocuments.updatedAt,
  }).from(schema.workspaceDocuments).where(and(...conditions))
    .orderBy(desc(schema.workspaceDocuments.updatedAt)).limit(200);
}

async function requireDocument(tenantId: string, documentId: string) {
  const [document] = await db.select().from(schema.workspaceDocuments).where(and(
    eq(schema.workspaceDocuments.id, documentId),
    eq(schema.workspaceDocuments.tenantId, tenantId),
  ));
  if (!document) throw notFound("Document not found");
  return document;
}

export async function getDocument(tenantId: string, documentId: string) {
  const document = await requireDocument(tenantId, documentId);
  const versions = await db.select({
    id: schema.workspaceDocumentVersions.id,
    version: schema.workspaceDocumentVersions.version,
    fileName: schema.workspaceDocumentVersions.fileName,
    mediaType: schema.workspaceDocumentVersions.mediaType,
    byteSize: schema.workspaceDocumentVersions.byteSize,
    checksum: schema.workspaceDocumentVersions.checksum,
    uploadedBy: schema.workspaceDocumentVersions.uploadedBy,
    createdAt: schema.workspaceDocumentVersions.createdAt,
  }).from(schema.workspaceDocumentVersions).where(and(
    eq(schema.workspaceDocumentVersions.documentId, documentId),
    eq(schema.workspaceDocumentVersions.tenantId, tenantId),
  )).orderBy(desc(schema.workspaceDocumentVersions.version));
  return { ...document, versions };
}

export async function createDocument(
  tenantId: string, userId: string, input: z.infer<typeof createDocumentSchema>,
) {
  if (input.folderId) {
    const [folder] = await db.select({ id: schema.documentFolders.id })
      .from(schema.documentFolders).where(and(
        eq(schema.documentFolders.id, input.folderId),
        eq(schema.documentFolders.tenantId, tenantId),
      ));
    if (!folder) throw badRequest("Folder not found in this workspace");
  }
  const parsed = parseUploadDataUrl(input.dataUrl);
  const versionId = randomUUID();
  return db.transaction(async (tx) => {
    const [document] = await tx.insert(schema.workspaceDocuments).values({
      tenantId, folderId: input.folderId ?? null, title: input.title,
      classification: input.classification, createdBy: userId,
    }).returning();
    await tx.insert(schema.workspaceDocumentVersions).values({
      id: versionId, tenantId, documentId: document.id, version: 1,
      fileName: safeFileName(input.fileName), mediaType: parsed.mediaType,
      byteSize: parsed.bytes.byteLength, checksum: checksumOf(parsed.bytes),
      dataUrl: protectCaptureDataUrl(`data:${parsed.mediaType};base64,${parsed.bytes.toString("base64")}`),
      uploadedBy: userId,
    });
    await audit(tx, tenantId, userId, "document.created", "workspace_document", document.id, {
      title: document.title, classification: document.classification,
      mediaType: parsed.mediaType, bytes: parsed.bytes.byteLength,
    });
    return { ...document, latestVersionId: versionId };
  });
}

export async function addDocumentVersion(
  tenantId: string, userId: string, documentId: string, input: z.infer<typeof addVersionSchema>,
) {
  const parsed = parseUploadDataUrl(input.dataUrl);
  const versionId = randomUUID();
  return db.transaction(async (tx) => {
    const [document] = await tx.select().from(schema.workspaceDocuments).where(and(
      eq(schema.workspaceDocuments.id, documentId),
      eq(schema.workspaceDocuments.tenantId, tenantId),
    )).for("update");
    if (!document) throw notFound("Document not found");
    if (document.status !== "ACTIVE") throw conflict("Archived documents cannot receive new versions — restore it first");
    const nextVersion = document.currentVersion + 1;
    await tx.insert(schema.workspaceDocumentVersions).values({
      id: versionId, tenantId, documentId, version: nextVersion,
      fileName: safeFileName(input.fileName), mediaType: parsed.mediaType,
      byteSize: parsed.bytes.byteLength, checksum: checksumOf(parsed.bytes),
      dataUrl: protectCaptureDataUrl(`data:${parsed.mediaType};base64,${parsed.bytes.toString("base64")}`),
      uploadedBy: userId,
    });
    const [updated] = await tx.update(schema.workspaceDocuments).set({
      currentVersion: nextVersion, updatedAt: new Date(),
    }).where(and(
      eq(schema.workspaceDocuments.id, documentId),
      eq(schema.workspaceDocuments.currentVersion, document.currentVersion),
    )).returning();
    if (!updated) throw conflict("Document was modified concurrently — reload and retry");
    await audit(tx, tenantId, userId, "document.version_added", "workspace_document", documentId, {
      version: nextVersion, mediaType: parsed.mediaType, bytes: parsed.bytes.byteLength,
    });
    return { ...updated, latestVersionId: versionId };
  });
}

export async function setDocumentStatus(
  tenantId: string, userId: string, documentId: string, status: "ACTIVE" | "ARCHIVED",
) {
  return db.transaction(async (tx) => {
    const [document] = await tx.select().from(schema.workspaceDocuments).where(and(
      eq(schema.workspaceDocuments.id, documentId),
      eq(schema.workspaceDocuments.tenantId, tenantId),
    )).for("update");
    if (!document) throw notFound("Document not found");
    if (document.status === status) throw conflict(status === "ARCHIVED"
      ? "Document is already archived" : "Document is already active");
    if (status === "ARCHIVED") assertNotUnderRetention(document); // PD-002
    const [updated] = await tx.update(schema.workspaceDocuments).set({
      status, updatedAt: new Date(),
    }).where(eq(schema.workspaceDocuments.id, documentId)).returning();
    await audit(tx, tenantId, userId,
      status === "ARCHIVED" ? "document.archived" : "document.restored",
      "workspace_document", documentId, { title: document.title });
    return updated;
  });
}

/** Resolve the version-row id serving a content read (latest by default). */
export async function resolveVersionId(
  tenantId: string, documentId: string, version?: number,
): Promise<string> {
  const document = await requireDocument(tenantId, documentId);
  const target = version ?? document.currentVersion;
  const [row] = await db.select({ id: schema.workspaceDocumentVersions.id })
    .from(schema.workspaceDocumentVersions).where(and(
      eq(schema.workspaceDocumentVersions.documentId, documentId),
      eq(schema.workspaceDocumentVersions.tenantId, tenantId),
      eq(schema.workspaceDocumentVersions.version, target),
    ));
  if (!row) throw notFound("Document version not found");
  return row.id;
}

export const documentStatusFilterSchema = z.enum(["ACTIVE", "ARCHIVED", "ALL"]);
export const versionQuerySchema = z.coerce.number().int().min(1).max(100_000).optional();

// ---------------------------------------------------------------------------
// PD-002 — approvals (second-person rule) + retention.
// ---------------------------------------------------------------------------
export const retentionSchema = z.object({
  retentionUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
});
export const approvalRequestSchema = z.object({ note: z.string().trim().max(500).optional() });
export const approvalDecisionSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  note: z.string().trim().max(500).optional(),
});

export async function setRetention(
  tenantId: string, userId: string, documentId: string, retentionUntil: string | null,
) {
  return db.transaction(async (tx) => {
    const [document] = await tx.select().from(schema.workspaceDocuments).where(and(
      eq(schema.workspaceDocuments.id, documentId),
      eq(schema.workspaceDocuments.tenantId, tenantId),
    )).for("update");
    if (!document) throw notFound("Document not found");
    const [updated] = await tx.update(schema.workspaceDocuments).set({
      retentionUntil, updatedAt: new Date(),
    }).where(eq(schema.workspaceDocuments.id, documentId)).returning();
    await audit(tx, tenantId, userId, "document.retention_set", "workspace_document",
      documentId, { retentionUntil, previous: document.retentionUntil });
    return updated;
  });
}

/** Archive guard: a document under retention cannot be archived. */
export function assertNotUnderRetention(document: { retentionUntil: string | null }) {
  if (document.retentionUntil && document.retentionUntil > new Date().toISOString().slice(0, 10)) {
    throw conflict(`Document is under retention until ${document.retentionUntil} and cannot be archived`);
  }
}

export async function requestApproval(
  tenantId: string, userId: string, documentId: string, note?: string,
) {
  return db.transaction(async (tx) => {
    const [document] = await tx.select().from(schema.workspaceDocuments).where(and(
      eq(schema.workspaceDocuments.id, documentId),
      eq(schema.workspaceDocuments.tenantId, tenantId),
    )).for("update");
    if (!document) throw notFound("Document not found");
    if (document.status !== "ACTIVE") throw conflict("Archived documents cannot be sent for approval");
    const [approval] = await tx.insert(schema.documentApprovals).values({
      tenantId, documentId, version: document.currentVersion,
      note: note ?? null, requestedBy: userId,
    }).returning().catch((error: unknown) => {
      const code = (error as { code?: string }).code
        ?? (error as { cause?: { code?: string } }).cause?.code;
      if (code === "23505") throw conflict("This document already has a pending approval");
      throw error;
    });
    await audit(tx, tenantId, userId, "document.approval_requested", "workspace_document",
      documentId, { approvalId: approval.id, version: document.currentVersion });
    return approval;
  });
}

export async function decideApproval(
  tenantId: string, userId: string, approvalId: string,
  decision: "APPROVED" | "REJECTED", note?: string,
) {
  return db.transaction(async (tx) => {
    const [approval] = await tx.select().from(schema.documentApprovals).where(and(
      eq(schema.documentApprovals.id, approvalId),
      eq(schema.documentApprovals.tenantId, tenantId),
    )).for("update");
    if (!approval) throw notFound("Approval request not found");
    if (approval.status !== "PENDING") throw conflict("Approval has already been decided");
    if (approval.requestedBy === userId) {
      throw conflict("The requester cannot decide their own approval (second-person rule)");
    }
    const [updated] = await tx.update(schema.documentApprovals).set({
      status: decision, decidedBy: userId, decisionNote: note ?? null, decidedAt: new Date(),
    }).where(eq(schema.documentApprovals.id, approvalId)).returning();
    await audit(tx, tenantId, userId,
      decision === "APPROVED" ? "document.approved" : "document.approval_rejected",
      "workspace_document", approval.documentId, { approvalId, version: approval.version });
    return updated;
  });
}

export async function listApprovals(tenantId: string, status?: "PENDING" | "APPROVED" | "REJECTED") {
  const conditions = [eq(schema.documentApprovals.tenantId, tenantId)];
  if (status) conditions.push(eq(schema.documentApprovals.status, status));
  return db.select().from(schema.documentApprovals).where(and(...conditions))
    .orderBy(desc(schema.documentApprovals.createdAt)).limit(200);
}
