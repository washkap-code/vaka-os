// ============================================================================
// P9-011 — Privileged recent reauthentication ("step-up").
//
// A fresh password — and, when the user has a verified MFA factor, a TOTP or
// one-time recovery code — is required before selected destructive actions.
// The proof is a stateless, signed HS256 token bound to the current server
// session with a maximum ten-minute life. It is never persisted server-side
// and grants no permission of its own: every protected route runs its normal
// permission, ownership and audit checks first and independently.
// ============================================================================
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import type { NextFunction, Response } from "express";
import { and, eq } from "drizzle-orm";
import { AppError, audit, db, schema, unauthorized, type DB } from "./lib.js";
import { jwtSecret } from "./config.js";
import { verifyMfaCodeWithinTransaction } from "./auth-security.js";
import type { AuthedRequest } from "./auth.js";

const JWT_SECRET = jwtSecret();
const STEP_UP_PURPOSE = "privileged-step-up";
const STEP_UP_TTL_SECONDS = 600; // maximum ten minutes
export const STEP_UP_HEADER = "X-Vaka-Step-Up";

const stepUpRequired = () =>
  new AppError(428, "Recent reauthentication is required for this action", "STEP_UP_REQUIRED");

type StepUpAuth = {
  userId: string;
  tenantId: string | null;
  sessionId: string | null;
  assuranceLevel: "aal1" | "aal2";
};

type VerificationOutcome =
  | { ok: true; method: "password" | "totp" | "recovery" }
  | { ok: false; failure: "password" | "mfa_code" };

/**
 * Verify a fresh password (and MFA code when enrolled) for the authenticated
 * active identity, then issue a session-bound proof. Failures are audited
 * with a bounded failure class and surface as a generic 401. The proof is
 * returned to the caller for in-memory use only — it must never be persisted,
 * logged, audited or placed in storage or URLs.
 */
export async function performStepUp(auth: StepUpAuth, currentPassword: string, code?: string) {
  // A proof binds to exactly one current server session.
  if (!auth.sessionId) throw unauthorized("Reauthentication failed");

  const outcome = await db.transaction(async (tx): Promise<VerificationOutcome | "mfa_prompt_required"> => {
    const [user] = await tx.select().from(schema.users).where(and(
      eq(schema.users.id, auth.userId),
      eq(schema.users.status, "active"),
    ));
    if (!user || !await bcrypt.compare(currentPassword, user.passwordHash)) {
      return { ok: false, failure: "password" };
    }
    const [factor] = await tx.select({ id: schema.userMfaFactors.id })
      .from(schema.userMfaFactors).where(and(
        eq(schema.userMfaFactors.userId, user.id),
        eq(schema.userMfaFactors.status, "VERIFIED"),
      ));
    if (!factor) {
      await recordStepUpAudit(tx, auth, "completed", { method: "password" });
      return { ok: true, method: "password" };
    }
    // MFA is enrolled: an explicit authenticated prompt requirement, not a
    // generic failure, when the code is missing.
    if (!code?.trim()) return "mfa_prompt_required";
    const method = await verifyMfaCodeWithinTransaction(tx, user.id, code);
    if (!method) return { ok: false, failure: "mfa_code" };
    await recordStepUpAudit(tx, auth, "completed", { method });
    return { ok: true, method };
  });

  if (outcome === "mfa_prompt_required") {
    throw new AppError(401, "Enter your authenticator or recovery code to continue", "STEP_UP_MFA_REQUIRED");
  }
  if (outcome.ok === false) {
    // Redacted, privacy-minimised security evidence; committed independently
    // of the failed verification.
    await recordStepUpAudit(db, auth, "failed", { failure: outcome.failure });
    throw unauthorized("Reauthentication failed");
  }

  const proof = jwt.sign(
    {
      purpose: STEP_UP_PURPOSE,
      sub: auth.userId,
      sid: auth.sessionId,
      tenantId: auth.tenantId,
      aal: auth.assuranceLevel,
      jti: randomUUID(),
    },
    JWT_SECRET,
    { algorithm: "HS256", expiresIn: STEP_UP_TTL_SECONDS },
  );
  return { proof, expiresInSeconds: STEP_UP_TTL_SECONDS, method: outcome.method };
}

// Metadata is limited to session id, assurance/method and a bounded failure
// class — never a password, code, proof or raw request material.
async function recordStepUpAudit(
  writer: DB, auth: StepUpAuth, result: "completed" | "failed",
  detail: { method?: "password" | "totp" | "recovery"; failure?: "password" | "mfa_code" },
) {
  const metadata = {
    sessionId: auth.sessionId,
    assurance: auth.assuranceLevel,
    ...(detail.method ? { method: detail.method } : {}),
    ...(detail.failure ? { failure: detail.failure } : {}),
  };
  if (auth.tenantId) {
    await audit(writer, auth.tenantId, auth.userId, `security.step_up_${result}`, "session",
      auth.sessionId ?? undefined, metadata);
  } else {
    await writer.insert(schema.platformAuditLogs).values({
      userId: auth.userId,
      action: `platform_admin.step_up_${result}`,
      metadata,
    });
  }
}

/**
 * Validate the step-up proof presented in the X-Vaka-Step-Up header against
 * the current authenticated context: explicit algorithm, purpose, expiry,
 * user, session and tenant binding. Any deficiency is 428 STEP_UP_REQUIRED
 * and the protected operation does not run.
 */
export function assertStepUpProof(req: AuthedRequest): void {
  const value = req.header(STEP_UP_HEADER)?.trim();
  if (!value) throw stepUpRequired();
  let payload: jwt.JwtPayload;
  try {
    const verified = jwt.verify(value, JWT_SECRET, { algorithms: ["HS256"] });
    if (typeof verified === "string") throw new Error("unexpected payload");
    payload = verified;
  } catch {
    throw stepUpRequired();
  }
  const auth = req.auth;
  if (
    !auth?.sessionId
    || payload.purpose !== STEP_UP_PURPOSE
    || payload.sub !== auth.userId
    || payload.sid !== auth.sessionId
    || (payload.tenantId ?? null) !== (auth.tenantId ?? null)
  ) {
    throw stepUpRequired();
  }
}

/** Route middleware for actions that always require a step-up proof. */
export function requireStepUp(req: AuthedRequest, _res: Response, next: NextFunction) {
  try {
    assertStepUpProof(req);
    next();
  } catch (error) {
    next(error);
  }
}
