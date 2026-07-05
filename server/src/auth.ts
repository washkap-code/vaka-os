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
import { and, eq } from "drizzle-orm";
import { db, schema, unauthorized, forbidden, badRequest, conflict, DEFAULT_ROLES, audit, Permission } from "./lib.js";
import { seedChartOfAccounts } from "./accounting.js";
import { accessLevelFor } from "./billing.js";
import { jwtSecret } from "./config.js";

const JWT_SECRET = jwtSecret();
const ACCESS_TTL = "1h";

export interface AuthedRequest extends Request {
  auth?: {
    userId: string; tenantId: string | null; isPlatformAdmin: boolean;
    permissions: string[]; accessLevel: "full" | "readonly" | "export_only";
  };
}

// ---------------------------------------------------------------------------
// Signup: creates tenant + owner + roles + CoA + default warehouse + trial
// subscription in one transaction. A tenant is never half-created.
// ---------------------------------------------------------------------------
export async function signupTenant(opts: {
  companyName: string; subdomain: string; baseCurrency: "USD" | "ZWG";
  ownerEmail: string; ownerPassword: string; ownerName: string; planName?: string;
}) {
  const sub = opts.subdomain.toLowerCase().trim();
  if (!/^[a-z0-9][a-z0-9-]{2,30}$/.test(sub)) throw badRequest("Subdomain must be 3-31 chars, lowercase letters/numbers/hyphens");
  if (opts.ownerPassword.length < 10) throw badRequest("Password must be at least 10 characters");
  const passwordHash = await bcrypt.hash(opts.ownerPassword, 12);

  return db.transaction(async (tx) => {
    const existing = await tx.select().from(schema.tenants).where(eq(schema.tenants.subdomain, sub));
    if (existing.length) throw conflict("Subdomain already taken");

    const trialEndsAt = new Date(); trialEndsAt.setMonth(trialEndsAt.getMonth() + 3); // 3 months free
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

    await audit(tx, tenant.id, owner.id, "tenant.created", "tenant", tenant.id,
      { plan: planName, baseCurrency: opts.baseCurrency });
    return { tenant, owner };
  });
}

export async function login(email: string, password: string, subdomain?: string) {
  let user;
  if (subdomain) {
    const [tenant] = await db.select().from(schema.tenants).where(eq(schema.tenants.subdomain, subdomain.toLowerCase()));
    if (!tenant) throw unauthorized("Invalid credentials");
    [user] = await db.select().from(schema.users).where(and(
      eq(schema.users.tenantId, tenant.id), eq(schema.users.email, email.toLowerCase())));
  } else {
    [user] = await db.select().from(schema.users).where(eq(schema.users.email, email.toLowerCase()));
  }
  if (!user || user.status !== "active") throw unauthorized("Invalid credentials");
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) throw unauthorized("Invalid credentials");
  await db.update(schema.users).set({ lastLoginAt: new Date() }).where(eq(schema.users.id, user.id));

  const token = jwt.sign(
    { sub: user.id, tenantId: user.tenantId, admin: user.isPlatformAdmin },
    JWT_SECRET, { expiresIn: ACCESS_TTL },
  );
  return { token, user: { id: user.id, email: user.email, fullName: user.fullName, tenantId: user.tenantId, isPlatformAdmin: user.isPlatformAdmin } };
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
    let accessLevel: "full" | "readonly" | "export_only" = "full";
    if (user.tenantId) {
      if (user.roleId) {
        const [role] = await db.select().from(schema.roles).where(eq(schema.roles.id, user.roleId));
        permissions = role?.permissions ?? [];
      }
      const [tenant] = await db.select().from(schema.tenants).where(eq(schema.tenants.id, user.tenantId));
      if (!tenant) throw unauthorized("Tenant not found");
      accessLevel = accessLevelFor(tenant.status);
      (req as any).tenant = tenant;
    }
    req.auth = {
      userId: user.id, tenantId: user.tenantId,
      isPlatformAdmin: user.isPlatformAdmin, permissions, accessLevel,
    };
    next();
  } catch (e) { next(e); }
}

/** Lifecycle gate: suspended tenants are read-only (+ billing + export). */
export function lifecycleGate(req: AuthedRequest, _res: Response, next: NextFunction) {
  const a = req.auth!;
  if (!a.tenantId) return next(); // platform admin
  const write = !["GET", "HEAD", "OPTIONS"].includes(req.method);
  const path = req.path;
  const billingOrExport = path.startsWith("/billing") || path.startsWith("/export");
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
    if (a.isPlatformAdmin) return next();
    if (perms.every((p) => a.permissions.includes(p))) return next();
    next(forbidden(`Missing permission: ${perms.join(", ")}`));
  };
}

export function requirePlatformAdmin(req: AuthedRequest, _res: Response, next: NextFunction) {
  if (req.auth?.isPlatformAdmin) return next();
  next(forbidden("Platform administrator access required"));
}

/** Convenience: current tenant id or 403. */
export function tenantId(req: AuthedRequest): string {
  const t = req.auth?.tenantId;
  if (!t) throw forbidden("This endpoint requires a tenant context");
  return t;
}
