import { createHmac } from "node:crypto";
import type { Response } from "express";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { and, eq } from "drizzle-orm";
import { createApp } from "../src/app.js";
import {
  issueAuthenticatedSession, login, refreshAuthenticatedSession, setRefreshCookie, signupTenant,
} from "../src/auth.js";
import { beginMfaEnrollment, verifyMfaEnrollment } from "../src/auth-security.js";
import { db, schema } from "../src/lib.js";

const app = createApp();
const suffix = () => `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

function responseCookie(response: request.Response): string {
  const values = response.headers["set-cookie"] as unknown as string[] | undefined;
  if (!values?.[0]) throw new Error("Expected refresh cookie");
  return values[0].split(";")[0];
}

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

async function workspace(label: string) {
  const unique = suffix();
  const password = "Refresh-Session-Test-2026!";
  const email = `${label.toLowerCase()}-${unique}@test.zw`;
  const result = await signupTenant({
    companyName: `${label} Refresh Workspace`,
    subdomain: `${label.toLowerCase()}${unique}`.slice(0, 31),
    baseCurrency: "USD",
    ownerEmail: email,
    ownerPassword: password,
    ownerName: `${label} Owner`,
    planName: "Growth",
  });
  return { ...result, email, password };
}

describe("refresh-token rotation", () => {
  it("marks the refresh cookie Secure in production", () => {
    const original = process.env.NODE_ENV;
    let cookie = "";
    try {
      process.env.NODE_ENV = "production";
      const response = { setHeader: (_name: string, value: string) => { cookie = value; } } as unknown as Response;
      setRefreshCookie(response, "a".repeat(43));
    } finally {
      process.env.NODE_ENV = original;
    }
    expect(cookie).toContain("; Secure");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).toContain("Path=/api/v1/auth");
  });

  it("rotates the HttpOnly credential and revokes the session on replay", async () => {
    const account = await workspace("Rotation");
    const signedIn = await request(app).post("/api/v1/auth/login").send({
      email: account.email,
      password: account.password,
      subdomain: account.tenant.subdomain,
    });
    expect(signedIn.status).toBe(200);
    expect(signedIn.body).not.toHaveProperty("refreshCredential");
    const firstCookie = responseCookie(signedIn);
    expect((signedIn.headers["set-cookie"] as unknown as string[])[0]).toContain("HttpOnly");
    expect((signedIn.headers["set-cookie"] as unknown as string[])[0]).toContain("SameSite=Strict");

    const renewed = await request(app).post("/api/v1/auth/refresh").set("Cookie", firstCookie);
    expect(renewed.status).toBe(200);
    expect(renewed.body.token).not.toBe(signedIn.body.token);
    expect(renewed.body).not.toHaveProperty("refreshCredential");
    const secondCookie = responseCookie(renewed);
    expect(secondCookie).not.toBe(firstCookie);
    expect((await request(app).get("/api/v1/me").set(auth(signedIn.body.token))).status).toBe(401);
    expect((await request(app).get("/api/v1/me").set(auth(renewed.body.token))).status).toBe(200);

    const replay = await request(app).post("/api/v1/auth/refresh").set("Cookie", firstCookie);
    expect(replay.status).toBe(401);
    expect((replay.headers["set-cookie"] as unknown as string[])[0]).toContain("Max-Age=0");
    expect((await request(app).get("/api/v1/me").set(auth(renewed.body.token))).status).toBe(401);

    const events = await db.select().from(schema.auditLogs).where(and(
      eq(schema.auditLogs.tenantId, account.tenant.id),
      eq(schema.auditLogs.entityType, "session"),
    ));
    expect(events.some((event) => event.action === "security.session_refreshed")).toBe(true);
    expect(events.some((event) => event.action === "security.session_refresh_replay")).toBe(true);
    expect(JSON.stringify(events)).not.toContain(firstCookie.split("=")[1]);
    expect(JSON.stringify(events)).not.toContain(secondCookie.split("=")[1]);
  });

  it("keeps independent device sessions isolated and denies renewal after sign-out", async () => {
    const account = await workspace("Isolation");
    const first = await request(app).post("/api/v1/auth/login").send({
      email: account.email, password: account.password, subdomain: account.tenant.subdomain,
    });
    const second = await request(app).post("/api/v1/auth/login").send({
      email: account.email, password: account.password, subdomain: account.tenant.subdomain,
    });
    const firstCookie = responseCookie(first);
    const secondCookie = responseCookie(second);

    expect((await request(app).post("/api/v1/auth/refresh").set("Cookie", firstCookie)).status).toBe(200);
    const secondRenewed = await request(app).post("/api/v1/auth/refresh").set("Cookie", secondCookie);
    expect(secondRenewed.status).toBe(200);
    const secondRenewedCookie = responseCookie(secondRenewed);

    const signedOut = await request(app).post("/api/v1/auth/logout")
      .set(auth(secondRenewed.body.token)).set("Cookie", secondRenewedCookie).send({});
    expect(signedOut.status).toBe(200);
    expect((signedOut.headers["set-cookie"] as unknown as string[])[0]).toContain("Max-Age=0");
    expect((await request(app).post("/api/v1/auth/refresh").set("Cookie", secondRenewedCookie)).status).toBe(401);
  });

  it("preserves MFA assurance across rotation", async () => {
    const account = await workspace("Assurance");
    const enrollment = await beginMfaEnrollment(account.owner.id);
    await verifyMfaEnrollment(account.owner.id, currentTotp(enrollment.secret));
    const session = await issueAuthenticatedSession(account.owner.id, {}, "aal2");
    const renewed = await refreshAuthenticatedSession(session.refreshCredential);
    const payload = JSON.parse(Buffer.from(renewed.token.split(".")[1], "base64url").toString()) as { aal: string };
    expect(payload.aal).toBe("aal2");
    expect((await request(app).get("/api/v1/me").set(auth(renewed.token))).status).toBe(200);
  });

  it("audits platform renewal without credentials and refuses an idle-expired session", async () => {
    const unique = suffix();
    const [role] = await db.select().from(schema.platformRoles).limit(1);
    expect(role).toBeTruthy();
    const [platformUser] = await db.insert(schema.users).values({
      tenantId: null,
      email: `refresh-platform-${unique}@test.zw`,
      passwordHash: "not-used-by-this-session-test",
      fullName: "Refresh Platform Operator",
      isPlatformAdmin: true,
      platformRoleKey: role.key,
      status: "active",
    }).returning();
    const session = await issueAuthenticatedSession(platformUser.id);
    const renewed = await refreshAuthenticatedSession(session.refreshCredential);
    const sessionId = (JSON.parse(Buffer.from(renewed.token.split(".")[1], "base64url").toString()) as { sid: string }).sid;
    const [stored] = await db.select({
      refreshTokenHash: schema.userSessions.refreshTokenHash,
      previousRefreshTokenHash: schema.userSessions.previousRefreshTokenHash,
    }).from(schema.userSessions).where(eq(schema.userSessions.id, sessionId));
    expect(stored.refreshTokenHash).not.toContain(renewed.refreshCredential);
    expect(stored.previousRefreshTokenHash).not.toContain(session.refreshCredential);

    const events = await db.select().from(schema.platformAuditLogs).where(and(
      eq(schema.platformAuditLogs.userId, platformUser.id),
      eq(schema.platformAuditLogs.action, "platform_admin.session_refreshed"),
    ));
    expect(events).toHaveLength(1);
    expect(JSON.stringify(events)).not.toContain(session.refreshCredential);
    expect(JSON.stringify(events)).not.toContain(renewed.refreshCredential);

    await db.update(schema.userSessions).set({ idleExpiresAt: new Date(Date.now() - 1_000) })
      .where(eq(schema.userSessions.id, sessionId));
    await expect(refreshAuthenticatedSession(renewed.refreshCredential))
      .rejects.toMatchObject({ status: 401 });
  });
});
