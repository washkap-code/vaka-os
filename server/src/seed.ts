// Seed: subscription plans + platform super-admin.
import bcrypt from "bcryptjs";
import { db, schema } from "./lib.js";
import { and, eq, isNull } from "drizzle-orm";
import { platformAdminPassword } from "./config.js";
import { CURRENT_PLANS, PLATFORM_ADMIN_EMAIL, PLATFORM_ADMIN_NAME } from "./commercial.js";

async function main() {
  const adminPassword = platformAdminPassword();
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
      mustChangePassword: true,
    });
  } else if (existingAdmin.email !== PLATFORM_ADMIN_EMAIL || existingAdmin.fullName !== PLATFORM_ADMIN_NAME) {
    await db.update(schema.users).set({
      email: PLATFORM_ADMIN_EMAIL,
      fullName: PLATFORM_ADMIN_NAME,
      status: "active",
    }).where(eq(schema.users.id, existingAdmin.id));
    await db.insert(schema.platformAuditLogs).values({
      userId: existingAdmin.id,
      action: "platform_admin.identity_corrected",
      metadata: { previousEmail: existingAdmin.email, newEmail: PLATFORM_ADMIN_EMAIL, source: "seed" },
    });
  }
  console.log("Seeded plans + platform admin");
  process.exit(0);
}
main();
