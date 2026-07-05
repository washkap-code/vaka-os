// Seed: subscription plans + platform super-admin.
import bcrypt from "bcryptjs";
import { db, schema } from "./lib.js";
import { eq } from "drizzle-orm";
import { platformAdminPassword } from "./config.js";

const PLANS = [
  { name: "Starter", userLimit: 1, priceAmount: "12.00", features: { inventoryLocations: 1 } },
  { name: "Growth", userLimit: 3, priceAmount: "30.00", features: { inventoryLocations: 2, resourceCentre: true } },
  { name: "Business", userLimit: 10, priceAmount: "75.00", features: { inventoryLocations: 5, approvals: true } },
  { name: "Enterprise", userLimit: 999, priceAmount: "150.00", features: { whiteLabel: true, sla: true, customModules: true } },
];

async function main() {
  const adminPassword = platformAdminPassword();
  for (const p of PLANS) {
    const existing = await db.select().from(schema.plans).where(eq(schema.plans.name, p.name));
    if (!existing.length) await db.insert(schema.plans).values(p as any);
  }
  const adminEmail = "platform-admin@jonomi.digital";
  const existing = await db.select().from(schema.users).where(eq(schema.users.email, adminEmail));
  if (!existing.length) {
    await db.insert(schema.users).values({
      tenantId: null, email: adminEmail,
      passwordHash: await bcrypt.hash(adminPassword, 12),
      fullName: "Jonomi Platform Admin", isPlatformAdmin: true,
    });
  }
  console.log("Seeded plans + platform admin");
  process.exit(0);
}
main();
