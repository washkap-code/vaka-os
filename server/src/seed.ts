// Seed: subscription plans + platform super-admin.
import bcrypt from "bcryptjs";
import { db, schema } from "./lib.js";
import { and, eq, isNull } from "drizzle-orm";
import { platformAdminPassword } from "./config.js";
import { CURRENT_PLANS, PLATFORM_ADMIN_EMAIL, PLATFORM_ADMIN_NAME } from "./commercial.js";
import { PLATFORM_ROLE_DEFINITIONS } from "./platform-staff.js";
import { logEvent } from "./observability.js";

async function main() {
  const adminPassword = platformAdminPassword();
  for (const role of PLATFORM_ROLE_DEFINITIONS) {
    await db.insert(schema.platformRoles).values({ ...role }).onConflictDoUpdate({
      target: schema.platformRoles.key,
      set: { name: role.name, permissions: role.permissions, isSystem: true },
    });
  }
  for (const plan of CURRENT_PLANS) {
    await db.insert(schema.plans).values({ ...plan }).onConflictDoUpdate({
      target: schema.plans.name,
      set: {
        userLimit: plan.userLimit,
        priceAmount: plan.priceAmount,
        features: plan.features,
      },
    });
  }
  const [existingAdmin] = await db.select().from(schema.users).where(and(
    isNull(schema.users.tenantId),
    eq(schema.users.isPlatformAdmin, true),
  ));
  if (!existingAdmin) {
    await db.insert(schema.users).values({
      tenantId: null, email: PLATFORM_ADMIN_EMAIL,
      passwordHash: await bcrypt.hash(adminPassword, 12),
      fullName: PLATFORM_ADMIN_NAME, isPlatformAdmin: true,
      platformRoleKey: "PRINCIPAL_ADMIN",
      mustChangePassword: true,
    });
  } else {
    if (process.env.NODE_ENV === "test") {
      // Keep test:db:prepare deterministic after the administrator first-login
      // test rotates this fixture's password. Production credentials are never
      // rewritten by a repeat seed.
      await db.update(schema.users).set({
        passwordHash: await bcrypt.hash(adminPassword, 12),
        mustChangePassword: true,
        status: "active",
      }).where(eq(schema.users.id, existingAdmin.id));
    }
    if (existingAdmin.email !== PLATFORM_ADMIN_EMAIL
      || existingAdmin.fullName !== PLATFORM_ADMIN_NAME
      || existingAdmin.platformRoleKey !== "PRINCIPAL_ADMIN") {
      await db.update(schema.users).set({
        email: PLATFORM_ADMIN_EMAIL,
        fullName: PLATFORM_ADMIN_NAME,
        status: "active",
        platformRoleKey: "PRINCIPAL_ADMIN",
      }).where(eq(schema.users.id, existingAdmin.id));
      await db.insert(schema.platformAuditLogs).values({
        userId: existingAdmin.id,
        action: "platform_admin.identity_corrected",
        metadata: { previousEmail: existingAdmin.email, newEmail: PLATFORM_ADMIN_EMAIL, source: "seed" },
      });
    }
  }
  const [platformAdmin] = await db.select().from(schema.users).where(and(
    isNull(schema.users.tenantId),
    eq(schema.users.isPlatformAdmin, true),
    eq(schema.users.email, PLATFORM_ADMIN_EMAIL),
  ));
  if (platformAdmin) {
    await db.insert(schema.platformStaffProfiles).values({
      userId: platformAdmin.id,
      businessFunction: "Executive",
      jobTitle: "Principal Platform Administrator",
      employmentState: "ACTIVE",
      updatedBy: platformAdmin.id,
    }).onConflictDoNothing({ target: schema.platformStaffProfiles.userId });
  }
  logEvent("seed.completed", { platformAdminPresent: Boolean(platformAdmin) });
  process.exit(0);
}
main();
