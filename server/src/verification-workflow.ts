// ============================================================================
// PV-002 — Business verification workflow.
//
// Tenant submissions freeze the complete ACTIVE PV-001 evidence set (including
// the already pinned PD-001 document version). Platform staff then move the
// request through a reasoned, step-up-protected review workflow. APPROVE,
// REJECT and REVOKE decisions are append-only; VERIFIED badge issue records
// are immutable and badge state is derived from request state + expiry.
// ============================================================================
import { and, asc, desc, eq, gte, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import {
  audit, badRequest, conflict, db, notFound, schema, type DB,
} from "./lib.js";
import { APPROVAL_SERVICE, platformKernel } from "./platform-runtime.js";

const reasonSchema = z.string().trim().min(3).max(1000);
const isoDateSchema = z.string().date();

export const verificationDecisionSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  reason: reasonSchema,
  expiresAt: isoDateSchema.optional().nullable(),
});

export const verificationRevocationSchema = z.object({ reason: reasonSchema });

export const verificationQueueStatusSchema = z.enum([
  "OPEN", "ALL", "SUBMITTED", "IN_REVIEW", "APPROVED", "REJECTED", "REVOKED",
]);

export type VerificationRequestStatus =
  (typeof schema.VERIFICATION_REQUEST_STATUSES)[number];

type SoDEvaluation = {
  policy: "verification_feature_flag_actor_distinct_v1";
  detectableActors: boolean;
  checkedActorIds: string[];
  result: "PASS";
  evaluatedAt: string;
};

const approvalService = () => platformKernel().container.get(APPROVAL_SERVICE);

function uniqueIds(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort();
}

function segregationFor(actorIds: readonly string[]) {
  return actorIds.map((excludedUserId) => ({
    excludedUserId,
    message: "Segregation of duties: a platform actor who toggled this tenant's features in the request chain cannot decide its verification",
  }));
}

function sodEvaluation(actorIds: readonly string[], decidedAt: Date): SoDEvaluation {
  return {
    policy: "verification_feature_flag_actor_distinct_v1",
    detectableActors: actorIds.length > 0,
    checkedActorIds: [...actorIds],
    result: "PASS",
    evaluatedAt: decidedAt.toISOString(),
  };
}

async function platformAudit(
  tx: DB, userId: string | null, action: string, metadata: Record<string, unknown>,
) {
  await tx.insert(schema.platformAuditLogs).values({ userId, action, metadata });
}

function rethrowOpenRequestConflict(error: unknown): never {
  const code = (error as { code?: string }).code
    ?? (error as { cause?: { code?: string } }).cause?.code;
  if (code === "23505") throw conflict("This business already has an open verification request");
  throw error as Error;
}

function addTwelveMonths(value: Date): string {
  const result = new Date(Date.UTC(
    value.getUTCFullYear() + 1,
    value.getUTCMonth(),
    value.getUTCDate(),
  ));
  return result.toISOString().slice(0, 10);
}

function assertFutureExpiry(expiresAt: string, decidedAt: Date): void {
  if (expiresAt <= decidedAt.toISOString().slice(0, 10)) {
    throw badRequest("Badge expiry must be after the issue date");
  }
}

// ---------------------------------------------------------------------------
// Tenant request lifecycle and reviewer-anonymous badge read model
// ---------------------------------------------------------------------------
export async function createVerificationDraft(tenantId: string, userId: string) {
  return db.transaction(async (tx) => {
    const [tenant] = await tx.select({ id: schema.tenants.id }).from(schema.tenants)
      .where(eq(schema.tenants.id, tenantId)).for("update");
    if (!tenant) throw notFound("Tenant not found");

    const [open] = await tx.select({ id: schema.verificationRequests.id })
      .from(schema.verificationRequests).where(and(
        eq(schema.verificationRequests.tenantId, tenantId),
        inArray(schema.verificationRequests.status, ["DRAFT", "SUBMITTED", "IN_REVIEW"]),
      )).limit(1);
    if (open) throw conflict("This business already has an open verification request");

    const [request] = await tx.insert(schema.verificationRequests).values({
      tenantId, createdBy: userId,
    }).returning().catch(rethrowOpenRequestConflict);
    await audit(tx, tenantId, userId, "verification.request_drafted", "verification_request", request.id, {
      status: request.status,
    });
    return request;
  });
}

async function detectableFlagActors(
  tx: DB, tenantId: string, draftCreatedAt: Date,
): Promise<string[]> {
  const [currentFlag] = await tx.select({ actorId: schema.tenantFeatureFlags.updatedBy })
    .from(schema.tenantFeatureFlags).where(and(
      eq(schema.tenantFeatureFlags.tenantId, tenantId),
      eq(schema.tenantFeatureFlags.featureKey, "verify.centre"),
    ));
  const auditedToggles = await tx.select({ actorId: schema.auditLogs.userId })
    .from(schema.auditLogs).where(and(
      eq(schema.auditLogs.tenantId, tenantId),
      inArray(schema.auditLogs.action, ["platform.feature.enabled", "platform.feature.disabled"]),
      gte(schema.auditLogs.createdAt, draftCreatedAt),
      sql`${schema.auditLogs.metadata}->>'featureKey' IS NOT NULL`,
    ));
  return uniqueIds([currentFlag?.actorId, ...auditedToggles.map((row) => row.actorId)]);
}

export async function submitVerificationRequest(
  tenantId: string, userId: string, requestId: string,
) {
  return db.transaction(async (tx) => {
    const [request] = await tx.select().from(schema.verificationRequests).where(and(
      eq(schema.verificationRequests.id, requestId),
      eq(schema.verificationRequests.tenantId, tenantId),
    )).for("update");
    if (!request) throw notFound("Verification request not found");
    if (request.status !== "DRAFT") {
      throw conflict(`A ${request.status.toLowerCase()} request cannot be submitted`);
    }

    const evidence = await tx.select({
      evidenceId: schema.verificationEvidence.id,
      documentId: schema.verificationEvidence.documentId,
      documentVersion: schema.verificationEvidence.documentVersion,
      evidenceType: schema.verificationEvidence.evidenceType,
      issuer: schema.verificationEvidence.issuer,
      referenceNumber: schema.verificationEvidence.referenceNumber,
      validFrom: schema.verificationEvidence.validFrom,
      expiresAt: schema.verificationEvidence.expiresAt,
      fileName: schema.workspaceDocumentVersions.fileName,
      mediaType: schema.workspaceDocumentVersions.mediaType,
      byteSize: schema.workspaceDocumentVersions.byteSize,
      checksum: schema.workspaceDocumentVersions.checksum,
    }).from(schema.verificationEvidence)
      .leftJoin(schema.workspaceDocumentVersions, and(
        eq(schema.workspaceDocumentVersions.tenantId, tenantId),
        eq(schema.workspaceDocumentVersions.documentId, schema.verificationEvidence.documentId),
        eq(schema.workspaceDocumentVersions.version, schema.verificationEvidence.documentVersion),
      )).where(and(
        eq(schema.verificationEvidence.tenantId, tenantId),
        eq(schema.verificationEvidence.status, "ACTIVE"),
      )).orderBy(asc(schema.verificationEvidence.createdAt));
    if (!evidence.length) {
      throw badRequest("Add at least one active evidence item before submitting for verification");
    }
    if (evidence.some((row) => !row.fileName || !row.mediaType || !row.byteSize || !row.checksum)) {
      throw badRequest("One or more active evidence items no longer has its pinned document version");
    }

    const capturedAt = new Date();
    await tx.insert(schema.verificationRequestEvidenceSnapshots).values(evidence.map((row) => ({
      requestId: request.id,
      tenantId,
      evidenceId: row.evidenceId,
      documentId: row.documentId,
      documentVersion: row.documentVersion,
      evidenceType: row.evidenceType,
      issuer: row.issuer,
      referenceNumber: row.referenceNumber,
      validFrom: row.validFrom,
      expiresAt: row.expiresAt,
      fileName: row.fileName!,
      mediaType: row.mediaType!,
      byteSize: row.byteSize!,
      checksum: row.checksum!,
      capturedAt,
    })));

    const sodActorIds = await detectableFlagActors(tx, tenantId, request.createdAt);
    const [submitted] = await tx.update(schema.verificationRequests).set({
      status: "SUBMITTED",
      submittedBy: userId,
      submittedAt: capturedAt,
      sodActorIds,
      updatedAt: capturedAt,
    }).where(eq(schema.verificationRequests.id, request.id)).returning();
    await audit(tx, tenantId, userId, "verification.request_submitted", "verification_request", request.id, {
      status: submitted.status,
      evidenceSnapshotRef: request.id,
      evidenceCount: evidence.length,
      sodActorsDetectable: sodActorIds.length > 0,
    });
    return { ...submitted, evidenceCount: evidence.length };
  });
}

export type VerificationBadgeProjection = {
  id: string;
  level: "VERIFIED";
  issuedAt: Date;
  expiresAt: string;
  evidenceSnapshotRef: string;
  state: "ACTIVE" | "EXPIRED" | "REVOKED";
};

export async function getTenantBadgeProjection(
  tenantId: string, today = new Date(),
): Promise<VerificationBadgeProjection | null> {
  const [row] = await db.select({
    id: schema.verificationBadges.id,
    level: schema.verificationBadges.level,
    issuedAt: schema.verificationBadges.issuedAt,
    expiresAt: schema.verificationBadges.expiresAt,
    evidenceSnapshotRef: schema.verificationBadges.evidenceSnapshotRef,
    requestStatus: schema.verificationRequests.status,
  }).from(schema.verificationBadges)
    .innerJoin(schema.verificationRequests, and(
      eq(schema.verificationRequests.id, schema.verificationBadges.requestId),
      eq(schema.verificationRequests.tenantId, tenantId),
    ))
    .where(eq(schema.verificationBadges.tenantId, tenantId))
    .orderBy(desc(schema.verificationBadges.issuedAt)).limit(1);
  if (!row) return null;
  const state = row.requestStatus === "REVOKED"
    ? "REVOKED"
    : row.expiresAt < today.toISOString().slice(0, 10) ? "EXPIRED" : "ACTIVE";
  return {
    id: row.id,
    level: "VERIFIED",
    issuedAt: row.issuedAt,
    expiresAt: row.expiresAt,
    evidenceSnapshotRef: row.evidenceSnapshotRef,
    state,
  };
}

export async function getVerificationStatus(tenantId: string) {
  const [request] = await db.select({
    id: schema.verificationRequests.id,
    status: schema.verificationRequests.status,
    createdAt: schema.verificationRequests.createdAt,
    submittedAt: schema.verificationRequests.submittedAt,
    inReviewAt: schema.verificationRequests.inReviewAt,
  }).from(schema.verificationRequests)
    .where(eq(schema.verificationRequests.tenantId, tenantId))
    .orderBy(desc(schema.verificationRequests.createdAt)).limit(1);
  if (!request) return { request: null, latestDecision: null, badge: null };

  const [{ snapshotCount }] = await db.select({
    snapshotCount: sql<number>`count(*)::int`,
  }).from(schema.verificationRequestEvidenceSnapshots).where(and(
    eq(schema.verificationRequestEvidenceSnapshots.requestId, request.id),
    eq(schema.verificationRequestEvidenceSnapshots.tenantId, tenantId),
  ));
  const [latestDecision] = await db.select({
    decision: schema.verificationDecisions.decision,
    reason: schema.verificationDecisions.reason,
    decidedAt: schema.verificationDecisions.decidedAt,
  }).from(schema.verificationDecisions).where(and(
    eq(schema.verificationDecisions.requestId, request.id),
    eq(schema.verificationDecisions.tenantId, tenantId),
  )).orderBy(desc(schema.verificationDecisions.decidedAt)).limit(1);

  return {
    request: { ...request, snapshotCount },
    latestDecision: latestDecision ?? null,
    badge: await getTenantBadgeProjection(tenantId),
  };
}

// ---------------------------------------------------------------------------
// Platform review queue, exact pinned content and privileged transitions
// ---------------------------------------------------------------------------
export async function listVerificationQueue(
  actorUserId: string,
  status: z.infer<typeof verificationQueueStatusSchema>,
) {
  const conditions = [ne(schema.verificationRequests.status, "DRAFT")];
  if (status === "OPEN") {
    conditions.push(inArray(schema.verificationRequests.status, ["SUBMITTED", "IN_REVIEW"]));
  } else if (status !== "ALL") {
    conditions.push(eq(schema.verificationRequests.status, status));
  }
  const rows = await db.select({
    id: schema.verificationRequests.id,
    tenantId: schema.verificationRequests.tenantId,
    companyName: schema.tenants.companyName,
    status: schema.verificationRequests.status,
    submittedAt: schema.verificationRequests.submittedAt,
    inReviewAt: schema.verificationRequests.inReviewAt,
    createdAt: schema.verificationRequests.createdAt,
    sodActorIds: schema.verificationRequests.sodActorIds,
    evidenceCount: sql<number>`(
      SELECT count(*)::int FROM verification_request_evidence_snapshots s
      WHERE s.request_id = ${schema.verificationRequests.id}
        AND s.tenant_id = ${schema.verificationRequests.tenantId}
    )`,
  }).from(schema.verificationRequests)
    .innerJoin(schema.tenants, eq(schema.tenants.id, schema.verificationRequests.tenantId))
    .where(and(...conditions))
    .orderBy(asc(schema.verificationRequests.submittedAt), asc(schema.verificationRequests.createdAt))
    .limit(500);
  return rows.map(({ sodActorIds, ...row }) => ({
    ...row,
    sodBlockedForCurrentActor: sodActorIds.includes(actorUserId),
    sodActorsDetectable: sodActorIds.length > 0,
  }));
}

export async function getPlatformVerificationRequest(requestId: string, actorUserId: string) {
  const [request] = await db.select({
    id: schema.verificationRequests.id,
    tenantId: schema.verificationRequests.tenantId,
    companyName: schema.tenants.companyName,
    status: schema.verificationRequests.status,
    createdAt: schema.verificationRequests.createdAt,
    submittedAt: schema.verificationRequests.submittedAt,
    inReviewAt: schema.verificationRequests.inReviewAt,
    sodActorIds: schema.verificationRequests.sodActorIds,
  }).from(schema.verificationRequests)
    .innerJoin(schema.tenants, eq(schema.tenants.id, schema.verificationRequests.tenantId))
    .where(eq(schema.verificationRequests.id, requestId));
  if (!request || request.status === "DRAFT") throw notFound("Verification request not found");

  const snapshots = await db.select({
    id: schema.verificationRequestEvidenceSnapshots.id,
    evidenceId: schema.verificationRequestEvidenceSnapshots.evidenceId,
    documentId: schema.verificationRequestEvidenceSnapshots.documentId,
    documentVersion: schema.verificationRequestEvidenceSnapshots.documentVersion,
    evidenceType: schema.verificationRequestEvidenceSnapshots.evidenceType,
    issuer: schema.verificationRequestEvidenceSnapshots.issuer,
    referenceNumber: schema.verificationRequestEvidenceSnapshots.referenceNumber,
    validFrom: schema.verificationRequestEvidenceSnapshots.validFrom,
    expiresAt: schema.verificationRequestEvidenceSnapshots.expiresAt,
    fileName: schema.verificationRequestEvidenceSnapshots.fileName,
    mediaType: schema.verificationRequestEvidenceSnapshots.mediaType,
    byteSize: schema.verificationRequestEvidenceSnapshots.byteSize,
    checksum: schema.verificationRequestEvidenceSnapshots.checksum,
    capturedAt: schema.verificationRequestEvidenceSnapshots.capturedAt,
  }).from(schema.verificationRequestEvidenceSnapshots).where(and(
    eq(schema.verificationRequestEvidenceSnapshots.requestId, request.id),
    eq(schema.verificationRequestEvidenceSnapshots.tenantId, request.tenantId),
  )).orderBy(asc(schema.verificationRequestEvidenceSnapshots.capturedAt));

  const decisions = await db.select({
    id: schema.verificationDecisions.id,
    decision: schema.verificationDecisions.decision,
    reason: schema.verificationDecisions.reason,
    decidedAt: schema.verificationDecisions.decidedAt,
    reviewerId: schema.verificationDecisions.decidedBy,
    reviewerName: schema.users.fullName,
    sodEvaluation: schema.verificationDecisions.sodEvaluation,
  }).from(schema.verificationDecisions)
    .innerJoin(schema.users, eq(schema.users.id, schema.verificationDecisions.decidedBy))
    .where(and(
      eq(schema.verificationDecisions.requestId, request.id),
      eq(schema.verificationDecisions.tenantId, request.tenantId),
    )).orderBy(asc(schema.verificationDecisions.decidedAt));

  const [badge] = await db.select({
    id: schema.verificationBadges.id,
    level: schema.verificationBadges.level,
    issuedAt: schema.verificationBadges.issuedAt,
    expiresAt: schema.verificationBadges.expiresAt,
    issuedBy: schema.verificationBadges.issuedBy,
    evidenceSnapshotRef: schema.verificationBadges.evidenceSnapshotRef,
  }).from(schema.verificationBadges).where(and(
    eq(schema.verificationBadges.requestId, request.id),
    eq(schema.verificationBadges.tenantId, request.tenantId),
  ));

  const { sodActorIds, ...safeRequest } = request;
  return {
    request: {
      ...safeRequest,
      sodBlockedForCurrentActor: sodActorIds.includes(actorUserId),
      sodActorsDetectable: sodActorIds.length > 0,
    },
    snapshots,
    decisions,
    badge: badge ? {
      ...badge,
      state: request.status === "REVOKED"
        ? "REVOKED"
        : badge.expiresAt < new Date().toISOString().slice(0, 10) ? "EXPIRED" : "ACTIVE",
    } : null,
  };
}

export async function getPlatformVerificationEvidenceContent(
  requestId: string, snapshotId: string,
) {
  const [row] = await db.select({
    fileName: schema.workspaceDocumentVersions.fileName,
    mediaType: schema.workspaceDocumentVersions.mediaType,
    byteSize: schema.workspaceDocumentVersions.byteSize,
    checksum: schema.workspaceDocumentVersions.checksum,
    dataUrl: schema.workspaceDocumentVersions.dataUrl,
    capturedChecksum: schema.verificationRequestEvidenceSnapshots.checksum,
  }).from(schema.verificationRequestEvidenceSnapshots)
    .innerJoin(schema.verificationRequests, and(
      eq(schema.verificationRequests.id, schema.verificationRequestEvidenceSnapshots.requestId),
      eq(schema.verificationRequests.tenantId, schema.verificationRequestEvidenceSnapshots.tenantId),
    ))
    .innerJoin(schema.workspaceDocumentVersions, and(
      eq(schema.workspaceDocumentVersions.tenantId, schema.verificationRequestEvidenceSnapshots.tenantId),
      eq(schema.workspaceDocumentVersions.documentId, schema.verificationRequestEvidenceSnapshots.documentId),
      eq(schema.workspaceDocumentVersions.version, schema.verificationRequestEvidenceSnapshots.documentVersion),
    ))
    .where(and(
      eq(schema.verificationRequestEvidenceSnapshots.id, snapshotId),
      eq(schema.verificationRequestEvidenceSnapshots.requestId, requestId),
      ne(schema.verificationRequests.status, "DRAFT"),
    ));
  if (!row) throw notFound("Verification evidence snapshot not found");
  if (row.checksum !== row.capturedChecksum) {
    throw conflict("Pinned verification document failed its integrity check");
  }
  const { capturedChecksum: _capturedChecksum, ...content } = row;
  return content;
}

export async function startVerificationReview(requestId: string, actorUserId: string) {
  return db.transaction(async (tx) => {
    const [request] = await tx.select().from(schema.verificationRequests)
      .where(eq(schema.verificationRequests.id, requestId)).for("update");
    if (!request || request.status === "DRAFT") throw notFound("Verification request not found");
    if (request.status !== "SUBMITTED") {
      throw conflict(`A ${request.status.toLowerCase()} request cannot enter review`);
    }
    const now = new Date();
    const [updated] = await tx.update(schema.verificationRequests).set({
      status: "IN_REVIEW", inReviewBy: actorUserId, inReviewAt: now, updatedAt: now,
    }).where(eq(schema.verificationRequests.id, request.id)).returning();
    await audit(tx, request.tenantId, actorUserId,
      "verification.request_in_review", "verification_request", request.id, { status: updated.status });
    await platformAudit(tx, actorUserId, "platform.verification.review_started", {
      tenantId: request.tenantId, requestId: request.id,
    });
    return updated;
  });
}

export async function decideVerificationRequest(
  requestId: string,
  actorUserId: string,
  input: z.infer<typeof verificationDecisionSchema>,
) {
  return db.transaction(async (tx) => {
    const [request] = await tx.select().from(schema.verificationRequests)
      .where(eq(schema.verificationRequests.id, requestId)).for("update");
    if (!request || request.status === "DRAFT") throw notFound("Verification request not found");
    if (request.status !== "IN_REVIEW") {
      throw conflict(`A ${request.status.toLowerCase()} request cannot be decided`);
    }
    const outcome = approvalService().decide({
      subjectType: "verification.request",
      decision: input.decision,
      actorUserId,
      segregation: segregationFor(request.sodActorIds),
    });
    const evaluation = sodEvaluation(request.sodActorIds, outcome.decidedAt);
    const [decision] = await tx.insert(schema.verificationDecisions).values({
      requestId: request.id,
      tenantId: request.tenantId,
      decision: input.decision,
      reason: input.reason,
      decidedBy: actorUserId,
      sodEvaluation: evaluation,
      decidedAt: outcome.decidedAt,
    }).returning();

    let badge: typeof schema.verificationBadges.$inferSelect | null = null;
    if (input.decision === "APPROVE") {
      const expiresAt = input.expiresAt ?? addTwelveMonths(outcome.decidedAt);
      assertFutureExpiry(expiresAt, outcome.decidedAt);
      [badge] = await tx.insert(schema.verificationBadges).values({
        tenantId: request.tenantId,
        requestId: request.id,
        approvalDecisionId: decision.id,
        level: "VERIFIED",
        issuedAt: outcome.decidedAt,
        expiresAt,
        issuedBy: actorUserId,
        evidenceSnapshotRef: request.id,
      }).returning();
    }

    const nextStatus = outcome.status as "APPROVED" | "REJECTED";
    await tx.update(schema.verificationRequests).set({
      status: nextStatus, updatedAt: outcome.decidedAt,
    }).where(eq(schema.verificationRequests.id, request.id));
    const tenantAction = outcome.auditAction;
    await audit(tx, request.tenantId, actorUserId, tenantAction,
      "verification_request", request.id, {
        reason: input.reason,
        decisionId: decision.id,
        badgeId: badge?.id ?? null,
        expiresAt: badge?.expiresAt ?? null,
        sodEvaluation: evaluation,
      });
    await platformAudit(tx, actorUserId,
      `platform.verification.request_${input.decision === "APPROVE" ? "approved" : "rejected"}`, {
        tenantId: request.tenantId,
        requestId: request.id,
        decisionId: decision.id,
        badgeId: badge?.id ?? null,
        reason: input.reason,
        sodEvaluation: evaluation,
      });
    return { requestId: request.id, status: nextStatus, decision, badge };
  });
}

export async function revokeVerificationBadge(
  badgeId: string, actorUserId: string, reason: string,
) {
  return db.transaction(async (tx) => {
    const [badge] = await tx.select({
      id: schema.verificationBadges.id,
      tenantId: schema.verificationBadges.tenantId,
      requestId: schema.verificationBadges.requestId,
      expiresAt: schema.verificationBadges.expiresAt,
      requestStatus: schema.verificationRequests.status,
      sodActorIds: schema.verificationRequests.sodActorIds,
    }).from(schema.verificationBadges)
      .innerJoin(schema.verificationRequests, and(
        eq(schema.verificationRequests.id, schema.verificationBadges.requestId),
        eq(schema.verificationRequests.tenantId, schema.verificationBadges.tenantId),
      )).where(eq(schema.verificationBadges.id, badgeId)).for("update");
    if (!badge) throw notFound("Verification badge not found");
    if (badge.requestStatus !== "APPROVED") {
      throw conflict("This verification badge is not active and cannot be revoked again");
    }
    const outcome = approvalService().revoke({
      subjectType: "verification.badge",
      actorUserId,
      segregation: segregationFor(badge.sodActorIds),
    });
    const evaluation = sodEvaluation(badge.sodActorIds, outcome.decidedAt);
    const [decision] = await tx.insert(schema.verificationDecisions).values({
      requestId: badge.requestId,
      tenantId: badge.tenantId,
      decision: "REVOKE",
      reason,
      decidedBy: actorUserId,
      sodEvaluation: evaluation,
      decidedAt: outcome.decidedAt,
    }).returning();
    await tx.update(schema.verificationRequests).set({
      status: "REVOKED", updatedAt: outcome.decidedAt,
    }).where(eq(schema.verificationRequests.id, badge.requestId));
    await audit(tx, badge.tenantId, actorUserId, outcome.auditAction,
      "verification_badge", badge.id, {
        requestId: badge.requestId,
        decisionId: decision.id,
        reason,
        sodEvaluation: evaluation,
      });
    await platformAudit(tx, actorUserId, "platform.verification.badge_revoked", {
      tenantId: badge.tenantId,
      requestId: badge.requestId,
      badgeId: badge.id,
      decisionId: decision.id,
      reason,
      sodEvaluation: evaluation,
    });
    return {
      id: badge.id,
      level: "VERIFIED" as const,
      expiresAt: badge.expiresAt,
      evidenceSnapshotRef: badge.requestId,
      state: outcome.status,
      revokedAt: outcome.decidedAt,
    };
  });
}

