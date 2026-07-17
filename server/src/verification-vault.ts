// ============================================================================
// PV-001 — Verification evidence vault.
//
// Businesses register the documents that prove who they are: typed references
// into the PD-001 documents workspace with validity windows, derived expiry
// states and an append-only renewal chain. Rows are never edited in place:
// ACTIVE → SUPERSEDED (renewal, with pointer) or ACTIVE → WITHDRAWN
// (reasoned). Terminal rows are immutable — enforced here AND by DB CHECKs.
// The whole surface ships dark behind `verify.centre`; the API fails closed.
// Review, badges and revocation are PV-002 — nothing here asserts that a
// business "is verified".
// ============================================================================
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { audit, badRequest, conflict, db, notFound, schema } from "./lib.js";
import { VERIFICATION_EVIDENCE_TYPES } from "./db/schema.js";

const EXPIRING_SOON_DAYS = 30;

const evidenceTypeSchema = z.enum(VERIFICATION_EVIDENCE_TYPES);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

export const addEvidenceSchema = z.object({
  evidenceType: evidenceTypeSchema,
  documentId: z.string().uuid(),
  issuer: z.string().trim().min(1).max(160),
  referenceNumber: z.string().trim().max(80).optional()
    .transform((value) => value || null),
  notes: z.string().trim().max(500).optional()
    .transform((value) => value || null),
  validFrom: isoDate.optional().transform((value) => value ?? null),
  expiresAt: isoDate.optional().transform((value) => value ?? null),
}).superRefine((value, ctx) => {
  if (value.validFrom && value.expiresAt && value.expiresAt <= value.validFrom) {
    ctx.addIssue({ code: "custom", path: ["expiresAt"], message: "Expiry must be after the valid-from date" });
  }
});

export const renewEvidenceSchema = addEvidenceSchema;

export const withdrawEvidenceSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

export const evidenceStatusFilterSchema = z.enum(["ACTIVE", "SUPERSEDED", "WITHDRAWN", "ALL"]);

export type ExpiryState = "CURRENT" | "EXPIRING_SOON" | "EXPIRED" | "NO_EXPIRY";

/** Derived at read time — never stored, so it can never drift. */
export function expiryStateOf(expiresAt: string | null, today = new Date()): ExpiryState {
  if (!expiresAt) return "NO_EXPIRY";
  const todayIso = today.toISOString().slice(0, 10);
  if (expiresAt < todayIso) return "EXPIRED";
  const soon = new Date(today.getTime() + EXPIRING_SOON_DAYS * 86_400_000)
    .toISOString().slice(0, 10);
  return expiresAt <= soon ? "EXPIRING_SOON" : "CURRENT";
}

const projection = {
  id: schema.verificationEvidence.id,
  evidenceType: schema.verificationEvidence.evidenceType,
  documentId: schema.verificationEvidence.documentId,
  documentVersion: schema.verificationEvidence.documentVersion,
  issuer: schema.verificationEvidence.issuer,
  referenceNumber: schema.verificationEvidence.referenceNumber,
  notes: schema.verificationEvidence.notes,
  validFrom: schema.verificationEvidence.validFrom,
  expiresAt: schema.verificationEvidence.expiresAt,
  status: schema.verificationEvidence.status,
  supersededBy: schema.verificationEvidence.supersededBy,
  withdrawnReason: schema.verificationEvidence.withdrawnReason,
  createdAt: schema.verificationEvidence.createdAt,
  updatedAt: schema.verificationEvidence.updatedAt,
};

const withExpiry = <T extends { expiresAt: string | null; status: string }>(row: T) => ({
  ...row,
  expiryState: row.status === "ACTIVE" ? expiryStateOf(row.expiresAt) : null,
});

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------
export async function listEvidence(
  tenantId: string,
  filter: { status: z.infer<typeof evidenceStatusFilterSchema> },
) {
  const conditions = [eq(schema.verificationEvidence.tenantId, tenantId)];
  if (filter.status !== "ALL") {
    conditions.push(eq(schema.verificationEvidence.status, filter.status));
  }
  const rows = (await db.select(projection).from(schema.verificationEvidence)
    .where(and(...conditions))
    .orderBy(desc(schema.verificationEvidence.createdAt)).limit(500))
    .map(withExpiry);

  const active = rows.filter((row) => row.status === "ACTIVE");
  return {
    items: rows,
    summary: {
      active: active.length,
      expiringSoon: active.filter((row) => row.expiryState === "EXPIRING_SOON").length,
      expired: active.filter((row) => row.expiryState === "EXPIRED").length,
    },
  };
}

export async function getEvidence(tenantId: string, evidenceId: string) {
  const [row] = await db.select(projection).from(schema.verificationEvidence).where(and(
    eq(schema.verificationEvidence.id, evidenceId),
    eq(schema.verificationEvidence.tenantId, tenantId),
  ));
  if (!row) throw notFound("Evidence not found");

  // Renewal chain: who superseded this row, and which row this one replaced.
  const [successor] = row.supersededBy
    ? await db.select({ id: schema.verificationEvidence.id, createdAt: schema.verificationEvidence.createdAt })
      .from(schema.verificationEvidence).where(and(
        eq(schema.verificationEvidence.id, row.supersededBy),
        eq(schema.verificationEvidence.tenantId, tenantId),
      ))
    : [];
  const [predecessor] = await db.select({ id: schema.verificationEvidence.id, createdAt: schema.verificationEvidence.createdAt })
    .from(schema.verificationEvidence).where(and(
      eq(schema.verificationEvidence.supersededBy, evidenceId),
      eq(schema.verificationEvidence.tenantId, tenantId),
    ));

  return { ...withExpiry(row), successor: successor ?? null, predecessor: predecessor ?? null };
}

// ---------------------------------------------------------------------------
// Writes (every one audited; terminal rows immutable)
// ---------------------------------------------------------------------------
async function requireWorkspaceDocument(
  tx: Pick<typeof db, "select">, tenantId: string, documentId: string,
) {
  const [document] = await tx.select({
    id: schema.workspaceDocuments.id,
    status: schema.workspaceDocuments.status,
    currentVersion: schema.workspaceDocuments.currentVersion,
  }).from(schema.workspaceDocuments).where(and(
    eq(schema.workspaceDocuments.id, documentId),
    eq(schema.workspaceDocuments.tenantId, tenantId),
  ));
  if (!document) throw badRequest("Document not found in this workspace");
  if (document.status !== "ACTIVE") throw badRequest("Archived documents cannot back verification evidence");
  return document;
}

function rethrowSingletonConflict(error: unknown): never {
  const code = (error as { code?: string }).code
    ?? ((error as { cause?: { code?: string } }).cause?.code);
  if (code === "23505") {
    throw conflict("Active evidence of this type already exists — renew or withdraw it first");
  }
  throw error as Error;
}

export async function addEvidence(
  tenantId: string, userId: string, input: z.infer<typeof addEvidenceSchema>,
) {
  return db.transaction(async (tx) => {
    const document = await requireWorkspaceDocument(tx, tenantId, input.documentId);
    const [row] = await tx.insert(schema.verificationEvidence).values({
      tenantId,
      documentId: document.id,
      documentVersion: document.currentVersion,
      evidenceType: input.evidenceType,
      issuer: input.issuer,
      referenceNumber: input.referenceNumber,
      notes: input.notes,
      validFrom: input.validFrom,
      expiresAt: input.expiresAt,
      createdBy: userId,
    }).returning().catch(rethrowSingletonConflict);
    await audit(tx, tenantId, userId, "verification.evidence_added", "verification_evidence", row.id, {
      evidenceType: row.evidenceType,
      documentId: row.documentId,
      documentVersion: row.documentVersion,
      expiresAt: row.expiresAt,
    });
    return withExpiry({ ...row });
  });
}

async function requireActiveEvidence(
  tx: Pick<typeof db, "select">, tenantId: string, evidenceId: string,
) {
  const [row] = await tx.select().from(schema.verificationEvidence).where(and(
    eq(schema.verificationEvidence.id, evidenceId),
    eq(schema.verificationEvidence.tenantId, tenantId),
  ));
  if (!row) throw notFound("Evidence not found");
  if (row.status !== "ACTIVE") {
    throw conflict(`Evidence is ${row.status.toLowerCase()} and can no longer change`);
  }
  return row;
}

export async function renewEvidence(
  tenantId: string, userId: string, evidenceId: string,
  input: z.infer<typeof renewEvidenceSchema>,
) {
  return db.transaction(async (tx) => {
    const previous = await requireActiveEvidence(tx, tenantId, evidenceId);
    if (input.evidenceType !== previous.evidenceType) {
      throw badRequest("A renewal must keep the same evidence type");
    }
    const document = await requireWorkspaceDocument(tx, tenantId, input.documentId);

    // Old row leaves ACTIVE first so the singleton index admits the successor.
    // The DB CHECK requires superseded_by alongside SUPERSEDED, so this is a
    // two-step within one transaction: insert successor, then flip + point.
    await tx.update(schema.verificationEvidence)
      .set({ status: "WITHDRAWN", withdrawnReason: "__renewal_in_progress__", updatedAt: new Date() })
      .where(eq(schema.verificationEvidence.id, previous.id));

    const [successor] = await tx.insert(schema.verificationEvidence).values({
      tenantId,
      documentId: document.id,
      documentVersion: document.currentVersion,
      evidenceType: input.evidenceType,
      issuer: input.issuer,
      referenceNumber: input.referenceNumber,
      notes: input.notes,
      validFrom: input.validFrom,
      expiresAt: input.expiresAt,
      createdBy: userId,
    }).returning().catch(rethrowSingletonConflict);

    await tx.update(schema.verificationEvidence)
      .set({ status: "SUPERSEDED", supersededBy: successor.id, withdrawnReason: null, updatedAt: new Date() })
      .where(eq(schema.verificationEvidence.id, previous.id));

    await audit(tx, tenantId, userId, "verification.evidence_renewed", "verification_evidence", successor.id, {
      evidenceType: successor.evidenceType,
      previousEvidenceId: previous.id,
      documentId: successor.documentId,
      documentVersion: successor.documentVersion,
      expiresAt: successor.expiresAt,
    });
    return withExpiry({ ...successor });
  });
}

export async function withdrawEvidence(
  tenantId: string, userId: string, evidenceId: string, reason: string,
) {
  return db.transaction(async (tx) => {
    const row = await requireActiveEvidence(tx, tenantId, evidenceId);
    const [updated] = await tx.update(schema.verificationEvidence)
      .set({ status: "WITHDRAWN", withdrawnReason: reason, updatedAt: new Date() })
      .where(eq(schema.verificationEvidence.id, row.id)).returning();
    await audit(tx, tenantId, userId, "verification.evidence_withdrawn", "verification_evidence", row.id, {
      evidenceType: row.evidenceType, reason,
    });
    return withExpiry({ ...updated });
  });
}
