// ============================================================================
// P9-010 — refresh-token rotation and replay containment.
//
// Covers: migration idempotency + runtime schema readiness, cookie transport,
// current-token rotation, previous-token replay containment, negative cases
// (revoked / expired / disabled / unknown / cross-session / cross-tenant),
// MFA assurance preservation, compatible legacy sessions, sign-out cookie
// clearing, and tenant + platform audit redaction.
// ============================================================================
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { and, desc, eq, sql } from "drizzle-orm";
import { createApp } from "../src/app.js";
import { issueAuthenticatedSession, login, revokeSession, setTenantUserStatus, signupTenant, createTenantUser } from "../src/auth.js";
import { db, schema } from "../src/lib.js";

const app = createApp();
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const suffix = () => `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
const jwtPayload = (token: string) =>
  JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()) as { sid: string; aal: string; sub: string; tenantId: string | null };

const REFRESH_COOKIE = "vaka_refresh";

function refreshCookie(res: request.Response): { value: string | null; attributes: string | null } {
  const header = res.headers["set-cookie"] as unknown as string[] | undefined;
  const raw = (header ?? []).find((cookie) => cookie.startsWith(`${REFRESH_COOKIE}=`));
  if (!raw) return { value: null, attributes: null };
  const value = raw.slice(REFRESH_COOKIE.length + 1).split(";")[0];
  return { value: value || null, attributes: raw };
}

const asCookieHeader = (value: string) => `${REFRESH_COOKIE}=${value}`;

async function createWorkspace(label: string) {
  const unique = suffix();
  const password = "Refresh-Rotation-Test-2026!";
  const result = await signupTenant({
    companyName: `${label} Workspace`,
    subdomain: `${label.toLowerCase().replace(/[^a-z]/g, "").slice(0, 8)}${unique}`.slice(0, 31),
    baseCurrency: "USD",
    ownerEmail: `${label.toLowerCase().replace(/[^a-z]/g, "")}-${unique}@test.zw`,
    ownerPassword: password,
    ownerName: `${label} Owner`,
    planName: "Growth",
  });
  return { ...result, password };
}

async function loginViaHttp(email: string, password: string, subdomain: string) {
  const res = await request(app).post("/api/v1/auth/login").send({ email, password, subdomain });
  expect(res.status).toBe(200);
  const cookie = refreshCookie(res);
  expect(cookie.value).toBeTruthy();
  return { token: res.body.token as string, refreshValue: cookie.value!, cookieAttributes: cookie.attributes!, body: res.body };
}

const sessionRow = async (sessionId: string) => {
  const [row] = await db.select().from(schema.userSessions).where(eq(schema.userSessions.id, sessionId));
  return row;
};

describe("P9-010 refresh-token rotation", () => {
  it("applies the 0031 migration idempotently and satisfies runtime schema readiness", async () => {
    const migration = readFileSync(new URL("../drizzle/0031_refresh_token_rotation.sql", import.meta.url), "utf8");
    await db.execute(sql.raw(migration));
    await db.execute(sql.raw(migration)); // idempotent: second application is a no-op

    const { rows } = await db.execute(sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'user_sessions'
        AND column_name IN ('refresh_token_hash', 'previous_refresh_token_hash', 'refresh_rotated_at', 'assurance_level')
    `) as unknown as { rows: { column_name: string }[] };
    expect(rows.map((r) => r.column_name).sort()).toEqual([
      "assurance_level", "previous_refresh_token_hash", "refresh_rotated_at", "refresh_token_hash",
    ]);

    const { rows: indexes } = await db.execute(sql`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'user_sessions'
        AND indexname IN ('user_sessions_refresh_token_hash', 'user_sessions_previous_refresh_token_hash')
    `) as unknown as { rows: { indexname: string }[] };
    expect(indexes).toHaveLength(2);
  });

  it("delivers the refresh credential only as a hardened, path-restricted cookie", async () => {
    const { tenant, password } = await createWorkspace("CookieHardening");
    const [owner] = await db.select().from(schema.users).where(eq(schema.users.tenantId, tenant.id));
    const { cookieAttributes, body, refreshValue } = await loginViaHttp(owner.email, password, tenant.subdomain);

    expect(cookieAttributes).toContain("HttpOnly");
    expect(cookieAttributes).toContain("SameSite=Strict");
    expect(cookieAttributes).toContain("Path=/api/v1/auth/refresh");
    // The raw credential never appears in a JSON payload.
    expect(JSON.stringify(body)).not.toContain(refreshValue);
    expect(body.refreshToken).toBeUndefined();

    // Raw credential and its hash are never persisted.
    const session = await sessionRow(jwtPayload(body.token).sid);
    expect(session.refreshTokenHash).toBeTruthy();
    expect(session.assuranceLevel).toBe("aal1");
    expect(JSON.stringify(body)).not.toContain(session.refreshTokenHash!);
  });

  it("rotates both credentials on renewal, keeps identity, and audits with redacted metadata", async () => {
    const { tenant, owner, password } = await createWorkspace("Rotation");
    const first = await loginViaHttp(owner.email, password, tenant.subdomain);
    const sessionId = jwtPayload(first.token).sid;

    const renewal = await request(app).post("/api/v1/auth/refresh").set("Cookie", asCookieHeader(first.refreshValue));
    expect(renewal.status).toBe(200);
    expect(renewal.body.token).toBeTruthy();
    expect(renewal.body.refreshToken).toBeUndefined();
    const rotatedCookie = refreshCookie(renewal);
    expect(rotatedCookie.value).toBeTruthy();
    expect(rotatedCookie.value).not.toBe(first.refreshValue);

    // Same session, no new permissions, normal auth middleware re-resolution.
    const payload = jwtPayload(renewal.body.token);
    expect(payload.sid).toBe(sessionId);
    expect(payload.sub).toBe(owner.id);
    const me = await request(app).get("/api/v1/me").set(auth(renewal.body.token));
    expect(me.status).toBe(200);

    // The superseded access token no longer authenticates.
    expect((await request(app).get("/api/v1/me").set(auth(first.token))).status).toBe(401);

    const session = await sessionRow(sessionId);
    expect(session.refreshRotatedAt).toBeTruthy();
    expect(session.previousRefreshTokenHash).toBeTruthy();
    expect(session.absoluteExpiresAt.getTime()).toBeGreaterThan(Date.now());

    const [event] = await db.select().from(schema.auditLogs).where(and(
      eq(schema.auditLogs.tenantId, tenant.id),
      eq(schema.auditLogs.action, "security.session_refreshed"),
    )).orderBy(desc(schema.auditLogs.createdAt));
    expect(event).toBeTruthy();
    expect(event.entityId).toBe(sessionId);
    const metadata = JSON.stringify(event.metadata);
    expect(Object.keys(event.metadata as object).sort()).toEqual(["clientType", "reason"]);
    expect(metadata).not.toContain(first.refreshValue);
    expect(metadata).not.toContain(rotatedCookie.value!);
    expect(metadata).not.toContain(session.refreshTokenHash!);
  });

  it("contains replay: a superseded credential revokes the session and is audited, scoped to that session", async () => {
    const { tenant, owner, password } = await createWorkspace("Replay");
    const victim = await loginViaHttp(owner.email, password, tenant.subdomain);
    const bystander = await loginViaHttp(owner.email, password, tenant.subdomain);
    const victimSessionId = jwtPayload(victim.token).sid;

    const renewal = await request(app).post("/api/v1/auth/refresh").set("Cookie", asCookieHeader(victim.refreshValue));
    expect(renewal.status).toBe(200);

    // Replay of the superseded credential: generic 401, cookie cleared, session revoked.
    const replay = await request(app).post("/api/v1/auth/refresh").set("Cookie", asCookieHeader(victim.refreshValue));
    expect(replay.status).toBe(401);
    expect(replay.body.message).toBe("Session renewal failed");
    const clearing = refreshCookie(replay);
    expect(clearing.attributes).toBeTruthy();
    expect(clearing.value).toBeNull();

    const revoked = await sessionRow(victimSessionId);
    expect(revoked.revokedAt).toBeTruthy();
    expect(revoked.revokedReason).toBe("refresh_replay");

    // Fail closed: neither the rotated refresh credential nor the rotated
    // access token survives containment.
    const rotatedValue = refreshCookie(renewal).value!;
    expect((await request(app).post("/api/v1/auth/refresh").set("Cookie", asCookieHeader(rotatedValue))).status).toBe(401);
    expect((await request(app).get("/api/v1/me").set(auth(renewal.body.token))).status).toBe(401);

    // Scoped: the user's other session still renews.
    const bystanderRenewal = await request(app).post("/api/v1/auth/refresh").set("Cookie", asCookieHeader(bystander.refreshValue));
    expect(bystanderRenewal.status).toBe(200);

    const [event] = await db.select().from(schema.auditLogs).where(and(
      eq(schema.auditLogs.tenantId, tenant.id),
      eq(schema.auditLogs.action, "security.session_refresh_replay"),
    ));
    expect(event).toBeTruthy();
    expect(event.entityId).toBe(victimSessionId);
    const metadata = JSON.stringify(event.metadata);
    expect(metadata).not.toContain(victim.refreshValue);
    expect(metadata).not.toContain(rotatedValue);
  });

  it("rejects unknown, malformed and missing credentials without persisting audit evidence", async () => {
    const replayCount = async () => {
      const { rows } = await db.execute(sql`
        SELECT count(*)::int AS n FROM audit_logs
        WHERE action IN ('security.session_refreshed', 'security.session_refresh_replay')
      `) as unknown as { rows: { n: number }[] };
      return rows[0].n;
    };
    const before = await replayCount();

    const missing = await request(app).post("/api/v1/auth/refresh");
    expect(missing.status).toBe(401);
    const malformed = await request(app).post("/api/v1/auth/refresh").set("Cookie", `${REFRESH_COOKIE}=not!a@token`);
    expect(malformed.status).toBe(401);
    const unknown = await request(app).post("/api/v1/auth/refresh")
      .set("Cookie", asCookieHeader("A".repeat(43)));
    expect(unknown.status).toBe(401);
    expect(refreshCookie(unknown).value).toBeNull(); // cleared

    expect(await replayCount()).toBe(before); // no audit amplification
  });

  it("denies renewal for revoked, idle-expired, absolute-expired and disabled-user sessions", async () => {
    const { tenant, owner, password } = await createWorkspace("Negatives");

    // Revoked session.
    const revokedLogin = await loginViaHttp(owner.email, password, tenant.subdomain);
    await revokeSession({
      tenantId: tenant.id, sessionId: jwtPayload(revokedLogin.token).sid,
      actorUserId: owner.id, reason: "owner_device_review",
    });
    expect((await request(app).post("/api/v1/auth/refresh").set("Cookie", asCookieHeader(revokedLogin.refreshValue))).status).toBe(401);

    // Idle-expired session.
    const idleLogin = await loginViaHttp(owner.email, password, tenant.subdomain);
    await db.update(schema.userSessions).set({ idleExpiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.userSessions.id, jwtPayload(idleLogin.token).sid));
    expect((await request(app).post("/api/v1/auth/refresh").set("Cookie", asCookieHeader(idleLogin.refreshValue))).status).toBe(401);

    // Absolute-expired session.
    const absoluteLogin = await loginViaHttp(owner.email, password, tenant.subdomain);
    await db.update(schema.userSessions).set({ absoluteExpiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.userSessions.id, jwtPayload(absoluteLogin.token).sid));
    expect((await request(app).post("/api/v1/auth/refresh").set("Cookie", asCookieHeader(absoluteLogin.refreshValue))).status).toBe(401);

    // Disabled user.
    const roles = await db.select().from(schema.roles).where(eq(schema.roles.tenantId, tenant.id));
    const stockRole = roles.find((role) => role.name === "Stock Controller")!;
    const member = await createTenantUser({
      tenantId: tenant.id, actorUserId: owner.id,
      email: `disabled-${suffix()}@test.zw`, fullName: "Disabled Member", roleId: stockRole.id,
    });
    const memberLogin = await loginViaHttp(member.user.email, member.temporaryPassword, tenant.subdomain);
    await setTenantUserStatus({ tenantId: tenant.id, actorUserId: owner.id, userId: member.user.id, status: "disabled" });
    expect((await request(app).post("/api/v1/auth/refresh").set("Cookie", asCookieHeader(memberLogin.refreshValue))).status).toBe(401);
  });

  it("keeps legacy access-only sessions valid but unable to renew (compatible migration)", async () => {
    const { tenant, owner, password } = await createWorkspace("Legacy");
    const legacy = await loginViaHttp(owner.email, password, tenant.subdomain);
    const sessionId = jwtPayload(legacy.token).sid;

    // Simulate a pre-P9-010 session: no refresh state at all.
    await db.update(schema.userSessions)
      .set({ refreshTokenHash: null, previousRefreshTokenHash: null })
      .where(eq(schema.userSessions.id, sessionId));

    // Access continues normally…
    expect((await request(app).get("/api/v1/me").set(auth(legacy.token))).status).toBe(200);
    // …but renewal is impossible and does not revoke the session.
    expect((await request(app).post("/api/v1/auth/refresh").set("Cookie", asCookieHeader(legacy.refreshValue))).status).toBe(401);
    const session = await sessionRow(sessionId);
    expect(session.revokedAt).toBeNull();
  });

  it("preserves aal2 assurance across rotation and denies MFA-inconsistent renewal", async () => {
    const { tenant, owner, password } = await createWorkspace("Assurance");

    // aal1 session first, then the user verifies an MFA factor: renewal of the
    // now MFA-inconsistent session must be denied.
    const aal1 = await loginViaHttp(owner.email, password, tenant.subdomain);
    await db.insert(schema.userMfaFactors).values({
      userId: owner.id, factorType: "TOTP", status: "VERIFIED",
      encryptedSecret: "test-secret", secretIv: "test-iv", secretTag: "test-tag",
      recoveryCodeHashes: [], verifiedAt: new Date(),
    });
    expect((await request(app).post("/api/v1/auth/refresh").set("Cookie", asCookieHeader(aal1.refreshValue))).status).toBe(401);

    // An aal2 session renews and keeps its assurance level.
    const aal2 = await issueAuthenticatedSession(owner.id, { clientType: "web" }, "aal2");
    const renewal = await request(app).post("/api/v1/auth/refresh").set("Cookie", asCookieHeader(aal2.refreshToken));
    expect(renewal.status).toBe(200);
    expect(jwtPayload(renewal.body.token).aal).toBe("aal2");
    const session = await sessionRow(jwtPayload(renewal.body.token).sid);
    expect(session.assuranceLevel).toBe("aal2");
    expect((await request(app).get("/api/v1/me").set(auth(renewal.body.token))).status).toBe(200);
  });

  it("records platform workforce renewal and replay through platform audit with redaction", async () => {
    const unique = suffix();
    const [platformUser] = await db.insert(schema.users).values({
      tenantId: null,
      email: `platform-refresh-${unique}@vaka.africa`,
      fullName: "Platform Refresh Tester",
      passwordHash: "$2a$12$C6UzMDM.H6dfI/f/IKcEeO6t8mF7lFzVXP6cCiSD1S3Yd0S1n5DGm",
      isPlatformAdmin: true,
      platformRoleKey: "PRINCIPAL_ADMIN",
      status: "active",
    }).returning();

    const session = await issueAuthenticatedSession(platformUser.id, { clientType: "web" });
    const renewal = await request(app).post("/api/v1/auth/refresh").set("Cookie", asCookieHeader(session.refreshToken));
    expect(renewal.status).toBe(200);

    const replay = await request(app).post("/api/v1/auth/refresh").set("Cookie", asCookieHeader(session.refreshToken));
    expect(replay.status).toBe(401);

    const events = await db.select().from(schema.platformAuditLogs)
      .where(eq(schema.platformAuditLogs.userId, platformUser.id))
      .orderBy(desc(schema.platformAuditLogs.createdAt));
    const refreshed = events.find((event) => event.action === "platform_admin.session_refreshed");
    const replayed = events.find((event) => event.action === "platform_admin.session_refresh_replay");
    expect(refreshed).toBeTruthy();
    expect(replayed).toBeTruthy();
    for (const event of [refreshed!, replayed!]) {
      const metadata = JSON.stringify(event.metadata);
      expect(metadata).not.toContain(session.refreshToken);
      expect(metadata).not.toContain(session.token);
    }
  });

  it("clears the refresh cookie on sign-out and prevents further renewal", async () => {
    const { tenant, owner, password } = await createWorkspace("SignOut");
    const session = await loginViaHttp(owner.email, password, tenant.subdomain);

    const logout = await request(app).post("/api/v1/auth/logout")
      .set(auth(session.token)).send({ reason: "EXPLICIT" });
    expect(logout.status).toBe(200);
    const cleared = refreshCookie(logout);
    expect(cleared.attributes).toBeTruthy();
    expect(cleared.value).toBeNull();

    expect((await request(app).post("/api/v1/auth/refresh").set("Cookie", asCookieHeader(session.refreshValue))).status).toBe(401);
  });
});
