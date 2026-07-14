import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { createHmac } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { and, eq } from "drizzle-orm";
import { createApp } from "../src/app.js";
import {
  changePassword, createTenantUser, issueAuthenticatedSession, login, signupTenant,
} from "../src/auth.js";
import { beginMfaEnrollment, verifyMfaEnrollment } from "../src/auth-security.js";
import { jwtSecret } from "../src/config.js";
import { db, schema } from "../src/lib.js";

const app = createApp();
const suffix = () => `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
const auth = (token: string, proof?: string) => ({
  Authorization: `Bearer ${token}`,
  ...(proof ? { "X-Vaka-Step-Up": proof } : {}),
});

function decodeBase32(value: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let accumulator = 0;
  const bytes: number[] = [];
  for (const character of value) {
    accumulator = (accumulator << 5) | alphabet.indexOf(character);
    bits += 5;
    if (bits >= 8) {
      bytes.push((accumulator >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function currentTotp(secret: string): string {
  const counter = Math.floor(Date.now() / 30_000);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", decodeBase32(secret)).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24)
    | ((digest[offset + 1] & 0xff) << 16)
    | ((digest[offset + 2] & 0xff) << 8)
    | (digest[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

const ownerPassword = "Step-Up-Owner-Password-2026!";
let tenantId = "";
let ownerId = "";
let ownerToken = "";
let ownerSessionId = "";
let tenantSubdomain = "";

beforeAll(async () => {
  const unique = suffix();
  const result = await signupTenant({
    companyName: "Step Up Security Workspace",
    subdomain: `stepup${unique}`.slice(0, 31),
    baseCurrency: "USD",
    ownerEmail: `step-up-owner-${unique}@test.zw`,
    ownerPassword,
    ownerName: "Step Up Owner",
    planName: "Growth",
  });
  tenantId = result.tenant.id;
  ownerId = result.owner.id;
  tenantSubdomain = result.tenant.subdomain;
  const session = await login(result.owner.email, ownerPassword, tenantSubdomain);
  if (session.mfaRequired) throw new Error("Unexpected MFA challenge");
  ownerToken = session.token;
  ownerSessionId = (JSON.parse(Buffer.from(session.token.split(".")[1], "base64url").toString()) as { sid: string }).sid;
});

async function stepUp(token: string, password: string, code?: string) {
  return request(app).post("/api/v1/auth/step-up").set(auth(token)).send({
    currentPassword: password,
    ...(code ? { code } : {}),
  });
}

describe("P9-011 privileged recent reauthentication", () => {
  it("requires session-bound proof for tenant team administration", async () => {
    const [role] = await db.select().from(schema.roles).where(and(
      eq(schema.roles.tenantId, tenantId),
      eq(schema.roles.name, "Sales"),
    ));
    const body = {
      email: `step-up-created-${suffix()}@test.zw`,
      fullName: "Step Up Created User",
      roleId: role.id,
    };
    const denied = await request(app).post("/api/v1/security/users").set(auth(ownerToken)).send(body);
    expect(denied.status).toBe(428);
    expect(denied.body.error).toBe("STEP_UP_REQUIRED");

    const reauthenticated = await stepUp(ownerToken, ownerPassword);
    expect(reauthenticated.status).toBe(200);
    expect(reauthenticated.body.stepUpToken).toBeTruthy();
    expect(reauthenticated.body.assuranceLevel).toBe("aal1");
    const created = await request(app).post("/api/v1/security/users")
      .set(auth(ownerToken, reauthenticated.body.stepUpToken)).send(body);
    expect(created.status).toBe(200);
    expect(created.body.user.email).toBe(body.email);

    const secondSession = await login((await db.select().from(schema.users).where(eq(schema.users.id, ownerId)))[0].email,
      ownerPassword, tenantSubdomain);
    if (secondSession.mfaRequired) throw new Error("Unexpected MFA challenge");
    const crossSession = await request(app).post(`/api/v1/security/users/${created.body.user.id}/disabled`)
      .set(auth(secondSession.token, reauthenticated.body.stepUpToken)).send({});
    expect(crossSession.status).toBe(428);

    const expired = jwt.sign({
      purpose: "privileged-step-up", sub: ownerId, sid: ownerSessionId, tenantId,
    }, jwtSecret(), { algorithm: "HS256", expiresIn: -1 });
    const expiredResponse = await request(app).post(`/api/v1/security/users/${created.body.user.id}/disabled`)
      .set(auth(ownerToken, expired)).send({});
    expect(expiredResponse.status).toBe(428);

    const malformed = await request(app).post(`/api/v1/security/users/${created.body.user.id}/disabled`)
      .set(auth(ownerToken, "not-a-signed-proof")).send({});
    expect(malformed.status).toBe(428);
    const wrongPurpose = await request(app).post(`/api/v1/security/users/${created.body.user.id}/disabled`)
      .set(auth(ownerToken, ownerToken)).send({});
    expect(wrongPurpose.status).toBe(428);
    for (const mismatch of [
      { sub: "00000000-0000-4000-8000-000000000001", tenantId },
      { sub: ownerId, tenantId: "00000000-0000-4000-8000-000000000002" },
    ]) {
      const proof = jwt.sign({
        purpose: "privileged-step-up", sid: ownerSessionId, ...mismatch,
      }, jwtSecret(), { algorithm: "HS256", expiresIn: 600 });
      expect((await request(app).post(`/api/v1/security/users/${created.body.user.id}/disabled`)
        .set(auth(ownerToken, proof)).send({})).status).toBe(428);
    }

    const disposableSession = await login((await db.select().from(schema.users)
      .where(eq(schema.users.id, ownerId)))[0].email, ownerPassword, tenantSubdomain);
    if (disposableSession.mfaRequired) throw new Error("Unexpected MFA challenge");
    const disposableProof = (await stepUp(disposableSession.token, ownerPassword)).body.stepUpToken;
    const disposableSessionId = (JSON.parse(Buffer.from(disposableSession.token.split(".")[1], "base64url").toString()) as { sid: string }).sid;
    await db.update(schema.userSessions).set({ revokedAt: new Date() })
      .where(eq(schema.userSessions.id, disposableSessionId));
    expect((await request(app).post(`/api/v1/security/users/${created.body.user.id}/disabled`)
      .set(auth(disposableSession.token, disposableProof)).send({})).status).toBe(401);
  });

  it("keeps ordinary deletion requests available but protects owner deletion and approval", async () => {
    const [role] = await db.select().from(schema.roles).where(and(
      eq(schema.roles.tenantId, tenantId),
      eq(schema.roles.name, "Sales"),
    ));
    const member = await createTenantUser({
      tenantId,
      actorUserId: ownerId,
      email: `step-up-member-${suffix()}@test.zw`,
      fullName: "Step Up Member",
      roleId: role.id,
    });
    const memberPassword = "Step-Up-Member-Replacement-2026!";
    await changePassword({
      userId: member.user.id,
      currentPassword: member.temporaryPassword,
      newPassword: memberPassword,
    });
    const memberSession = await login(member.user.email, memberPassword, tenantSubdomain);
    if (memberSession.mfaRequired) throw new Error("Unexpected MFA challenge");

    const [requestedContact, directContact] = await db.insert(schema.contacts).values([
      { tenantId, name: "Requested Deletion Contact", type: "COMPANY" as const },
      { tenantId, name: "Direct Owner Deletion Contact", type: "COMPANY" as const },
    ]).returning();
    const requested = await request(app).post("/api/v1/contacts/deletions")
      .set(auth(memberSession.token)).send({ ids: [requestedContact.id], reason: "Duplicate test contact" });
    expect(requested.status).toBe(200);
    expect(requested.body.outcome).toBe("REQUESTED");
    const [deletionRequest] = await db.select().from(schema.recordDeletionRequests).where(and(
      eq(schema.recordDeletionRequests.tenantId, tenantId),
      eq(schema.recordDeletionRequests.entityId, requestedContact.id),
    ));

    const noApprovalProof = await request(app)
      .post(`/api/v1/contacts/deletion-requests/${deletionRequest.id}/decision`)
      .set(auth(ownerToken)).send({ decision: "APPROVE", reason: "Approve duplicate removal" });
    expect(noApprovalProof.status).toBe(428);
    const rejectedWithoutProof = await request(app)
      .post(`/api/v1/contacts/deletion-requests/${deletionRequest.id}/decision`)
      .set(auth(ownerToken)).send({ decision: "REJECT", reason: "Preserve record for review" });
    expect(rejectedWithoutProof.status).toBe(200);

    const noDirectProof = await request(app).post("/api/v1/contacts/deletions")
      .set(auth(ownerToken)).send({ ids: [directContact.id], reason: "Owner duplicate removal" });
    expect(noDirectProof.status).toBe(428);
    const proof = (await stepUp(ownerToken, ownerPassword)).body.stepUpToken;
    const removed = await request(app).post("/api/v1/contacts/deletions")
      .set(auth(ownerToken, proof)).send({ ids: [directContact.id], reason: "Owner duplicate removal" });
    expect(removed.status).toBe(200);
    expect(removed.body.outcome).toBe("REMOVED");
  });

  it("requires enrolled MFA and consumes a recovery code only once", async () => {
    const enrollment = await beginMfaEnrollment(ownerId);
    const verified = await verifyMfaEnrollment(ownerId, currentTotp(enrollment.secret));
    const session = await issueAuthenticatedSession(ownerId, {}, "aal2");

    const missing = await stepUp(session.token, ownerPassword);
    expect(missing.status).toBe(401);
    expect(missing.body.message).toContain("code required");
    const wrong = await stepUp(session.token, ownerPassword, "000000");
    expect(wrong.status).toBe(401);
    const recoveryCode = verified.recoveryCodes[0];
    const completed = await stepUp(session.token, ownerPassword, recoveryCode);
    expect(completed.status).toBe(200);
    expect(completed.body.assuranceLevel).toBe("aal2");
    expect((await stepUp(session.token, ownerPassword, recoveryCode)).status).toBe(401);

    const events = await db.select().from(schema.auditLogs).where(and(
      eq(schema.auditLogs.tenantId, tenantId),
      eq(schema.auditLogs.userId, ownerId),
    ));
    expect(events.some((event) => event.action === "security.step_up_completed")).toBe(true);
    expect(events.some((event) => event.action === "security.step_up_failed")).toBe(true);
    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain(ownerPassword);
    expect(serialized).not.toContain(recoveryCode);
    expect(serialized).not.toContain(completed.body.stepUpToken);
  });

  it("protects platform workforce administration and preserves permission checks", async () => {
    const password = "Step-Up-Principal-Password-2026!";
    const unique = suffix();
    const [principal] = await db.insert(schema.users).values({
      tenantId: null,
      email: `step-up-principal-${unique}@test.zw`,
      passwordHash: await bcrypt.hash(password, 12),
      fullName: "Step Up Principal",
      isPlatformAdmin: true,
      platformRoleKey: "PRINCIPAL_ADMIN",
      status: "active",
    }).returning();
    const session = await issueAuthenticatedSession(principal.id);
    const staffBody = {
      email: `step-up-staff-${unique}@test.zw`,
      fullName: "Protected Platform Staff",
      platformRoleKey: "SUPPORT_ANALYST",
      businessFunction: "Customer Support",
      jobTitle: "Support Analyst",
      employmentState: "ACTIVE",
    };
    expect((await request(app).post("/api/v1/platform/staff").set(auth(session.token)).send(staffBody)).status).toBe(428);
    const proof = (await stepUp(session.token, password)).body.stepUpToken;
    const created = await request(app).post("/api/v1/platform/staff")
      .set(auth(session.token, proof)).send(staffBody);
    expect(created.status).toBe(200);
    expect((await request(app).post(`/api/v1/platform/staff/${created.body.user.id}/temporary-password`)
      .set(auth(session.token)).send({})).status).toBe(428);
    expect((await request(app).post(`/api/v1/platform/staff/${created.body.user.id}/temporary-password`)
      .set(auth(session.token, proof)).send({})).status).toBe(200);

    const [delegated] = await db.insert(schema.users).values({
      tenantId: null,
      email: `step-up-delegated-${unique}@test.zw`,
      passwordHash: await bcrypt.hash(password, 12),
      fullName: "Delegated Operations User",
      isPlatformAdmin: true,
      platformRoleKey: "OPERATIONS_ADMIN",
      status: "active",
    }).returning();
    const delegatedSession = await issueAuthenticatedSession(delegated.id);
    const delegatedProof = (await stepUp(delegatedSession.token, password)).body.stepUpToken;
    const forbidden = await request(app).post("/api/v1/platform/staff")
      .set(auth(delegatedSession.token, delegatedProof)).send({ ...staffBody, email: `denied-${unique}@test.zw` });
    expect(forbidden.status).toBe(403);

    const events = await db.select().from(schema.platformAuditLogs).where(and(
      eq(schema.platformAuditLogs.userId, principal.id),
      eq(schema.platformAuditLogs.action, "platform_admin.step_up_completed"),
    ));
    expect(events).toHaveLength(1);
    expect(JSON.stringify(events)).not.toContain(proof);
    expect(JSON.stringify(events)).not.toContain(password);
  });
});
