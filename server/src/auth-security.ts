import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import {
  createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { PLATFORM_NOTIFICATION_SCOPE } from "./notifications.js";
import type { NotificationServiceContract } from "./platform/notifications/index.js";
import { NOTIFICATION_SERVICE, platformKernel } from "./platform-runtime.js";
import { jwtSecret, mfaEncryptionSecret, mfaEnrollmentAvailable, publicAppUrl } from "./config.js";
import { AppError, badRequest, db, schema, unauthorized, type DB } from "./lib.js";

const SECRET = jwtSecret();
const SECURITY_SECRET = mfaEncryptionSecret();
const RESET_TTL_MS = 30 * 60_000;
const TOTP_STEP_SECONDS = 30;
const TOTP_DIGITS = 6;
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const RECOVERY_CODE_COUNT = 8;

type SecurityUser = typeof schema.users.$inferSelect;

function hashOpaque(value: string, purpose: string): string {
  return createHmac("sha256", SECURITY_SECRET).update(`${purpose}:${value}`).digest("hex");
}

async function securityAudit(
  tx: DB,
  user: Pick<SecurityUser, "id" | "tenantId">,
  action: string,
  metadata: Record<string, unknown> = {},
) {
  if (user.tenantId) {
    await tx.insert(schema.auditLogs).values({
      tenantId: user.tenantId,
      userId: user.id,
      action,
      entityType: "user",
      entityId: user.id,
      metadata,
    });
  } else {
    await tx.insert(schema.platformAuditLogs).values({ userId: user.id, action, metadata });
  }
}

function base32Encode(input: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of input) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(input: string): Buffer {
  let bits = 0;
  let value = 0;
  const output: number[] = [];
  for (const char of input.toUpperCase().replace(/=+$/g, "")) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) throw new Error("Invalid base32 secret");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

function encryptionKey(): Buffer {
  return createHash("sha256").update(`vaka:mfa-secret:${SECURITY_SECRET}`).digest();
}

function encryptSecret(secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return {
    encryptedSecret: encrypted.toString("base64url"),
    secretIv: iv.toString("base64url"),
    secretTag: cipher.getAuthTag().toString("base64url"),
  };
}

function decryptSecret(factor: typeof schema.userMfaFactors.$inferSelect): string {
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(factor.secretIv, "base64url"));
  decipher.setAuthTag(Buffer.from(factor.secretTag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(factor.encryptedSecret, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function totpFor(secret: string, counter: number): string {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", base32Decode(secret)).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24)
    | ((digest[offset + 1] & 0xff) << 16)
    | ((digest[offset + 2] & 0xff) << 8)
    | (digest[offset + 3] & 0xff);
  return String(binary % (10 ** TOTP_DIGITS)).padStart(TOTP_DIGITS, "0");
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function verifyTotp(secret: string, code: string, now = Date.now()): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const counter = Math.floor(now / 1000 / TOTP_STEP_SECONDS);
  return [-1, 0, 1].some((offset) => safeEqual(totpFor(secret, counter + offset), code));
}

function recoveryCodes() {
  return Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    const value = randomBytes(6).toString("hex").toUpperCase();
    return `VAKA-${value.slice(0, 4)}-${value.slice(4, 8)}-${value.slice(8, 12)}`;
  });
}

async function findRecoveryCandidate(email: string, subdomain?: string): Promise<SecurityUser | null> {
  const normalizedEmail = email.toLowerCase().trim();
  if (subdomain?.trim()) {
    const [tenant] = await db.select({ id: schema.tenants.id }).from(schema.tenants)
      .where(eq(schema.tenants.subdomain, subdomain.toLowerCase().trim()));
    if (!tenant) return null;
    const candidates = await db.select().from(schema.users).where(and(
      eq(schema.users.email, normalizedEmail),
      eq(schema.users.tenantId, tenant.id),
      eq(schema.users.status, "active"),
    ));
    return candidates.length === 1 ? candidates[0] : null;
  }
  const candidates = await db.select().from(schema.users).where(and(
    eq(schema.users.email, normalizedEmail),
    eq(schema.users.status, "active"),
  ));
  return candidates.length === 1 ? candidates[0] : null;
}

export async function requestPasswordReset(
  email: string,
  subdomain?: string,
  notificationService: NotificationServiceContract = platformKernel().container.get(NOTIFICATION_SERVICE),
) {
  const user = await findRecoveryCandidate(email, subdomain);
  if (!user) return { accepted: true };
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashOpaque(token, "password-reset");
  const expiresAt = new Date(Date.now() + RESET_TTL_MS);
  const [request] = await db.transaction(async (tx) => {
    await tx.update(schema.passwordResetRequests).set({ usedAt: new Date() }).where(and(
      eq(schema.passwordResetRequests.userId, user.id),
      isNull(schema.passwordResetRequests.usedAt),
    ));
    const rows = await tx.insert(schema.passwordResetRequests).values({
      userId: user.id,
      tenantId: user.tenantId,
      tokenHash,
      expiresAt,
    }).returning();
    await securityAudit(tx, user, user.tenantId
      ? "security.password_reset_requested"
      : "platform_admin.password_reset_requested");
    return rows;
  });
  const resetUrl = `${publicAppUrl()}/?resetToken=${encodeURIComponent(token)}`;
  try {
    await notificationService.send({
      id: request.id,
      tenantId: user.tenantId ?? PLATFORM_NOTIFICATION_SCOPE,
      actorUserId: null,
      to: user.email,
      userId: user.tenantId ? user.id : undefined,
      channel: "email",
      template: "security.password_reset.v1",
      locale: "en",
      data: {
        fullName: user.fullName,
        resetUrl,
        expiresInMinutes: "30",
      },
      category: "security",
      priority: "high",
      objectRef: { objectType: "User", objectId: user.id },
      correlationId: request.id,
      sensitiveVariableKeys: ["resetUrl"],
      dedupeKey: `password-reset:${request.id}`,
    });
    await db.update(schema.passwordResetRequests).set({ deliveryStatus: "SENT" })
      .where(eq(schema.passwordResetRequests.id, request.id));
  } catch {
    await db.update(schema.passwordResetRequests).set({ deliveryStatus: "FAILED" })
      .where(eq(schema.passwordResetRequests.id, request.id));
  }
  return { accepted: true };
}

export async function completePasswordReset(token: string, newPassword: string) {
  if (newPassword.length < 12 || newPassword.length > 256) {
    throw badRequest("New password must be between 12 and 256 characters");
  }
  const tokenHash = hashOpaque(token, "password-reset");
  return db.transaction(async (tx) => {
    const result = await tx.execute(sql`
      SELECT id, user_id FROM password_reset_requests
      WHERE token_hash = ${tokenHash} AND used_at IS NULL AND expires_at > NOW()
      FOR UPDATE
    `);
    const row = (result as unknown as { rows: Array<{ id: string; user_id: string }> }).rows[0];
    if (!row) throw unauthorized("This password reset link is invalid or has expired");
    const [user] = await tx.select().from(schema.users).where(and(
      eq(schema.users.id, row.user_id),
      eq(schema.users.status, "active"),
    ));
    if (!user) throw unauthorized("This password reset link is invalid or has expired");
    if (await bcrypt.compare(newPassword, user.passwordHash)) throw badRequest("Choose a password you have not just used");
    await tx.update(schema.users).set({
      passwordHash: await bcrypt.hash(newPassword, 12),
      mustChangePassword: false,
    }).where(eq(schema.users.id, user.id));
    await tx.update(schema.passwordResetRequests).set({ usedAt: new Date() })
      .where(eq(schema.passwordResetRequests.id, row.id));
    await tx.update(schema.userSessions).set({
      revokedAt: new Date(),
      revokedBy: user.id,
      revokedReason: "password_reset",
    }).where(and(eq(schema.userSessions.userId, user.id), isNull(schema.userSessions.revokedAt)));
    await securityAudit(tx, user, user.tenantId
      ? "security.password_reset_completed"
      : "platform_admin.password_reset_completed", { sessionsRevoked: true });
    return { changed: true };
  });
}

export async function hasVerifiedMfa(userId: string): Promise<boolean> {
  const [factor] = await db.select({ id: schema.userMfaFactors.id }).from(schema.userMfaFactors).where(and(
    eq(schema.userMfaFactors.userId, userId),
    eq(schema.userMfaFactors.status, "VERIFIED"),
  ));
  return Boolean(factor);
}

export function createMfaLoginChallenge(userId: string): string {
  return jwt.sign({ sub: userId, purpose: "mfa-login" }, SECRET, { expiresIn: "5m" });
}

/**
 * P9-011: verify a TOTP or one-time recovery code for the user's VERIFIED
 * factor inside the caller's transaction. Locks the factor row so a recovery
 * code is consumed exactly once (the existing atomic path). Returns the
 * verified method, or null when the factor is missing or the code is wrong.
 */
export async function verifyMfaCodeWithinTransaction(
  tx: DB, userId: string, code: string,
): Promise<"totp" | "recovery" | null> {
  const result = await tx.execute(sql`
    SELECT id FROM user_mfa_factors
    WHERE user_id = ${userId} AND status = 'VERIFIED'
    FOR UPDATE
  `);
  const raw = (result as unknown as { rows: Array<Record<string, unknown>> }).rows[0];
  if (!raw) return null;
  const [factor] = await tx.select().from(schema.userMfaFactors)
    .where(eq(schema.userMfaFactors.id, String(raw.id)));
  if (!factor) return null;
  return verifyFactorCode(tx, factor, code);
}

async function verifyFactorCode(
  tx: DB,
  factor: typeof schema.userMfaFactors.$inferSelect,
  code: string,
): Promise<"totp" | "recovery" | null> {
  const normalized = code.trim().toUpperCase();
  if (verifyTotp(decryptSecret(factor), normalized)) return "totp";
  const recoveryHash = hashOpaque(normalized, "mfa-recovery");
  if (!factor.recoveryCodeHashes.includes(recoveryHash)) return null;
  await tx.update(schema.userMfaFactors).set({
    recoveryCodeHashes: factor.recoveryCodeHashes.filter((hash) => hash !== recoveryHash),
    updatedAt: new Date(),
  }).where(eq(schema.userMfaFactors.id, factor.id));
  return "recovery";
}

export async function verifyMfaLogin(challengeToken: string, code: string) {
  let payload: jwt.JwtPayload;
  try {
    const verified = jwt.verify(challengeToken, SECRET);
    if (typeof verified === "string") throw new Error("Invalid challenge");
    payload = verified;
  } catch {
    throw unauthorized("Two-factor challenge is invalid or expired");
  }
  if (payload.purpose !== "mfa-login" || typeof payload.sub !== "string") {
    throw unauthorized("Two-factor challenge is invalid or expired");
  }
  const challengeUserId = payload.sub;
  return db.transaction(async (tx) => {
    const result = await tx.execute(sql`
      SELECT * FROM user_mfa_factors
      WHERE user_id = ${challengeUserId} AND status = 'VERIFIED'
      FOR UPDATE
    `);
    const raw = (result as unknown as { rows: Array<Record<string, unknown>> }).rows[0];
    if (!raw) throw unauthorized("Two-factor authentication is not available");
    const [factor] = await tx.select().from(schema.userMfaFactors)
      .where(eq(schema.userMfaFactors.id, String(raw.id)));
    const method = await verifyFactorCode(tx, factor, code);
    if (!method) throw unauthorized("Invalid authentication code");
    const [user] = await tx.select().from(schema.users).where(and(
      eq(schema.users.id, challengeUserId),
      eq(schema.users.status, "active"),
    ));
    if (!user) throw unauthorized();
    await securityAudit(tx, user, user.tenantId
      ? "security.mfa_login_verified"
      : "platform_admin.mfa_login_verified", { method });
    return { userId: user.id };
  });
}

export async function mfaStatus(userId: string) {
  const [factor] = await db.select({
    status: schema.userMfaFactors.status,
    recoveryCodeHashes: schema.userMfaFactors.recoveryCodeHashes,
    verifiedAt: schema.userMfaFactors.verifiedAt,
  }).from(schema.userMfaFactors).where(eq(schema.userMfaFactors.userId, userId));
  return {
    available: mfaEnrollmentAvailable(),
    enabled: factor?.status === "VERIFIED",
    pending: factor?.status === "PENDING",
    recoveryCodesRemaining: factor?.status === "VERIFIED" ? factor.recoveryCodeHashes.length : 0,
    verifiedAt: factor?.verifiedAt ?? null,
  };
}

export async function beginMfaEnrollment(userId: string) {
  if (!mfaEnrollmentAvailable()) {
    throw new AppError(503, "Two-factor setup is temporarily unavailable while security configuration is completed", "MFA_SETUP_UNAVAILABLE");
  }
  const [user] = await db.select().from(schema.users).where(and(
    eq(schema.users.id, userId),
    eq(schema.users.status, "active"),
  ));
  if (!user) throw unauthorized();
  if (await hasVerifiedMfa(user.id)) throw badRequest("Two-factor authentication is already enabled");
  const secret = base32Encode(randomBytes(20));
  const encrypted = encryptSecret(secret);
  await db.transaction(async (tx) => {
    await tx.insert(schema.userMfaFactors).values({
      userId: user.id,
      ...encrypted,
      status: "PENDING",
      recoveryCodeHashes: [],
    }).onConflictDoUpdate({
      target: schema.userMfaFactors.userId,
      set: { ...encrypted, status: "PENDING", recoveryCodeHashes: [], verifiedAt: null, updatedAt: new Date() },
    });
    await securityAudit(tx, user, user.tenantId
      ? "security.mfa_enrollment_started"
      : "platform_admin.mfa_enrollment_started");
  });
  const label = encodeURIComponent(`VAKA:${user.email}`);
  return {
    secret,
    otpauthUri: `otpauth://totp/${label}?secret=${secret}&issuer=VAKA&algorithm=SHA1&digits=6&period=30`,
  };
}

export async function verifyMfaEnrollment(userId: string, code: string) {
  const codes = recoveryCodes();
  return db.transaction(async (tx) => {
    const [factor] = await tx.select().from(schema.userMfaFactors).where(and(
      eq(schema.userMfaFactors.userId, userId),
      eq(schema.userMfaFactors.status, "PENDING"),
    ));
    if (!factor || !verifyTotp(decryptSecret(factor), code.trim())) {
      throw unauthorized("Invalid authentication code");
    }
    const [user] = await tx.select().from(schema.users).where(eq(schema.users.id, userId));
    if (!user) throw unauthorized();
    await tx.update(schema.userMfaFactors).set({
      status: "VERIFIED",
      recoveryCodeHashes: codes.map((value) => hashOpaque(value, "mfa-recovery")),
      verifiedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(schema.userMfaFactors.id, factor.id));
    await tx.update(schema.userSessions).set({
      revokedAt: new Date(),
      revokedBy: user.id,
      revokedReason: "mfa_enabled",
    }).where(and(eq(schema.userSessions.userId, user.id), isNull(schema.userSessions.revokedAt)));
    await securityAudit(tx, user, user.tenantId
      ? "security.mfa_enabled"
      : "platform_admin.mfa_enabled", { sessionsRevoked: true, recoveryCodeCount: codes.length });
    return { enabled: true, recoveryCodes: codes, requiresLogin: true };
  });
}

export async function replaceMfaRecoveryCodes(userId: string, password: string, code: string) {
  const codes = recoveryCodes();
  return db.transaction(async (tx) => {
    const [user] = await tx.select().from(schema.users).where(eq(schema.users.id, userId));
    const [factor] = await tx.select().from(schema.userMfaFactors).where(and(
      eq(schema.userMfaFactors.userId, userId),
      eq(schema.userMfaFactors.status, "VERIFIED"),
    ));
    if (!user || !factor || !await bcrypt.compare(password, user.passwordHash)) throw unauthorized("Current password is incorrect");
    if (!verifyTotp(decryptSecret(factor), code.trim())) throw unauthorized("Invalid authentication code");
    await tx.update(schema.userMfaFactors).set({
      recoveryCodeHashes: codes.map((value) => hashOpaque(value, "mfa-recovery")),
      updatedAt: new Date(),
    }).where(eq(schema.userMfaFactors.id, factor.id));
    await securityAudit(tx, user, user.tenantId
      ? "security.mfa_recovery_codes_replaced"
      : "platform_admin.mfa_recovery_codes_replaced", { recoveryCodeCount: codes.length });
    return { recoveryCodes: codes };
  });
}

export async function disableMfa(userId: string, password: string, code: string) {
  return db.transaction(async (tx) => {
    const [user] = await tx.select().from(schema.users).where(eq(schema.users.id, userId));
    const [factor] = await tx.select().from(schema.userMfaFactors).where(and(
      eq(schema.userMfaFactors.userId, userId),
      eq(schema.userMfaFactors.status, "VERIFIED"),
    ));
    if (!user || !factor || !await bcrypt.compare(password, user.passwordHash)) throw unauthorized("Current password is incorrect");
    const method = await verifyFactorCode(tx, factor, code);
    if (!method) throw unauthorized("Invalid authentication code");
    await tx.delete(schema.userMfaFactors).where(eq(schema.userMfaFactors.id, factor.id));
    await tx.update(schema.userSessions).set({
      revokedAt: new Date(),
      revokedBy: user.id,
      revokedReason: "mfa_disabled",
    }).where(and(eq(schema.userSessions.userId, user.id), isNull(schema.userSessions.revokedAt)));
    await securityAudit(tx, user, user.tenantId
      ? "security.mfa_disabled"
      : "platform_admin.mfa_disabled", { method, sessionsRevoked: true });
    return { disabled: true, requiresLogin: true };
  });
}
