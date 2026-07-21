import type { RequestHandler } from "express";
import { hasVerifiedMfa } from "./auth-security.js";

/**
 * SEC-MFA-001 — Mandatory MFA enrollment enforcement for platform admins.
 *
 * Blocks a platform admin who has NOT verified an MFA factor from performing
 * sensitive platform mutations, returning 403 MFA_ENROLLMENT_REQUIRED. Read
 * paths, login, `/me` and the `/auth/mfa/enroll*` routes are never gated, so an
 * un-enrolled admin can still sign in, read, and reach the enrollment flow — they
 * simply cannot perform privileged writes until MFA is on. Non-admins pass
 * straight through and are unaffected.
 *
 * Wire this AFTER the existing auth/step-up middleware on the highest-value
 * platform-admin mutation routes (e.g. platform staff management, tenant
 * feature-flag toggles, platform verification review). Do NOT apply it to
 * `/auth/*`, `/me`, or the MFA enrollment routes.
 *
 * See docs/engineering/mission-packs/SEC-MFA-001/README.md.
 */
export const requirePlatformMfaEnrolled: RequestHandler = async (req, res, next) => {
  try {
    const auth = (req as { auth?: { isPlatformAdmin?: boolean; userId?: string } }).auth;
    if (!auth?.isPlatformAdmin) return next();
    if (auth.userId && (await hasVerifiedMfa(auth.userId))) return next();
    return res.status(403).json({
      error: "MFA_ENROLLMENT_REQUIRED",
      message: "Enable two-factor authentication to perform this action.",
    });
  } catch (error) {
    next(error);
  }
};
