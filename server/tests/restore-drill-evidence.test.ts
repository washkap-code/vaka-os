import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { and, eq } from "drizzle-orm";
import { createApp } from "../src/app.js";
import { issueAuthenticatedSession, signupTenant } from "../src/auth.js";
import { db, schema } from "../src/lib.js";
import {
  recordRestoreDrill, reviewRestoreDrill,
} from "../src/platform/admin/restore-drills.js";

const app = createApp();
const unique = () => `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

let principalId = "";
let principalToken = "";
let operatorId = "";
let operatorToken = "";
let tenantToken = "";

beforeAll(async () => {
  const [principal] = await db.select().from(schema.users)
    .where(eq(schema.users.platformRoleKey, "PRINCIPAL_ADMIN"));
  if (!principal) throw new Error("Seeded principal administrator is required");
  principalId = principal.id;
  await db.update(schema.users).set({ status: "active", mustChangePassword: false })
    .where(eq(schema.users.id, principal.id));
  principalToken = (await issueAuthenticatedSession(principal.id)).token;

  const suffix = unique();
  const [operator] = await db.insert(schema.users).values({
    tenantId: null,
    email: `restore-operator-${suffix}@test.zw`,
    passwordHash: "not-used-by-restore-evidence-test",
    fullName: "Restore Drill Operator",
    isPlatformAdmin: true,
    platformRoleKey: "OPERATIONS_ADMIN",
    status: "active",
  }).returning();
  operatorId = operator.id;
  operatorToken = (await issueAuthenticatedSession(operator.id)).token;

  const tenant = await signupTenant({
    companyName: "Restore Route Boundary",
    subdomain: `restoreboundary${suffix}`.slice(0, 31),
    baseCurrency: "USD",
    ownerEmail: `restore-tenant-${suffix}@test.zw`,
    ownerPassword: "Restore-Tenant-Test-2026!",
    ownerName: "Tenant Owner",
    planName: "Starter",
  });
  tenantToken = (await issueAuthenticatedSession(tenant.owner.id)).token;
});

async function manifest(environment = "staging", status = "succeeded") {
  const id = unique();
  const completedAt = new Date(Date.now() - 2 * 60 * 60_000);
  const [row] = await db.insert(schema.platformBackupManifests).values({
    manifestId: `backup-restore-${id}`,
    contractVersion: "2026-07-12.ops-012",
    environment,
    startedAt: new Date(completedAt.getTime() - 5 * 60_000),
    completedAt,
    status,
    databaseSnapshotRef: `db-snapshot-${id}`,
    checksum: `sha256:${"a".repeat(64)}`,
    encryptionRef: `kms-policy-${id}`,
    retentionExpiresAt: new Date(Date.now() + 30 * 86_400_000),
    operator: "backup-test-service",
    failureReason: status === "succeeded" ? null : "Controlled failed backup evidence",
    recordedBy: operatorId,
  }).returning();
  return row;
}

function payload(backupManifestId: string, overrides: Record<string, unknown> = {}) {
  const now = Date.now();
  return {
    drillId: `restore-drill-${unique()}`,
    backupManifestId,
    environment: "staging",
    scenario: "FULL_DATABASE",
    isolatedTargetRef: `isolated-restore-${unique()}`,
    startedAt: new Date(now - 60 * 60_000).toISOString(),
    completedAt: new Date(now - 10 * 60_000).toISOString(),
    targetRecoveryPointAt: new Date(now - 70 * 60_000).toISOString(),
    recoveredThroughAt: new Date(now - 75 * 60_000).toISOString(),
    targetRpoMinutes: 15,
    targetRtoMinutes: 60,
    outcome: "SUCCEEDED",
    checksumVerified: true,
    schemaVerified: true,
    tenantIsolationVerified: true,
    auditContinuityVerified: true,
    ledgerBalanceVerified: true,
    objectRecoveryVerified: null,
    verificationSummary: "Controlled restore checks completed with synthetic verification probes.",
    failureReason: null,
    operator: "Platform Recovery Team",
    ...overrides,
  };
}

describe("OPS-016 restore drill evidence", () => {
  it("records, calculates, segregates and accepts complete evidence", async () => {
    const source = await manifest();
    const input = payload(source.id);
    const recorded = await request(app).post("/api/v1/platform/restore-drills")
      .set(auth(operatorToken)).send(input);
    expect(recorded.status).toBe(200);
    expect(recorded.body).toMatchObject({
      achievedRpoMinutes: 5,
      achievedRtoMinutes: 50,
      acceptanceEligible: true,
    });

    const listed = await request(app).get("/api/v1/platform/restore-drills")
      .set(auth(operatorToken));
    expect(listed.status).toBe(200);
    expect(listed.body.some((row: { id: string }) => row.id === recorded.body.id)).toBe(true);
    expect((await request(app).get("/api/v1/platform/restore-drills").set(auth(tenantToken))).status).toBe(403);
    expect((await request(app).post(`/api/v1/platform/restore-drills/${recorded.body.id}/review`)
      .set(auth(operatorToken)).send({ decision: "ACCEPTED", reason: "Operator cannot approve their own evidence." })).status).toBe(403);

    const accepted = await request(app).post(`/api/v1/platform/restore-drills/${recorded.body.id}/review`)
      .set(auth(principalToken)).send({
        decision: "ACCEPTED",
        reason: "Independent review confirms every recorded recovery control passed.",
      });
    expect(accepted.status).toBe(200);
    expect(accepted.body.decision).toBe("ACCEPTED");
    const duplicate = await request(app).post(`/api/v1/platform/restore-drills/${recorded.body.id}/review`)
      .set(auth(principalToken)).send({ decision: "REJECTED", reason: "A second decision must never replace evidence." });
    expect(duplicate.status).toBe(409);

    const controlCenter = await request(app).get("/api/v1/platform/control-center").set(auth(principalToken));
    expect(controlCenter.status).toBe(200);
    const gate = controlCenter.body.operationsEvidence.gates.find((entry: { id: string }) => entry.id === "ops.restore-test");
    expect(gate.state).toBe("recorded");
    expect(controlCenter.body.signals.acceptedRestoreDrills).toBeGreaterThanOrEqual(1);

    const audit = await db.select().from(schema.platformAuditLogs).where(and(
      eq(schema.platformAuditLogs.userId, principalId),
      eq(schema.platformAuditLogs.action, "platform.restore_drill_accepted"),
    ));
    expect(audit.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(audit)).not.toContain(input.isolatedTargetRef);
    expect(JSON.stringify(audit)).not.toContain(input.verificationSummary);
  });

  it("fails closed for unsafe, mismatched and unsuccessful source evidence", async () => {
    const source = await manifest("production");
    const mismatch = await request(app).post("/api/v1/platform/restore-drills")
      .set(auth(operatorToken)).send(payload(source.id));
    expect(mismatch.status).toBe(400);

    const unsafe = await request(app).post("/api/v1/platform/restore-drills")
      .set(auth(operatorToken)).send(payload(source.id, {
        environment: "production",
        isolatedTargetRef: "https://storage.example.test/signed-target",
      }));
    expect(unsafe.status).toBe(400);

    const failedSource = await manifest("staging", "failed");
    const failed = await request(app).post("/api/v1/platform/restore-drills")
      .set(auth(operatorToken)).send(payload(failedSource.id));
    expect(failed.status).toBe(400);

    const incomplete = await request(app).post("/api/v1/platform/restore-drills")
      .set(auth(operatorToken)).send(payload((await manifest()).id, { tenantIsolationVerified: false }));
    expect(incomplete.status).toBe(400);
  });

  it("refuses self-review or acceptance outside RPO/RTO and preserves append-only rows", async () => {
    const selfSource = await manifest();
    const selfRecorded = await recordRestoreDrill(principalId, payload(selfSource.id));
    await expect(reviewRestoreDrill(principalId, selfRecorded.id, {
      decision: "REJECTED",
      reason: "The recorder cannot make the independent review decision.",
    })).rejects.toThrow("recorder cannot review");

    const source = await manifest();
    const slow = await recordRestoreDrill(operatorId, payload(source.id, { targetRtoMinutes: 10 }));
    expect(slow.acceptanceEligible).toBe(false);
    await expect(reviewRestoreDrill(principalId, slow.id, {
      decision: "ACCEPTED",
      reason: "This must fail because the target recovery time was missed.",
    })).rejects.toThrow("does not satisfy every");
    await expect(reviewRestoreDrill(principalId, slow.id, {
      decision: "REJECTED",
      reason: "token=must-not-enter-independent-review-evidence",
    })).rejects.toThrow();
    const rejected = await reviewRestoreDrill(principalId, slow.id, {
      decision: "REJECTED",
      reason: "The recorded recovery time exceeded the stated target.",
    });
    expect(rejected.decision).toBe("REJECTED");

    await expect(db.update(schema.platformRestoreDrills)
      .set({ verificationSummary: "Attempted evidence replacement must fail." })
      .where(eq(schema.platformRestoreDrills.id, slow.id))).rejects.toThrow();
    await expect(db.delete(schema.platformRestoreDrillReviews)
      .where(eq(schema.platformRestoreDrillReviews.id, rejected.id))).rejects.toThrow();
    const [preservedDrill] = await db.select().from(schema.platformRestoreDrills)
      .where(eq(schema.platformRestoreDrills.id, slow.id));
    const [preservedReview] = await db.select().from(schema.platformRestoreDrillReviews)
      .where(eq(schema.platformRestoreDrillReviews.id, rejected.id));
    expect(preservedDrill.verificationSummary).not.toBe("Attempted evidence replacement must fail.");
    expect(preservedReview.decision).toBe("REJECTED");
  });
});
