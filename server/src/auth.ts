// ============================================================================
// AUTH & MIDDLEWARE — JWT auth, tenant signup (with role/CoA/warehouse/plan
// seeding), and the three security gates every request passes through:
//   1. authenticate  — valid JWT, active user
//   2. tenantGate    — token tenant matches, tenant lifecycle status enforced
//   3. requirePermission — RBAC check against the user's role
// ============================================================================
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { AppError, db, schema, unauthorized, forbidden, badRequest, conflict, notFound, DEFAULT_ROLES, audit, Permission } from "./lib.js";
import { seedChartOfAccounts } from "./accounting.js";
import { accessLevelFor } from "./billing.js";
import { jwtSecret } from "./config.js";
import { captureReferralAttribution } from "./referrals.js";
import { STANDARD_TRIAL_DAYS } from "./commercial.js";
import { createMfaLoginChallenge, hasVerifiedMfa } from "./auth-security.js";
import type { PlatformPermission } from "./platform-staff.js";

const JWT_SECRET = jwtSecret();
const ACCESS_TTL = "1h";
const REFRESH_COOKIE = "vaka_refresh";
const REFRESH_COOKIE_PATH = "/api/v1/auth";
const REFRESH_IDLE_MS = 30 * 86_400_000;

export interface AuthedRequest extends Request {
  auth?: {
    userId: string; tenantId: string | null; isPlatformAdmin: boolean;
    isTenantOwner: boolean; sessionId: string | null;
    mustChangePassword: boolean;
    permissions: string[]; accessLevel: "full" | "readonly" | "export_only";
    platformRoleKey: string | null; platformRoleName: string | null;
    platformPermissions: string[]; assuranceLevel: "aal1" | "aal2";
  };
}

// ---------------------------------------------------------------------------
// Signup: creates tenant + owner + roles + CoA + default warehouse + trial
// subscription in one transaction. A tenant is never half-created.
// ---------------------------------------------------------------------------
export async function signupTenant(opts: {
  companyName: string; subdomain: string; baseCurrency: "USD" | "ZWG";
  ownerEmail: string; ownerPassword: string; ownerName: string; planName?: string;
  referralCode?: string;
}) {
  const sub = opts.subdomain.toLowerCase().trim();
  if (!/^[a-z0-9][a-z0-9-]{2,30}$/.test(sub)) throw badRequest("Subdomain must be 3-31 chars, lowercase letters/numbers/hyphens");
  if (opts.ownerPassword.length < 10) throw badRequest("Password must be at least 10 characters");
  const passwordHash = await bcrypt.hash(opts.ownerPassword, 12);

  return db.transaction(async (tx) => {
    const existing = await tx.select().from(schema.tenants).where(eq(schema.tenants.subdomain, sub));
    if (existing.length) throw conflict("Subdomain already taken");

    const trialEndsAt = new Date(Date.now() + STANDARD_TRIAL_DAYS * 86_400_000);
    const [tenant] = await tx.insert(schema.tenants).values({
      companyName: opts.companyName, subdomain: sub,
      baseCurrency: opts.baseCurrency, status: "TRIAL", trialEndsAt,
    }).returning();

    // roles
    const roleRows = await tx.insert(schema.roles).values(DEFAULT_ROLES.map((r) => ({
      tenantId: tenant.id, name: r.name, permissions: r.permissions, isSystem: true,
    }))).returning();
    const ownerRole = roleRows.find((r) => r.name === "Owner")!;

    // owner user
    const [owner] = await tx.insert(schema.users).values({
      tenantId: tenant.id, email: opts.ownerEmail.toLowerCase(), passwordHash,
      fullName: opts.ownerName, roleId: ownerRole.id,
    }).returning();
    await tx.insert(schema.tenantOwnerships).values({
      tenantId: tenant.id,
      ownerUserId: owner.id,
    });
    await audit(tx, tenant.id, owner.id, "security.tenant_ownership_established",
      "tenant_ownership", tenant.id, { source: "signup" });

    // chart of accounts + default warehouse
    await seedChartOfAccounts(tx, tenant.id);
    await tx.insert(schema.warehouses).values({ tenantId: tenant.id, name: "Main Warehouse", isDefault: true });

    // trial subscription on chosen (or Starter) plan
    const planName = opts.planName ?? "Starter";
    const [plan] = await tx.select().from(schema.plans).where(eq(schema.plans.name, planName));
    if (!plan) throw badRequest(`Unknown plan: ${planName}`);
    await tx.insert(schema.subscriptions).values({
      tenantId: tenant.id, planId: plan.id, status: "TRIALING",
      currentPeriodStart: new Date(), currentPeriodEnd: trialEndsAt, trialEnd: trialEndsAt,
    });

    if (opts.referralCode) {
      const { attribution, referral } = await captureReferralAttribution(tx, {
        referralCode: opts.referralCode,
        referredTenantId: tenant.id,
        ownerEmail: opts.ownerEmail,
      });
      await audit(tx, tenant.id, owner.id, "referral.attribution_captured",
        "referral_attribution", attribution.id, {
          referralCodeId: referral.id,
          program: referral.program,
          ruleVersion: referral.ruleVersion,
        });
    }

    await audit(tx, tenant.id, owner.id, "tenant.created", "tenant", tenant.id,
      { plan: planName, baseCurrency: opts.baseCurrency });
    return { tenant, owner };
  });
}

type LoginContext = { clientType?: string; appVersion?: string; userAgent?: string; ip?: string };

const hashSessionValue = (value: string) => createHash("sha256").update(`${JWT_SECRET}:${value}`).digest("hex");
const hashRefreshValue = (value: string) => createHmac("sha256", JWT_SECRET).update(`refresh:${value}`).digest("hex");
const newRefreshCredential = () => randomBytes(32).toString("base64url");

type SessionUser = typeof schema.users.$inferSelect;

function signAccessToken(user: SessionUser, sessionId: string, assuranceLevel: "aal1" | "aal2") {
  return jwt.sign(
    {
      sub: user.id, tenantId: user.tenantId, admin: user.isPlatformAdmin,
      sid: sessionId, aal: assuranceLevel, jti: randomUUID(),
    },
    JWT_SECRET, { expiresIn: ACCESS_TTL },
  );
}

export function setRefreshCookie(res: Response, credential: string) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${REFRESH_COOKIE}=${credential}; Path=${REFRESH_COOKIE_PATH}; Max-Age=${REFRESH_IDLE_MS / 1000}; HttpOnly; SameSite=Strict${secure}`);
}

export function clearRefreshCookie(res: Response) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${REFRESH_COOKIE}=; Path=${REFRESH_COOKIE_PATH}; Max-Age=0; HttpOnly; SameSite=Strict${secure}`);
}

export function refreshCredentialFromCookie(cookieHeader?: string): string | null {
  if (!cookieHeader) return null;
  const raw = cookieHeader.split(";").map((part) => part.trim())
    .find((part) => part.startsWith(`${REFRESH_COOKIE}=`))?.slice(REFRESH_COOKIE.length + 1);
  if (!raw || !/^[A-Za-z0-9_-]{43}$/.test(raw)) return null;
  return raw;
}

export async function createTenantUser(opts: {
  tenantId: string; actorUserId: string; email: string; fullName: string; roleId: string; initialPassword?: string;
}) {
  const email = opts.email.toLowerCase().trim();
  const temporaryPassword = opts.initialPassword?.trim() || randomUUID().replace(/-/g, "").slice(0, 20);
  if (temporaryPassword.length < 12) throw badRequest("Temporary password must be at least 12 characters");
  return db.transaction(async (tx) => {
    const [role] = await tx.select({ id: schema.roles.id, name: schema.roles.name }).from(schema.roles).where(and(
      eq(schema.roles.id, opts.roleId), eq(schema.roles.tenantId, opts.tenantId),
    ));
    if (!role || role.name === "Owner") throw badRequest("Select a non-owner tenant role");
    const [existing] = await tx.select({ id: schema.users.id }).from(schema.users).where(and(
      eq(schema.users.tenantId, opts.tenantId), eq(schema.users.email, email),
    ));
    if (existing) throw conflict("A user with that email already exists in this workspace");
    const [user] = await tx.insert(schema.users).values({
      tenantId: opts.tenantId,
      email,
      fullName: opts.fullName.trim(),
      passwordHash: await bcrypt.hash(temporaryPassword, 12),
      roleId: role.id,
      mustChangePassword: true,
      status: "active",
    }).returning({ id: schema.users.id, email: schema.users.email, fullName: schema.users.fullName, roleId: schema.users.roleId });
    await audit(tx, opts.tenantId, opts.actorUserId, "security.user_created", "user", user.id, {
      role: role.name, temporaryPassword: true,
    });
    return { user, role: role.name, temporaryPassword };
  });
}

export async function setTenantUserStatus(opts: {
  tenantId: string; actorUserId: string; userId: string; status: "active" | "disabled";
}) {
  return db.transaction(async (tx) => {
    const [target] = await tx.select({ id: schema.users.id, status: schema.users.status })
      .from(schema.users).where(and(eq(schema.users.id, opts.userId), eq(schema.users.tenantId, opts.tenantId)));
    if (!target) throw notFound("User not found");
    if (target.id === opts.actorUserId) throw badRequest("You cannot disable your own account");
    const [ownership] = await tx.select({ tenantId: schema.tenantOwnerships.tenantId })
      .from(schema.tenantOwnerships).where(and(
        eq(schema.tenantOwnerships.tenantId, opts.tenantId),
        eq(schema.tenantOwnerships.ownerUserId, target.id),
      ));
    if (ownership) throw badRequest("The accountable Owner cannot be disabled");
    const [updated] = await tx.update(schema.users).set({ status: opts.status }).where(eq(schema.users.id, target.id))
      .returning({ id: schema.users.id, status: schema.users.status });
    if (opts.status === "disabled") {
      await tx.update(schema.userSessions).set({ revokedAt: new Date(), revokedBy: opts.actorUserId, revokedReason: "user_disabled" })
        .where(and(eq(schema.userSessions.userId, target.id), isNull(schema.userSessions.revokedAt)));
    }
    await audit(tx, opts.tenantId, opts.actorUserId, `security.user_${opts.status}`, "user", target.id, { previousStatus: target.status });
    return updated;
  });
}

export async function login(email: string, password: string, subdomain?: string, context: LoginContext = {}) {
  const normalizedEmail = email.toLowerCase().trim();
  let candidates;
  if (subdomain) {
    const [tenant] = await db.select().from(schema.tenants).where(eq(schema.tenants.subdomain, subdomain.toLowerCase().trim()));
    if (!tenant) throw unauthorized("Invalid credentials");
    candidates = await db.select().from(schema.users).where(and(
      eq(schema.users.tenantId, tenant.id),
      eq(schema.users.email, normalizedEmail),
      eq(schema.users.status, "active"),
    ));
  } else {
    candidates = await db.select().from(schema.users).where(and(
      eq(schema.users.email, normalizedEmail),
      eq(schema.users.status, "active"),
    ));
  }
  const passwordMatches = await Promise.all(candidates.map(async (candidate) => ({
    candidate,
    matches: await bcrypt.compare(password, candidate.passwordHash),
  })));
  const matchedUsers = passwordMatches.filter(({ matches }) => matches).map(({ candidate }) => candidate);
  if (matchedUsers.length !== 1) throw unauthorized(
    matchedUsers.length > 1 ? "Enter your company subdomain to select the correct workspace" : "Invalid credentials",
  );
  const [user] = matchedUsers;
  if (await hasVerifiedMfa(user.id)) {
    return {
      mfaRequired: true as const,
      challengeToken: createMfaLoginChallenge(user.id),
      token: "",
      user: {
        id: user.id, email: user.email, fullName: user.fullName,
        tenantId: user.tenantId, isPlatformAdmin: user.isPlatformAdmin,
        mustChangePassword: user.mustChangePassword,
      },
    };
  }
  return issueAuthenticatedSession(user.id, context, "aal1");
}

export async function issueAuthenticatedSession(
  userId: string,
  context: LoginContext = {},
  assuranceLevel: "aal1" | "aal2" = "aal1",
) {
  const [user] = await db.select().from(schema.users).where(and(
    eq(schema.users.id, userId),
    eq(schema.users.status, "active"),
  ));
  if (!user) throw unauthorized("Invalid credentials");
  if (assuranceLevel === "aal1" && await hasVerifiedMfa(user.id)) {
    throw unauthorized("Two-factor authentication required");
  }
  await db.update(schema.users).set({ lastLoginAt: new Date() }).where(eq(schema.users.id, user.id));

  const sessionId = randomUUID();
  const token = signAccessToken(user, sessionId, assuranceLevel);
  const refreshCredential = newRefreshCredential();
  const now = new Date();
  const idleExpiresAt = new Date(now.getTime() + 30 * 86_400_000);
  const absoluteExpiresAt = new Date(now.getTime() + 90 * 86_400_000);
  await db.insert(schema.userSessions).values({
    id: sessionId,
    tenantId: user.tenantId,
    userId: user.id,
    tokenHash: hashSessionValue(token),
    refreshTokenHash: hashRefreshValue(refreshCredential),
    assuranceLevel,
    clientType: context.clientType?.trim().slice(0, 32) || "web",
    appVersion: context.appVersion?.trim().slice(0, 80) || null,
    deviceDescription: context.userAgent?.trim().slice(0, 160) || null,
    ipHash: context.ip ? hashSessionValue(context.ip) : null,
    createdAt: now,
    lastSeenAt: now,
    idleExpiresAt,
    absoluteExpiresAt,
  });
  if (user.tenantId) {
    await audit(db, user.tenantId, user.id, "security.session_created", "session", sessionId, {
      clientType: context.clientType?.trim().slice(0, 32) || "web",
    });
  } else {
    await db.insert(schema.platformAuditLogs).values({ userId: user.id, action: "platform_admin.session_created", metadata: { sessionId } });
  }
  return { mfaRequired: false as const, token, refreshCredential, user: {
    id: user.id, email: user.email, fullName: user.fullName,
    tenantId: user.tenantId, isPlatformAdmin: user.isPlatformAdmin,
    mustChangePassword: user.mustChangePassword,
  } };
}

type RefreshOutcome =
  | { status: "invalid" | "replay" }
  | { status: "refreshed"; token: string; refreshCredential: string; user: {
    id: string; email: string; fullName: string; tenantId: string | null;
    isPlatformAdmin: boolean; mustChangePassword: boolean;
  } };

export async function refreshAuthenticatedSession(credential: string) {
  const credentialHash = hashRefreshValue(credential);
  const outcome: RefreshOutcome = await db.transaction(async (tx) => {
    const result = await tx.execute(sql`
      SELECT s.id, s.tenant_id, s.user_id, s.refresh_token_hash,
        s.previous_refresh_token_hash, s.idle_expires_at, s.absolute_expires_at,
        s.revoked_at, s.assurance_level, u.email, u.full_name,
        u.is_platform_admin, u.must_change_password, u.status
      FROM user_sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.refresh_token_hash = ${credentialHash}
         OR s.previous_refresh_token_hash = ${credentialHash}
      FOR UPDATE OF s
    `);
    const row = (result as unknown as { rows: Array<{
      id: string; tenant_id: string | null; user_id: string;
      refresh_token_hash: string | null; previous_refresh_token_hash: string | null;
      idle_expires_at: Date; absolute_expires_at: Date; revoked_at: Date | null;
      assurance_level: string; email: string; full_name: string;
      is_platform_admin: boolean; must_change_password: boolean; status: string;
    }> }).rows[0];
    if (!row) return { status: "invalid" };

    if (row.previous_refresh_token_hash === credentialHash) {
      const now = new Date();
      await tx.update(schema.userSessions).set({
        revokedAt: now,
        revokedBy: row.user_id,
        revokedReason: "refresh_token_replay",
        refreshTokenHash: null,
        previousRefreshTokenHash: null,
      }).where(eq(schema.userSessions.id, row.id));
      if (row.tenant_id) {
        await audit(tx, row.tenant_id, row.user_id, "security.session_refresh_replay", "session", row.id, {
          action: "session_revoked",
        });
      } else {
        await tx.insert(schema.platformAuditLogs).values({
          userId: row.user_id,
          action: "platform_admin.session_refresh_replay",
          metadata: { sessionId: row.id, action: "session_revoked" },
        });
      }
      return { status: "replay" };
    }

    const now = new Date();
    if (row.revoked_at || row.status !== "active"
      || new Date(row.idle_expires_at) <= now || new Date(row.absolute_expires_at) <= now
      || (row.assurance_level !== "aal1" && row.assurance_level !== "aal2")) {
      return { status: "invalid" };
    }
    const [verifiedFactor] = await tx.select({ id: schema.userMfaFactors.id })
      .from(schema.userMfaFactors).where(and(
        eq(schema.userMfaFactors.userId, row.user_id),
        eq(schema.userMfaFactors.status, "VERIFIED"),
      ));
    if (verifiedFactor && row.assurance_level !== "aal2") return { status: "invalid" };

    const user = {
      id: row.user_id,
      tenantId: row.tenant_id,
      email: row.email,
      fullName: row.full_name,
      isPlatformAdmin: row.is_platform_admin,
      mustChangePassword: row.must_change_password,
      status: row.status,
    } as SessionUser;
    const assuranceLevel = row.assurance_level as "aal1" | "aal2";
    const token = signAccessToken(user, row.id, assuranceLevel);
    const refreshCredential = newRefreshCredential();
    const idleExpiresAt = new Date(Math.min(now.getTime() + REFRESH_IDLE_MS, new Date(row.absolute_expires_at).getTime()));
    await tx.update(schema.userSessions).set({
      tokenHash: hashSessionValue(token),
      previousRefreshTokenHash: row.refresh_token_hash,
      refreshTokenHash: hashRefreshValue(refreshCredential),
      refreshRotatedAt: now,
      lastSeenAt: now,
      idleExpiresAt,
    }).where(eq(schema.userSessions.id, row.id));
    if (row.tenant_id) {
      await audit(tx, row.tenant_id, row.user_id, "security.session_refreshed", "session", row.id);
    } else {
      await tx.insert(schema.platformAuditLogs).values({
        userId: row.user_id,
        action: "platform_admin.session_refreshed",
        metadata: { sessionId: row.id },
      });
    }
    return {
      status: "refreshed",
      token,
      refreshCredential,
      user: {
        id: row.user_id,
        email: row.email,
        fullName: row.full_name,
        tenantId: row.tenant_id,
        isPlatformAdmin: row.is_platform_admin,
        mustChangePassword: row.must_change_password,
      },
    };
  });
  if (outcome.status !== "refreshed") throw unauthorized("Session renewal failed");
  return outcome;
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
export async function authenticate(req: AuthedRequest, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) throw unauthorized();
    let payload: any;
    try { payload = jwt.verify(header.slice(7), JWT_SECRET); } catch { throw unauthorized("Invalid or expired token"); }

    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, payload.sub));
    if (!user || user.status !== "active") throw unauthorized("User disabled");

    let permissions: string[] = [];
    let isTenantOwner = false;
    let accessLevel: "full" | "readonly" | "export_only" = "full";
    let platformRoleKey: string | null = null;
    let platformRoleName: string | null = null;
    let platformPermissions: string[] = [];
    if (user.tenantId) {
      if (user.roleId) {
        const [role] = await db.select().from(schema.roles).where(eq(schema.roles.id, user.roleId));
        permissions = role?.permissions ?? [];
      }
      const [ownership] = await db.select({ tenantId: schema.tenantOwnerships.tenantId })
        .from(schema.tenantOwnerships).where(and(
          eq(schema.tenantOwnerships.tenantId, user.tenantId),
          eq(schema.tenantOwnerships.ownerUserId, user.id),
        ));
      isTenantOwner = Boolean(ownership);
      const [tenant] = await db.select().from(schema.tenants).where(eq(schema.tenants.id, user.tenantId));
      if (!tenant) throw unauthorized("Tenant not found");
      accessLevel = accessLevelFor(tenant.status);
      (req as any).tenant = tenant;
    } else if (user.isPlatformAdmin && user.platformRoleKey) {
      const [platformRole] = await db.select().from(schema.platformRoles)
        .where(eq(schema.platformRoles.key, user.platformRoleKey));
      if (!platformRole) throw unauthorized("Platform access role is unavailable");
      platformRoleKey = platformRole.key;
      platformRoleName = platformRole.name;
      platformPermissions = platformRole.permissions;
    }
    const mfaEnabled = await hasVerifiedMfa(user.id);
    const assuranceLevel = payload.aal === "aal2" ? "aal2" : "aal1";
    if (mfaEnabled && assuranceLevel !== "aal2") throw unauthorized("Two-factor authentication required");
    const sessionId = typeof payload.sid === "string" ? payload.sid : null;
    if (sessionId) {
      const now = new Date();
      const [session] = await db.select({ id: schema.userSessions.id, lastSeenAt: schema.userSessions.lastSeenAt })
        .from(schema.userSessions).where(and(
          eq(schema.userSessions.id, sessionId),
          eq(schema.userSessions.userId, user.id),
          eq(schema.userSessions.tokenHash, hashSessionValue(header.slice(7))),
          isNull(schema.userSessions.revokedAt),
          gt(schema.userSessions.idleExpiresAt, now),
          gt(schema.userSessions.absoluteExpiresAt, now),
        ));
      if (!session) throw unauthorized("Session ended or expired");
      if (now.getTime() - session.lastSeenAt.getTime() >= 60_000) {
        await db.update(schema.userSessions).set({ lastSeenAt: now }).where(eq(schema.userSessions.id, session.id));
      }
    }
    req.auth = {
      userId: user.id, tenantId: user.tenantId,
      isPlatformAdmin: user.isPlatformAdmin,
      isTenantOwner, sessionId,
      mustChangePassword: user.mustChangePassword,
      permissions, accessLevel,
      platformRoleKey, platformRoleName, platformPermissions, assuranceLevel,
    };
    next();
  } catch (e) { next(e); }
}

export function assertRecentStepUp(req: AuthedRequest) {
  if (!req.auth?.sessionId) throw new AppError(428, "Recent reauthentication is required", "STEP_UP_REQUIRED");
  const proof = req.header("X-Vaka-Step-Up");
  if (!proof) throw new AppError(428, "Recent reauthentication is required", "STEP_UP_REQUIRED");
  try {
    const verified = jwt.verify(proof, JWT_SECRET, { algorithms: ["HS256"] });
    if (typeof verified === "string"
      || verified.purpose !== "privileged-step-up"
      || verified.sub !== req.auth.userId
      || verified.sid !== req.auth.sessionId
      || verified.tenantId !== req.auth.tenantId) {
      throw new Error("Step-up proof context mismatch");
    }
  } catch {
    throw new AppError(428, "Recent reauthentication is required", "STEP_UP_REQUIRED");
  }
}

export function requireRecentStepUp(req: AuthedRequest, _res: Response, next: NextFunction) {
  try {
    assertRecentStepUp(req);
    next();
  } catch (error) {
    next(error);
  }
}

export async function revokeSession(opts: {
  tenantId: string | null; sessionId: string; actorUserId: string; reason: string;
}) {
  const [session] = await db.update(schema.userSessions).set({
    revokedAt: new Date(), revokedBy: opts.actorUserId, revokedReason: opts.reason,
  }).where(and(
    eq(schema.userSessions.id, opts.sessionId),
    opts.tenantId ? eq(schema.userSessions.tenantId, opts.tenantId) : isNull(schema.userSessions.tenantId),
    isNull(schema.userSessions.revokedAt),
  )).returning({ id: schema.userSessions.id, userId: schema.userSessions.userId, tenantId: schema.userSessions.tenantId });
  if (!session) throw notFound("Session not found");
  if (opts.tenantId) {
    await audit(db, opts.tenantId, opts.actorUserId, "security.session_revoked", "session", session.id, { reason: opts.reason, userId: session.userId });
  } else {
    await db.insert(schema.platformAuditLogs).values({ userId: opts.actorUserId, action: "platform_admin.session_revoked", metadata: { sessionId: session.id, reason: opts.reason } });
  }
  return { revoked: true, sessionId: session.id };
}

export function requireTenantOwner(req: AuthedRequest, _res: Response, next: NextFunction) {
  if (req.auth?.tenantId && req.auth.isTenantOwner) return next();
  next(forbidden("Tenant owner access required"));
}

export function requireCompletedPasswordChange(req: AuthedRequest, _res: Response, next: NextFunction) {
  if (!req.auth?.mustChangePassword) return next();
  next(forbidden("Password change required before continuing"));
}

export async function changePassword(opts: {
  userId: string;
  currentPassword: string;
  newPassword: string;
}) {
  if (opts.newPassword.length < 12) {
    throw badRequest("New password must be at least 12 characters");
  }
  if (opts.currentPassword === opts.newPassword) {
    throw badRequest("New password must be different from the temporary password");
  }

  return db.transaction(async (tx) => {
    const [user] = await tx.select().from(schema.users).where(eq(schema.users.id, opts.userId));
    if (!user || user.status !== "active") throw unauthorized();
    if (!await bcrypt.compare(opts.currentPassword, user.passwordHash)) {
      throw unauthorized("Current password is incorrect");
    }

    await tx.update(schema.users).set({
      passwordHash: await bcrypt.hash(opts.newPassword, 12),
      mustChangePassword: false,
    }).where(eq(schema.users.id, user.id));

    if (user.tenantId) {
      await audit(tx, user.tenantId, user.id, "security.password_changed", "user", user.id, {
        forcedChangeCompleted: user.mustChangePassword,
      });
    } else {
      await tx.insert(schema.platformAuditLogs).values({
        userId: user.id,
        action: "platform_admin.password_changed",
        metadata: { forcedChangeCompleted: user.mustChangePassword },
      });
    }
    return { changed: true };
  });
}

/** Lifecycle gate: suspended tenants are read-only (+ billing + export). */
export function lifecycleGate(req: AuthedRequest, _res: Response, next: NextFunction) {
  const a = req.auth!;
  if (!a.tenantId) return next(); // platform admin
  const write = !["GET", "HEAD", "OPTIONS"].includes(req.method);
  const path = req.path;
  const billingOrExport = path.startsWith("/billing") || path.startsWith("/export") || path.startsWith("/auth/logout");
  if (a.accessLevel === "full") return next();
  if (a.accessLevel === "readonly" && (!write || billingOrExport)) return next();
  if (a.accessLevel === "export_only" && billingOrExport) return next();
  return next(forbidden(
    "Account is suspended for non-payment. Your data is safe and retained. " +
    "Settle the outstanding balance under Billing to restore full access, or export your data at any time."));
}

export function requirePermission(...perms: Permission[]) {
  return (req: AuthedRequest, _res: Response, next: NextFunction) => {
    const a = req.auth!;
    if (!a.tenantId) return next(forbidden("This endpoint requires a tenant workspace"));
    if (perms.every((p) => a.permissions.includes(p))) return next();
    next(forbidden(`Missing permission: ${perms.join(", ")}`));
  };
}

export function requirePlatformAdmin(req: AuthedRequest, _res: Response, next: NextFunction) {
  if (req.auth?.isPlatformAdmin && req.auth.platformRoleKey) return next();
  next(forbidden("Platform administrator access required"));
}

export function requirePlatformPermission(...permissions: PlatformPermission[]) {
  return (req: AuthedRequest, _res: Response, next: NextFunction) => {
    if (!req.auth?.isPlatformAdmin || !req.auth.platformRoleKey) {
      return next(forbidden("Platform staff access required"));
    }
    if (permissions.every((permission) => req.auth!.platformPermissions.includes(permission))) return next();
    return next(forbidden(`Missing platform permission: ${permissions.join(", ")}`));
  };
}

/** Convenience: current tenant id or 403. */
export function tenantId(req: AuthedRequest): string {
  const t = req.auth?.tenantId;
  if (!t) throw forbidden("This endpoint requires a tenant context");
  return t;
}
