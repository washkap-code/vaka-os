import { createHmac } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import {
  beginMfaEnrollment,
  completePasswordReset,
  requestPasswordReset,
  verifyMfaEnrollment,
  verifyMfaLogin,
} from "../src/auth-security.js";
import { login, requirePermission, signupTenant } from "../src/auth.js";
import { db, schema } from "../src/lib.js";
import { PLATFORM_ROLE_DEFINITIONS } from "../src/platform-staff.js";

const runId = Date.now().toString(36);
const email = `identity-${runId}@test.zw`;
const subdomain = `identity${runId}`.slice(0, 31);
const originalPassword = "Identity-Original-Password-2026!";
const resetPassword = "Identity-Reset-Password-2026!";
let userId = "";

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

beforeAll(async () => {
  const { owner } = await signupTenant({
    companyName: "Identity Security Test",
    subdomain,
    baseCurrency: "USD",
    ownerEmail: email,
    ownerPassword: originalPassword,
    ownerName: "Identity Test Owner",
    planName: "Starter",
  });
  userId = owner.id;
});

describe("password recovery", () => {
  it("does not enumerate unknown identities", async () => {
    let deliveries = 0;
    const result = await requestPasswordReset(`unknown-${runId}@test.zw`, subdomain, async () => {
      deliveries += 1;
      return {};
    });
    expect(result).toEqual({ accepted: true });
    expect(deliveries).toBe(0);
  });

  it("uses a single-use token, changes the password, and revokes sessions", async () => {
    await login(email, originalPassword, subdomain);
    let resetUrl = "";
    await requestPasswordReset(email, subdomain, async (message) => {
      resetUrl = message.variables.resetUrl;
      return { providerMessageId: `test-${runId}` };
    });
    const token = new URL(resetUrl).searchParams.get("resetToken");
    expect(token).toBeTruthy();
    await completePasswordReset(token!, resetPassword);
    await expect(login(email, originalPassword, subdomain)).rejects.toMatchObject({ status: 401 });
    await expect(completePasswordReset(token!, resetPassword)).rejects.toMatchObject({ status: 401 });
    const activeSessions = await db.select({ id: schema.userSessions.id }).from(schema.userSessions).where(and(
      eq(schema.userSessions.userId, userId),
      isNull(schema.userSessions.revokedAt),
    ));
    expect(activeSessions).toHaveLength(0);
  });
});

describe("optional authenticator MFA", () => {
  it("requires verified MFA after enrollment and consumes a recovery code once", async () => {
    const enrollment = await beginMfaEnrollment(userId);
    const verified = await verifyMfaEnrollment(userId, currentTotp(enrollment.secret));
    expect(verified.enabled).toBe(true);
    expect(verified.recoveryCodes).toHaveLength(8);

    const passwordResult = await login(email, resetPassword, subdomain);
    expect(passwordResult.mfaRequired).toBe(true);
    if (!passwordResult.mfaRequired) throw new Error("Expected an MFA login challenge");
    const recoveryCode = verified.recoveryCodes[0];
    const mfaResult = await verifyMfaLogin(passwordResult.challengeToken, recoveryCode);
    expect(mfaResult.userId).toBe(userId);
    await expect(verifyMfaLogin(passwordResult.challengeToken, recoveryCode))
      .rejects.toMatchObject({ status: 401 });
  });
});

describe("fixed platform workforce roles", () => {
  it("keeps staff management principal-only and tenant access out of staff roles", () => {
    const principal = PLATFORM_ROLE_DEFINITIONS.find((role) => role.key === "PRINCIPAL_ADMIN")!;
    const delegated = PLATFORM_ROLE_DEFINITIONS.filter((role) => role.key !== "PRINCIPAL_ADMIN");
    expect(principal.permissions).toContain("platform.staff.manage");
    expect(delegated.every((role) => !role.permissions.includes("platform.staff.manage"))).toBe(true);
    expect(PLATFORM_ROLE_DEFINITIONS.flatMap((role) => role.permissions)
      .some((permission) => permission.startsWith("crm.") || permission.startsWith("accounting."))).toBe(false);
  });

  it("never lets a platform identity inherit tenant-module permission", () => {
    let denied: unknown;
    requirePermission("crm.read")({
      auth: { tenantId: null, permissions: [], isPlatformAdmin: true },
    } as any, {} as any, (error?: unknown) => { denied = error; });
    expect(denied).toMatchObject({ status: 403 });
  });
});
