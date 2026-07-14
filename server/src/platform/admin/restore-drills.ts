import { z } from "zod";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { badRequest, conflict, db, notFound, schema } from "../../lib.js";
import { findUnsafeEvidenceStrings } from "./backup-manifests.js";

const scenarioSchema = z.enum(["FULL_DATABASE", "POINT_IN_TIME", "DATABASE_AND_OBJECTS"]);
const outcomeSchema = z.enum(["SUCCEEDED", "PARTIAL", "FAILED"]);

export const restoreDrillInputSchema = z.object({
  drillId: z.string().trim().min(8).max(120),
  backupManifestId: z.string().uuid(),
  environment: z.string().trim().min(2).max(80),
  scenario: scenarioSchema,
  isolatedTargetRef: z.string().trim().min(6).max(160),
  startedAt: z.coerce.date(),
  completedAt: z.coerce.date(),
  targetRecoveryPointAt: z.coerce.date(),
  recoveredThroughAt: z.coerce.date(),
  targetRpoMinutes: z.number().int().min(1).max(43_200),
  targetRtoMinutes: z.number().int().min(1).max(10_080),
  outcome: outcomeSchema,
  checksumVerified: z.boolean(),
  schemaVerified: z.boolean(),
  tenantIsolationVerified: z.boolean(),
  auditContinuityVerified: z.boolean(),
  ledgerBalanceVerified: z.boolean(),
  objectRecoveryVerified: z.boolean().optional().nullable(),
  verificationSummary: z.string().trim().min(10).max(1_000),
  failureReason: z.string().trim().min(5).max(500).optional().nullable(),
  operator: z.string().trim().min(3).max(120),
}).strict().superRefine((value, ctx) => {
  const now = new Date();
  if (value.completedAt <= value.startedAt) {
    ctx.addIssue({ code: "custom", path: ["completedAt"], message: "completedAt must be after startedAt" });
  }
  for (const [key, timestamp] of [
    ["startedAt", value.startedAt],
    ["completedAt", value.completedAt],
    ["targetRecoveryPointAt", value.targetRecoveryPointAt],
    ["recoveredThroughAt", value.recoveredThroughAt],
  ] as const) {
    if (timestamp > now) ctx.addIssue({ code: "custom", path: [key], message: `${key} cannot be in the future` });
    if (timestamp > value.completedAt) {
      ctx.addIssue({ code: "custom", path: [key], message: `${key} cannot be after completedAt` });
    }
  }
  const applicableChecks = [
    value.checksumVerified,
    value.schemaVerified,
    value.tenantIsolationVerified,
    value.auditContinuityVerified,
    value.ledgerBalanceVerified,
    value.scenario !== "DATABASE_AND_OBJECTS" || value.objectRecoveryVerified === true,
  ];
  if (value.outcome === "SUCCEEDED" && applicableChecks.some((check) => !check)) {
    ctx.addIssue({ code: "custom", path: ["outcome"], message: "A succeeded drill requires every applicable integrity check" });
  }
  if (value.outcome !== "SUCCEEDED" && !value.failureReason) {
    ctx.addIssue({ code: "custom", path: ["failureReason"], message: "failureReason is required for partial or failed drills" });
  }
  for (const issue of findUnsafeEvidenceStrings(value)) {
    ctx.addIssue({ code: "custom", path: issue.path, message: issue.message });
  }
});

export const restoreDrillReviewSchema = z.object({
  decision: z.enum(["ACCEPTED", "REJECTED"]),
  reason: z.string().trim().min(10).max(500),
}).strict().superRefine((value, ctx) => {
  for (const issue of findUnsafeEvidenceStrings(value)) {
    ctx.addIssue({ code: "custom", path: issue.path, message: issue.message });
  }
});

export type RestoreDrillInput = z.infer<typeof restoreDrillInputSchema>;
export type RestoreDrillReviewInput = z.infer<typeof restoreDrillReviewSchema>;

const minutesCeil = (later: Date, earlier: Date) => Math.max(0, Math.ceil((later.getTime() - earlier.getTime()) / 60_000));

function acceptanceEligible(drill: typeof schema.platformRestoreDrills.$inferSelect): boolean {
  return drill.outcome === "SUCCEEDED"
    && drill.achievedRpoMinutes <= drill.targetRpoMinutes
    && drill.achievedRtoMinutes <= drill.targetRtoMinutes
    && drill.checksumVerified
    && drill.schemaVerified
    && drill.tenantIsolationVerified
    && drill.auditContinuityVerified
    && drill.ledgerBalanceVerified
    && (drill.scenario !== "DATABASE_AND_OBJECTS" || drill.objectRecoveryVerified === true);
}

export async function recordRestoreDrill(actorUserId: string, rawInput: unknown) {
  const input = restoreDrillInputSchema.parse(rawInput);
  const achievedRpoMinutes = minutesCeil(input.targetRecoveryPointAt, input.recoveredThroughAt);
  const achievedRtoMinutes = minutesCeil(input.completedAt, input.startedAt);
  if (achievedRtoMinutes < 1 || achievedRtoMinutes > 10_080 || achievedRpoMinutes > 525_600) {
    throw badRequest("Calculated recovery time or recovery point is outside the evidence bounds");
  }
  return db.transaction(async (tx) => {
    const [actor] = await tx.select({ id: schema.users.id }).from(schema.users).where(and(
      eq(schema.users.id, actorUserId),
      isNull(schema.users.tenantId),
      eq(schema.users.isPlatformAdmin, true),
      eq(schema.users.status, "active"),
    ));
    if (!actor) throw badRequest("An active platform operator is required");
    const [manifest] = await tx.select({
      id: schema.platformBackupManifests.id,
      manifestId: schema.platformBackupManifests.manifestId,
      environment: schema.platformBackupManifests.environment,
      status: schema.platformBackupManifests.status,
    }).from(schema.platformBackupManifests).where(eq(schema.platformBackupManifests.id, input.backupManifestId));
    if (!manifest) throw notFound("Backup manifest not found");
    if (manifest.status !== "succeeded") throw badRequest("Only a succeeded backup manifest can support restore-drill evidence");
    if (manifest.environment !== input.environment) throw badRequest("Restore drill environment must match its backup manifest");
    const [duplicate] = await tx.select({ id: schema.platformRestoreDrills.id })
      .from(schema.platformRestoreDrills).where(eq(schema.platformRestoreDrills.drillId, input.drillId));
    if (duplicate) throw conflict("Restore drill ID has already been recorded");
    const [recorded] = await tx.insert(schema.platformRestoreDrills).values({
      ...input,
      objectRecoveryVerified: input.objectRecoveryVerified ?? null,
      failureReason: input.failureReason ?? null,
      achievedRpoMinutes,
      achievedRtoMinutes,
      recordedBy: actorUserId,
    }).returning();
    await tx.insert(schema.platformAuditLogs).values({
      userId: actorUserId,
      action: "platform.restore_drill_recorded",
      metadata: {
        restoreDrillId: recorded.id,
        drillId: recorded.drillId,
        manifestId: manifest.manifestId,
        outcome: recorded.outcome,
        achievedRpoMinutes,
        achievedRtoMinutes,
      },
    });
    return { ...recorded, acceptanceEligible: acceptanceEligible(recorded) };
  });
}

export async function reviewRestoreDrill(
  actorUserId: string,
  restoreDrillId: string,
  rawInput: unknown,
) {
  const input = restoreDrillReviewSchema.parse(rawInput);
  return db.transaction(async (tx) => {
    const [reviewer] = await tx.select({ role: schema.users.platformRoleKey }).from(schema.users).where(and(
      eq(schema.users.id, actorUserId),
      isNull(schema.users.tenantId),
      eq(schema.users.isPlatformAdmin, true),
      eq(schema.users.status, "active"),
    ));
    if (reviewer?.role !== "PRINCIPAL_ADMIN") throw badRequest("Principal Administrator review is required");
    const result = await tx.execute(sql`
      SELECT id FROM platform_restore_drills WHERE id = ${restoreDrillId} FOR UPDATE
    `);
    const locked = (result as unknown as { rows: Array<{ id: string }> }).rows[0];
    if (!locked) throw notFound("Restore drill not found");
    const [drill] = await tx.select().from(schema.platformRestoreDrills)
      .where(eq(schema.platformRestoreDrills.id, restoreDrillId));
    if (!drill) throw notFound("Restore drill not found");
    if (drill.recordedBy === actorUserId) throw badRequest("The drill recorder cannot review the same evidence");
    const [existing] = await tx.select({ id: schema.platformRestoreDrillReviews.id })
      .from(schema.platformRestoreDrillReviews)
      .where(eq(schema.platformRestoreDrillReviews.restoreDrillId, drill.id));
    if (existing) throw conflict("Restore drill has already been reviewed");
    if (input.decision === "ACCEPTED" && !acceptanceEligible(drill)) {
      throw badRequest("Restore drill does not satisfy every RPO, RTO and integrity acceptance rule");
    }
    const [review] = await tx.insert(schema.platformRestoreDrillReviews).values({
      restoreDrillId: drill.id,
      decision: input.decision,
      reason: input.reason,
      reviewedBy: actorUserId,
    }).returning();
    await tx.insert(schema.platformAuditLogs).values({
      userId: actorUserId,
      action: input.decision === "ACCEPTED"
        ? "platform.restore_drill_accepted"
        : "platform.restore_drill_rejected",
      metadata: { restoreDrillId: drill.id, drillId: drill.drillId, decision: input.decision },
    });
    return review;
  });
}

export async function listRestoreDrills() {
  const rows = await db.select({
    id: schema.platformRestoreDrills.id,
    drillId: schema.platformRestoreDrills.drillId,
    backupManifestId: schema.platformRestoreDrills.backupManifestId,
    backupManifestRef: schema.platformBackupManifests.manifestId,
    environment: schema.platformRestoreDrills.environment,
    scenario: schema.platformRestoreDrills.scenario,
    isolatedTargetRef: schema.platformRestoreDrills.isolatedTargetRef,
    startedAt: schema.platformRestoreDrills.startedAt,
    completedAt: schema.platformRestoreDrills.completedAt,
    targetRecoveryPointAt: schema.platformRestoreDrills.targetRecoveryPointAt,
    recoveredThroughAt: schema.platformRestoreDrills.recoveredThroughAt,
    targetRpoMinutes: schema.platformRestoreDrills.targetRpoMinutes,
    targetRtoMinutes: schema.platformRestoreDrills.targetRtoMinutes,
    achievedRpoMinutes: schema.platformRestoreDrills.achievedRpoMinutes,
    achievedRtoMinutes: schema.platformRestoreDrills.achievedRtoMinutes,
    outcome: schema.platformRestoreDrills.outcome,
    checksumVerified: schema.platformRestoreDrills.checksumVerified,
    schemaVerified: schema.platformRestoreDrills.schemaVerified,
    tenantIsolationVerified: schema.platformRestoreDrills.tenantIsolationVerified,
    auditContinuityVerified: schema.platformRestoreDrills.auditContinuityVerified,
    ledgerBalanceVerified: schema.platformRestoreDrills.ledgerBalanceVerified,
    objectRecoveryVerified: schema.platformRestoreDrills.objectRecoveryVerified,
    verificationSummary: schema.platformRestoreDrills.verificationSummary,
    failureReason: schema.platformRestoreDrills.failureReason,
    operator: schema.platformRestoreDrills.operator,
    recordedBy: schema.platformRestoreDrills.recordedBy,
    createdAt: schema.platformRestoreDrills.createdAt,
    reviewDecision: schema.platformRestoreDrillReviews.decision,
    reviewReason: schema.platformRestoreDrillReviews.reason,
    reviewedBy: schema.platformRestoreDrillReviews.reviewedBy,
    reviewedAt: schema.platformRestoreDrillReviews.createdAt,
  }).from(schema.platformRestoreDrills)
    .innerJoin(schema.platformBackupManifests,
      eq(schema.platformBackupManifests.id, schema.platformRestoreDrills.backupManifestId))
    .leftJoin(schema.platformRestoreDrillReviews,
      eq(schema.platformRestoreDrillReviews.restoreDrillId, schema.platformRestoreDrills.id))
    .orderBy(desc(schema.platformRestoreDrills.completedAt))
    .limit(50);
  return rows.map((row) => ({
    ...row,
    acceptanceEligible: row.outcome === "SUCCEEDED"
      && row.achievedRpoMinutes <= row.targetRpoMinutes
      && row.achievedRtoMinutes <= row.targetRtoMinutes
      && row.checksumVerified && row.schemaVerified && row.tenantIsolationVerified
      && row.auditContinuityVerified && row.ledgerBalanceVerified
      && (row.scenario !== "DATABASE_AND_OBJECTS" || row.objectRecoveryVerified === true),
  }));
}
