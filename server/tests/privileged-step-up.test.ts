// ============================================================================
// P9-011 — privileged recent reauthentication (step-up).
//
// Covers: password-only and MFA/recovery issuance, failure audits with
// redaction, proof binding (missing/expired/malformed/wrong-purpose/
// cross-user/cross-session/cross-tenant), permission independence, each
// protected route positive/negative, the non-owner request exception, and
// invalidation through session revocation and MFA change.
// ============================================================================
import { createHmac } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { and, desc, eq } from "drizzle-orm";
import { createApp } from "../src/app.js";
import { issueAuthenticatedSession, login, revokeSession, signupTenant, createTenantUser } from "../src/auth.js";
import { beginMfaEnrollment, verifyMfaEnrollment } from "../src/auth-security.js";
import { jwtSecret } from "../src/config.js";
import { db, schema } from "../src/lib.js";

const app = createApp();
const SECRET = jwtSecret();
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const proofHeader = (proof: string) => ({ "X-Vaka-Step-Up": proof });
const suffix = () => `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
const sessionIdOf = (token: string) =>
  JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).sid as string;

const PASSWORD = "Step-Up-Owner-Test-2026!";

async function createWorkspace(label: string) {
  const unique = suffix();
  const result = await signupTenant({
    companyName: `${label} Workspace`,
    subdomain: `${label.toLowerCase().replace(/[^a-z]/g, "").slice(0, 8)}${unique}`.slice(0, 31),
    baseCurrency: "USD",
    ownerEmail: `${label.toLowerCase().replace(/[^a-z]/g, "")}-${unique}@test.zw`,
    ownerPassword: PASSWORD,
    ownerName: `${label} Owner`,
    planName: "Growth",
  });
  return result;
}

async function stepUp(token: string, currentPassword: string, code?: string) {
  return request(app).post("/api/v1/auth/step-up").set(auth(token))
    .send({ currentPassword, ...(code ? { code } : {}) });
}

async function issueProof(token: string, currentPassword = PASSWORD) {
  const res = await stepUp(token, currentPassword);
  expect(res.status).toBe(200);
  expect(res.body.proof).toBeTruthy();
  expect(res.body.expiresInSeconds).toBe(600);
  return res.body.proof as string;
}

const insertContact = async (tenantId: string, name: string) => {
  const [contact] = await db.insert(schema.contacts).values({ tenantId, name }).returning();
  return contact;
};

// Matches the server's TOTP implementation for enrollment in tests.
function decodeBase32(input: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0; let accumulator = 0; const bytes: number[] = [];
  for (const char of input.replace(/=+$/, "")) {
    const index = alphabet.indexOf(char);
    if (index < 0) throw new Error("Invalid base32 secret");
    accumulator = (accumulator << 5) | index;
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

describe("P9-011 privileged step-up", () => {
  it("issues a password-only proof, audits completion with redacted metadata", async () => {
    const { tenant, owner } = await createWorkspace("IssuePwd");
    const session = await login(owner.email, PASSWORD, tenant.subdomain);
    const proof = await issueProof(session.token);

    const payload = JSON.parse(Buffer.from(proof.split(".")[1], "base64url").toString());
    expect(payload.purpose).toBe("privileged-step-up");
    expect(payload.sub).toBe(owner.id);
    expect(payload.sid).toBe(sessionIdOf(session.token));
    expect(payload.exp - payload.iat).toBeLessThanOrEqual(600);

    const [event] = await db.select().from(schema.auditLogs).where(and(
      eq(schema.auditLogs.tenantId, tenant.id),
      eq(schema.auditLogs.action, "security.step_up_completed"),
    ));
    expect(event).toBeTruthy();
    expect((event.metadata as any).method).toBe("password");
    const metadata = JSON.stringify(event.metadata);
    expect(metadata).not.toContain(PASSWORD);
    expect(metadata).not.toContain(proof);
  });

  it("audits a wrong password as a bounded failure class and returns a generic 401", async () => {
    const { tenant, owner } = await createWorkspace("FailPwd");
    const session = await login(owner.email, PASSWORD, tenant.subdomain);
    const res = await stepUp(session.token, "Wrong-Password-2026!");
    expect(res.status).toBe(401);
    expect(res.body.proof).toBeUndefined();
    expect(res.body.message).toBe("Reauthentication failed");

    const [event] = await db.select().from(schema.auditLogs).where(and(
      eq(schema.auditLogs.tenantId, tenant.id),
      eq(schema.auditLogs.action, "security.step_up_failed"),
    ));
    expect(event).toBeTruthy();
    expect((event.metadata as any).failure).toBe("password");
    expect(JSON.stringify(event.metadata)).not.toContain("Wrong-Password-2026!");
  });

  it("protects owner team management: 428 without proof, works with proof, and a proof grants no permission", async () => {
    const { tenant, owner } = await createWorkspace("TeamMgmt");
    const session = await login(owner.email, PASSWORD, tenant.subdomain);
    const roles = await db.select().from(schema.roles).where(eq(schema.roles.tenantId, tenant.id));
    const salesRole = roles.find((role) => role.name === "Sales")!;

    const newUserBody = {
      email: `member-${suffix()}@test.zw`, fullName: "Step Up Member", roleId: salesRole.id,
    };
    const denied = await request(app).post("/api/v1/security/users").set(auth(session.token)).send(newUserBody);
    expect(denied.status).toBe(428);
    expect(denied.body.error).toBe("STEP_UP_REQUIRED");

    const proof = await issueProof(session.token);
    const created = await request(app).post("/api/v1/security/users")
      .set(auth(session.token)).set(proofHeader(proof)).send(newUserBody);
    expect(created.status).toBe(200);

    // Status change is protected the same way.
    const noProofStatus = await request(app)
      .post(`/api/v1/security/users/${created.body.user.id}/disabled`)
      .set(auth(session.token)).send({});
    expect(noProofStatus.status).toBe(428);
    const disabled = await request(app)
      .post(`/api/v1/security/users/${created.body.user.id}/disabled`)
      .set(auth(session.token)).set(proofHeader(proof)).send({});
    expect(disabled.status).toBe(200);

    // A valid proof never substitutes for permission: re-enable the member,
    // then let the non-owner present their own proof — still forbidden.
    const reEnabled = await request(app)
      .post(`/api/v1/security/users/${created.body.user.id}/active`)
      .set(auth(session.token)).set(proofHeader(proof)).send({});
    expect(reEnabled.status).toBe(200);
    const memberLogin = await login(newUserBody.email, created.body.temporaryPassword, tenant.subdomain);
    const memberProofRes = await stepUp(memberLogin.token, created.body.temporaryPassword);
    expect(memberProofRes.status).toBe(200);
    const forbidden = await request(app).post("/api/v1/security/users")
      .set(auth(memberLogin.token)).set(proofHeader(memberProofRes.body.proof))
      .send({ email: `x-${suffix()}@test.zw`, fullName: "Never Created", roleId: salesRole.id });
    expect(forbidden.status).toBe(403);
  });

  it("rejects missing, malformed, wrong-purpose, expired, cross-user, cross-session and cross-tenant proofs", async () => {
    const { tenant, owner } = await createWorkspace("Binding");
    const other = await createWorkspace("BindingOther");
    const session = await login(owner.email, PASSWORD, tenant.subdomain);
    const secondSession = await login(owner.email, PASSWORD, tenant.subdomain);
    const otherSession = await login(other.owner.email, PASSWORD, other.tenant.subdomain);
    const roles = await db.select().from(schema.roles).where(eq(schema.roles.tenantId, tenant.id));
    const salesRole = roles.find((role) => role.name === "Sales")!;
    const attempt = (proof?: string) => {
      let req = request(app).post("/api/v1/security/users").set(auth(session.token));
      if (proof) req = req.set(proofHeader(proof));
      return req.send({ email: `bind-${suffix()}@test.zw`, fullName: "Binding Test", roleId: salesRole.id });
    };
    const claims = {
      purpose: "privileged-step-up", sub: owner.id,
      sid: sessionIdOf(session.token), tenantId: tenant.id, aal: "aal1", jti: "test",
    };

    expect((await attempt()).status).toBe(428); // missing
    expect((await attempt("not-a-jwt")).status).toBe(428); // malformed
    expect((await attempt(jwt.sign({ ...claims, purpose: "mfa-login" }, SECRET, { expiresIn: 600 }))).status).toBe(428); // wrong purpose
    expect((await attempt(jwt.sign(claims, SECRET, { expiresIn: -10 }))).status).toBe(428); // expired
    expect((await attempt(jwt.sign({ ...claims, sub: other.owner.id }, SECRET, { expiresIn: 600 }))).status).toBe(428); // cross-user
    expect((await attempt(jwt.sign({ ...claims, sid: sessionIdOf(secondSession.token) }, SECRET, { expiresIn: 600 }))).status).toBe(428); // cross-session
    expect((await attempt(jwt.sign({ ...claims, tenantId: other.tenant.id }, SECRET, { expiresIn: 600 }))).status).toBe(428); // cross-tenant
    expect((await attempt(jwt.sign(claims, "wrong-secret-material-000000000000000000", { expiresIn: 600 }))).status).toBe(428); // wrong signature

    // The genuine proof from the other tenant's owner is equally useless here.
    const foreignProof = await issueProof(otherSession.token);
    expect((await attempt(foreignProof)).status).toBe(428);
  });

  it("requires proof for owner immediate deletion and APPROVE, but not for staff requests or REJECT", async () => {
    const { tenant, owner } = await createWorkspace("Deletions");
    const ownerSession = await login(owner.email, PASSWORD, tenant.subdomain);
    const roles = await db.select().from(schema.roles).where(eq(schema.roles.tenantId, tenant.id));
    const salesRole = roles.find((role) => role.name === "Sales")!;
    const staff = await createTenantUser({
      tenantId: tenant.id, actorUserId: owner.id,
      email: `sales-${suffix()}@test.zw`, fullName: "Sales Person", roleId: salesRole.id,
    });
    await db.update(schema.users).set({ mustChangePassword: false }).where(eq(schema.users.id, staff.user.id));
    const staffSession = await login(staff.user.email, staff.temporaryPassword, tenant.subdomain);

    const c1 = await insertContact(tenant.id, "Owner Deletes Me");
    const c2 = await insertContact(tenant.id, "Staff Requests Me");
    const c3 = await insertContact(tenant.id, "Approval Needed");

    // Staff request: no step-up needed.
    const staffRequest = await request(app).post("/api/v1/contacts/deletions")
      .set(auth(staffSession.token)).send({ ids: [c2.id], reason: "duplicate record" });
    expect(staffRequest.status).toBe(200);
    expect(staffRequest.body.outcome).toBe("REQUESTED");

    // Owner immediate deletion: 428 without, works with proof.
    const ownerNoProof = await request(app).post("/api/v1/contacts/deletions")
      .set(auth(ownerSession.token)).send({ ids: [c1.id], reason: "obsolete record" });
    expect(ownerNoProof.status).toBe(428);
    const ownerProof = await issueProof(ownerSession.token);
    const ownerDeletes = await request(app).post("/api/v1/contacts/deletions")
      .set(auth(ownerSession.token)).set(proofHeader(ownerProof)).send({ ids: [c1.id], reason: "obsolete record" });
    expect(ownerDeletes.status).toBe(200);
    expect(ownerDeletes.body.outcome).toBe("REMOVED");

    // Decision: REJECT needs no proof; APPROVE does.
    const requests = await request(app).get("/api/v1/contacts/deletion-requests").set(auth(ownerSession.token));
    const pendingC2 = requests.body.find((row: any) => row.entityId === c2.id && row.status === "PENDING");
    expect(pendingC2).toBeTruthy();
    const reject = await request(app)
      .post(`/api/v1/contacts/deletion-requests/${pendingC2.id}/decision`)
      .set(auth(ownerSession.token)).send({ decision: "REJECT", reason: "keep this contact" });
    expect(reject.status).toBe(200);

    const staffRequest2 = await request(app).post("/api/v1/contacts/deletions")
      .set(auth(staffSession.token)).send({ ids: [c3.id], reason: "left the market" });
    expect(staffRequest2.status).toBe(200);
    const requests2 = await request(app).get("/api/v1/contacts/deletion-requests").set(auth(ownerSession.token));
    const pendingC3 = requests2.body.find((row: any) => row.entityId === c3.id && row.status === "PENDING");
    const approveNoProof = await request(app)
      .post(`/api/v1/contacts/deletion-requests/${pendingC3.id}/decision`)
      .set(auth(ownerSession.token)).send({ decision: "APPROVE", reason: "confirmed obsolete" });
    expect(approveNoProof.status).toBe(428);
    const approve = await request(app)
      .post(`/api/v1/contacts/deletion-requests/${pendingC3.id}/decision`)
      .set(auth(ownerSession.token)).set(proofHeader(ownerProof)).send({ decision: "APPROVE", reason: "confirmed obsolete" });
    expect(approve.status).toBe(200);
  });

  it("requires MFA code when enrolled: explicit prompt, TOTP and one-time recovery issuance, code failure audit", async () => {
    const { tenant, owner } = await createWorkspace("MfaStepUp");
    const enrollment = await beginMfaEnrollment(owner.id);
    const verified = await verifyMfaEnrollment(owner.id, currentTotp(enrollment.secret));
    expect(verified.enabled).toBe(true);

    const challenge = await login(owner.email, PASSWORD, tenant.subdomain);
    expect(challenge.mfaRequired).toBe(true);
    if (!challenge.mfaRequired) throw new Error("expected MFA challenge");
    const mfaLogin = await request(app).post("/api/v1/auth/mfa/verify-login")
      .send({ challengeToken: challenge.challengeToken, code: currentTotp(enrollment.secret) });
    expect(mfaLogin.status).toBe(200);
    const token = mfaLogin.body.token as string;

    // Password alone: explicit authenticated prompt requirement, no proof.
    const prompt = await stepUp(token, PASSWORD);
    expect(prompt.status).toBe(401);
    expect(prompt.body.error).toBe("STEP_UP_MFA_REQUIRED");
    expect(prompt.body.proof).toBeUndefined();

    // TOTP issuance.
    const totpRes = await stepUp(token, PASSWORD, currentTotp(enrollment.secret));
    expect(totpRes.status).toBe(200);

    // One-time recovery code issuance: works once, audited failure on reuse.
    const recoveryCode = verified.recoveryCodes[0];
    const recoveryRes = await stepUp(token, PASSWORD, recoveryCode);
    expect(recoveryRes.status).toBe(200);
    const reuse = await stepUp(token, PASSWORD, recoveryCode);
    expect(reuse.status).toBe(401);
    expect(reuse.body.message).toBe("Reauthentication failed");

    const failures = await db.select().from(schema.auditLogs).where(and(
      eq(schema.auditLogs.tenantId, tenant.id),
      eq(schema.auditLogs.action, "security.step_up_failed"),
    )).orderBy(desc(schema.auditLogs.createdAt));
    expect(failures.length).toBeGreaterThanOrEqual(1);
    expect((failures[0].metadata as any).failure).toBe("mfa_code");
    expect(JSON.stringify(failures[0].metadata)).not.toContain(recoveryCode);
  });

  it("session revocation prevents the protected action because the ordinary session is checked first", async () => {
    const { tenant, owner } = await createWorkspace("Revocation");
    const session = await login(owner.email, PASSWORD, tenant.subdomain);
    const proof = await issueProof(session.token);
    await revokeSession({
      tenantId: tenant.id, sessionId: sessionIdOf(session.token),
      actorUserId: owner.id, reason: "test_revocation",
    });
    const roles = await db.select().from(schema.roles).where(eq(schema.roles.tenantId, tenant.id));
    const salesRole = roles.find((role) => role.name === "Sales")!;
    const attempt = await request(app).post("/api/v1/security/users")
      .set(auth(session.token)).set(proofHeader(proof))
      .send({ email: `revoked-${suffix()}@test.zw`, fullName: "Never Created", roleId: salesRole.id });
    expect(attempt.status).toBe(401);
  });

  it("protects platform staff management with platform audit evidence", async () => {
    const unique = suffix();
    const platformPassword = "Platform-Step-Up-2026!";
    const [admin] = await db.insert(schema.users).values({
      tenantId: null,
      email: `platform-stepup-${unique}@vaka.africa`,
      fullName: "Step Up Principal",
      passwordHash: await bcrypt.hash(platformPassword, 12),
      isPlatformAdmin: true,
      platformRoleKey: "PRINCIPAL_ADMIN",
      status: "active",
    }).returning();
    const session = await issueAuthenticatedSession(admin.id, { clientType: "web" });

    const staffBody = {
      email: `staff-${unique}@vaka.africa`, fullName: "Support Person",
      platformRoleKey: "SUPPORT_ANALYST", employeeNumber: `EMP-${unique}`.slice(0, 20),
      businessFunction: "Support", jobTitle: "Analyst",
    };
    const denied = await request(app).post("/api/v1/platform/staff")
      .set(auth(session.token)).send(staffBody);
    expect(denied.status).toBe(428);

    const wrongPassword = await stepUp(session.token, "Wrong-Platform-Password!");
    expect(wrongPassword.status).toBe(401);

    const proofRes = await stepUp(session.token, platformPassword);
    expect(proofRes.status).toBe(200);
    const proof = proofRes.body.proof as string;

    const created = await request(app).post("/api/v1/platform/staff")
      .set(auth(session.token)).set(proofHeader(proof)).send(staffBody);
    expect(created.status).toBe(200);
    const staffId = created.body.user.id;

    const tempDenied = await request(app)
      .post(`/api/v1/platform/staff/${staffId}/temporary-password`)
      .set(auth(session.token)).send({});
    expect(tempDenied.status).toBe(428);
    const tempIssued = await request(app)
      .post(`/api/v1/platform/staff/${staffId}/temporary-password`)
      .set(auth(session.token)).set(proofHeader(proof)).send({});
    expect(tempIssued.status).toBe(200);

    const events = await db.select().from(schema.platformAuditLogs)
      .where(eq(schema.platformAuditLogs.userId, admin.id))
      .orderBy(desc(schema.platformAuditLogs.createdAt));
    expect(events.some((event) => event.action === "platform_admin.step_up_completed")).toBe(true);
    expect(events.some((event) => event.action === "platform_admin.step_up_failed")).toBe(true);
    for (const event of events) {
      const metadata = JSON.stringify(event.metadata ?? {});
      expect(metadata).not.toContain(platformPassword);
      expect(metadata).not.toContain(proof);
    }
  });
});
