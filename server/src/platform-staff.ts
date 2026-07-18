import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { and, eq, isNull, ne } from "drizzle-orm";
import { badRequest, conflict, db, notFound, schema, type DB } from "./lib.js";

export const PLATFORM_PERMISSIONS = [
  "platform.overview.read",
  "platform.tenants.read",
  "platform.tenant_audit.read",
  "platform.operations.read",
  "platform.billing.run",
  "platform.billing.payment.manage",
  "platform.referrals.manage",
  "platform.backups.read",
  "platform.backups.write",
  "platform.staff.read",
  "platform.staff.manage",
  "platform.security.manage",
  "platform.settings.manage",
  "platform.verification.review",
  "blackbook:editor",
] as const;

export type PlatformPermission = (typeof PLATFORM_PERMISSIONS)[number];

export const PLATFORM_ROLE_DEFINITIONS: ReadonlyArray<{
  key: string; name: string; permissions: PlatformPermission[];
}> = [
  { key: "PRINCIPAL_ADMIN", name: "Principal Administrator", permissions: [...PLATFORM_PERMISSIONS] },
  { key: "OPERATIONS_ADMIN", name: "Operations Administrator", permissions: [
    "platform.overview.read", "platform.tenants.read", "platform.tenant_audit.read",
    "platform.operations.read", "platform.backups.read", "platform.backups.write", "platform.staff.read",
    "platform.verification.review", "blackbook:editor",
  ] },
  { key: "FINANCE_OPERATIONS", name: "Finance Operations", permissions: [
    "platform.overview.read", "platform.tenants.read", "platform.billing.run",
    "platform.billing.payment.manage", "platform.referrals.manage",
  ] },
  { key: "SUPPORT_ANALYST", name: "Support Analyst", permissions: [
    "platform.overview.read", "platform.tenants.read", "platform.tenant_audit.read",
  ] },
  { key: "SECURITY_AUDITOR", name: "Security Auditor", permissions: [
    "platform.overview.read", "platform.tenant_audit.read", "platform.operations.read",
    "platform.backups.read", "platform.staff.read",
  ] },
];

export async function listPlatformRoles() {
  return db.select({
    key: schema.platformRoles.key,
    name: schema.platformRoles.name,
    permissions: schema.platformRoles.permissions,
  }).from(schema.platformRoles).where(ne(schema.platformRoles.key, "PRINCIPAL_ADMIN"));
}

export async function listPlatformStaff() {
  return db.select({
    id: schema.users.id,
    email: schema.users.email,
    fullName: schema.users.fullName,
    status: schema.users.status,
    mustChangePassword: schema.users.mustChangePassword,
    lastLoginAt: schema.users.lastLoginAt,
    platformRoleKey: schema.users.platformRoleKey,
    roleName: schema.platformRoles.name,
    permissions: schema.platformRoles.permissions,
    employeeNumber: schema.platformStaffProfiles.employeeNumber,
    businessFunction: schema.platformStaffProfiles.businessFunction,
    jobTitle: schema.platformStaffProfiles.jobTitle,
    workPhone: schema.platformStaffProfiles.workPhone,
    location: schema.platformStaffProfiles.location,
    managerUserId: schema.platformStaffProfiles.managerUserId,
    employmentState: schema.platformStaffProfiles.employmentState,
    startDate: schema.platformStaffProfiles.startDate,
    endDate: schema.platformStaffProfiles.endDate,
    operationalNotes: schema.platformStaffProfiles.operationalNotes,
  }).from(schema.users)
    .innerJoin(schema.platformRoles, eq(schema.platformRoles.key, schema.users.platformRoleKey))
    .leftJoin(schema.platformStaffProfiles, eq(schema.platformStaffProfiles.userId, schema.users.id))
    .where(and(isNull(schema.users.tenantId), eq(schema.users.isPlatformAdmin, true)));
}

type StaffProfileInput = {
  fullName: string;
  email: string;
  platformRoleKey: string;
  employeeNumber?: string | null;
  businessFunction: string;
  jobTitle: string;
  workPhone?: string | null;
  location?: string | null;
  managerUserId?: string | null;
  employmentState?: "ACTIVE" | "LEAVE" | "ENDED";
  startDate?: string | null;
  endDate?: string | null;
  operationalNotes?: string | null;
};

function generatedTemporaryPassword(): string {
  return `Vaka-${randomBytes(12).toString("base64url")}!7`;
}

async function assertAssignableRole(tx: DB, roleKey: string) {
  if (roleKey === "PRINCIPAL_ADMIN") throw badRequest("Principal Administrator access cannot be delegated here");
  const [role] = await tx.select({ key: schema.platformRoles.key, name: schema.platformRoles.name })
    .from(schema.platformRoles).where(eq(schema.platformRoles.key, roleKey));
  if (!role) throw badRequest("Select a valid platform role");
  return role;
}

async function assertPlatformManager(tx: DB, managerUserId?: string | null, targetUserId?: string) {
  if (!managerUserId) return null;
  if (managerUserId === targetUserId) throw badRequest("A staff member cannot manage themselves");
  const [manager] = await tx.select({ id: schema.users.id }).from(schema.users).where(and(
    eq(schema.users.id, managerUserId),
    isNull(schema.users.tenantId),
    eq(schema.users.isPlatformAdmin, true),
    eq(schema.users.status, "active"),
  ));
  if (!manager) throw badRequest("Select an active VAKA platform staff manager");
  return manager.id;
}

export async function createPlatformStaff(
  actorUserId: string,
  input: StaffProfileInput & { initialPassword?: string },
) {
  const email = input.email.toLowerCase().trim();
  const temporaryPassword = input.initialPassword?.trim() || generatedTemporaryPassword();
  if (temporaryPassword.length < 12) throw badRequest("Temporary password must be at least 12 characters");
  return db.transaction(async (tx) => {
    const role = await assertAssignableRole(tx, input.platformRoleKey);
    const managerUserId = await assertPlatformManager(tx, input.managerUserId);
    const [existing] = await tx.select({ id: schema.users.id }).from(schema.users).where(and(
      isNull(schema.users.tenantId),
      eq(schema.users.email, email),
    ));
    if (existing) throw conflict("A platform staff account with that email already exists");
    const [user] = await tx.insert(schema.users).values({
      tenantId: null,
      email,
      passwordHash: await bcrypt.hash(temporaryPassword, 12),
      fullName: input.fullName.trim(),
      isPlatformAdmin: true,
      platformRoleKey: role.key,
      mustChangePassword: true,
      status: "active",
    }).returning({ id: schema.users.id, email: schema.users.email, fullName: schema.users.fullName });
    await tx.insert(schema.platformStaffProfiles).values({
      userId: user.id,
      employeeNumber: input.employeeNumber || null,
      businessFunction: input.businessFunction.trim(),
      jobTitle: input.jobTitle.trim(),
      workPhone: input.workPhone || null,
      location: input.location || null,
      managerUserId,
      employmentState: input.employmentState ?? "ACTIVE",
      startDate: input.startDate || null,
      endDate: input.endDate || null,
      operationalNotes: input.operationalNotes || null,
      updatedBy: actorUserId,
    });
    await tx.insert(schema.platformAuditLogs).values({
      userId: actorUserId,
      action: "platform.staff_created",
      metadata: {
        staffUserId: user.id,
        roleKey: role.key,
        businessFunction: input.businessFunction.trim(),
        temporaryPassword: true,
      },
    });
    return { user, role: role.name, temporaryPassword };
  });
}

export async function updatePlatformStaff(
  actorUserId: string,
  staffUserId: string,
  input: Omit<StaffProfileInput, "email"> & { status: "active" | "disabled" },
) {
  if (actorUserId === staffUserId) throw badRequest("Use your own Settings page for your profile; you cannot change your own access here");
  return db.transaction(async (tx) => {
    const [target] = await tx.select().from(schema.users).where(and(
      eq(schema.users.id, staffUserId),
      isNull(schema.users.tenantId),
      eq(schema.users.isPlatformAdmin, true),
    ));
    if (!target) throw notFound("Platform staff member not found");
    if (target.platformRoleKey === "PRINCIPAL_ADMIN") throw badRequest("The principal administrator cannot be changed here");
    const role = await assertAssignableRole(tx, input.platformRoleKey);
    const managerUserId = await assertPlatformManager(tx, input.managerUserId, target.id);
    await tx.update(schema.users).set({
      fullName: input.fullName.trim(),
      platformRoleKey: role.key,
      status: input.status,
    }).where(eq(schema.users.id, target.id));
    await tx.insert(schema.platformStaffProfiles).values({
      userId: target.id,
      employeeNumber: input.employeeNumber || null,
      businessFunction: input.businessFunction.trim(),
      jobTitle: input.jobTitle.trim(),
      workPhone: input.workPhone || null,
      location: input.location || null,
      managerUserId,
      employmentState: input.employmentState ?? "ACTIVE",
      startDate: input.startDate || null,
      endDate: input.endDate || null,
      operationalNotes: input.operationalNotes || null,
      updatedBy: actorUserId,
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: schema.platformStaffProfiles.userId,
      set: {
        employeeNumber: input.employeeNumber || null,
        businessFunction: input.businessFunction.trim(),
        jobTitle: input.jobTitle.trim(),
        workPhone: input.workPhone || null,
        location: input.location || null,
        managerUserId,
        employmentState: input.employmentState ?? "ACTIVE",
        startDate: input.startDate || null,
        endDate: input.endDate || null,
        operationalNotes: input.operationalNotes || null,
        updatedBy: actorUserId,
        updatedAt: new Date(),
      },
    });
    if (input.status === "disabled") {
      await tx.update(schema.userSessions).set({
        revokedAt: new Date(),
        revokedBy: actorUserId,
        revokedReason: "platform_staff_disabled",
      }).where(and(eq(schema.userSessions.userId, target.id), isNull(schema.userSessions.revokedAt)));
    }
    await tx.insert(schema.platformAuditLogs).values({
      userId: actorUserId,
      action: "platform.staff_updated",
      metadata: {
        staffUserId: target.id,
        previousRoleKey: target.platformRoleKey,
        roleKey: role.key,
        previousStatus: target.status,
        status: input.status,
        businessFunction: input.businessFunction.trim(),
      },
    });
    return { updated: true };
  });
}

export async function issuePlatformStaffTemporaryPassword(
  actorUserId: string,
  staffUserId: string,
  requestedPassword?: string,
) {
  if (actorUserId === staffUserId) throw badRequest("Use password recovery or Settings to change your own password");
  const temporaryPassword = requestedPassword?.trim() || generatedTemporaryPassword();
  if (temporaryPassword.length < 12) throw badRequest("Temporary password must be at least 12 characters");
  return db.transaction(async (tx) => {
    const [target] = await tx.select().from(schema.users).where(and(
      eq(schema.users.id, staffUserId),
      isNull(schema.users.tenantId),
      eq(schema.users.isPlatformAdmin, true),
    ));
    if (!target) throw notFound("Platform staff member not found");
    if (target.platformRoleKey === "PRINCIPAL_ADMIN") throw badRequest("Use the principal account recovery flow");
    await tx.update(schema.users).set({
      passwordHash: await bcrypt.hash(temporaryPassword, 12),
      mustChangePassword: true,
      status: "active",
    }).where(eq(schema.users.id, target.id));
    await tx.update(schema.userSessions).set({
      revokedAt: new Date(),
      revokedBy: actorUserId,
      revokedReason: "platform_staff_temporary_password_issued",
    }).where(and(eq(schema.userSessions.userId, target.id), isNull(schema.userSessions.revokedAt)));
    await tx.insert(schema.platformAuditLogs).values({
      userId: actorUserId,
      action: "platform.staff_temporary_password_issued",
      metadata: { staffUserId: target.id, sessionsRevoked: true },
    });
    return { temporaryPassword, mustChangePassword: true };
  });
}
