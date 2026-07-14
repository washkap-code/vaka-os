import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { login } from "../src/auth.js";
import { db, schema } from "../src/lib.js";

const app = createApp();
const unique = () => `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;

async function signup(planName: "Starter" | "Growth" | "Business", label: string) {
  const suffix = unique();
  const response = await request(app).post("/api/v1/auth/signup").send({
    companyName: `Warehouse Settings ${label}`,
    subdomain: `warehouse${suffix}`.slice(0, 31),
    baseCurrency: "USD",
    ownerEmail: `warehouse-${suffix}@test.vaka`,
    ownerPassword: "Warehouse-Test-123!",
    ownerName: "Warehouse Owner",
    planName,
  });
  expect(response.status).toBe(200);
  return {
    ...response.body,
    auth: { Authorization: `Bearer ${response.body.token}` },
  };
}

async function authFor(tenantId: string, permissions: string[], label: string) {
  const [tenant] = await db.select({ subdomain: schema.tenants.subdomain })
    .from(schema.tenants).where(eq(schema.tenants.id, tenantId));
  const [role] = await db.insert(schema.roles).values({
    tenantId,
    name: `Warehouse ${label} ${unique()}`,
    permissions,
    isSystem: false,
  }).returning();
  const email = `warehouse-${label}-${unique()}@test.vaka`;
  const password = "Warehouse-Role-123!";
  await db.insert(schema.users).values({
    tenantId,
    email,
    passwordHash: await bcrypt.hash(password, 4),
    fullName: `Warehouse ${label}`,
    roleId: role.id,
  });
  return { Authorization: `Bearer ${(await login(email, password, tenant.subdomain)).token}` };
}

describe("P5-001 tier-governed warehouse settings", () => {
  it("shows canonical locations and blocks Starter above its one-location allowance without side effects", async () => {
    const tenant = await signup("Starter", "starter");
    const view = await request(app).get("/api/v1/settings/warehouses").set(tenant.auth);
    expect(view.status).toBe(200);
    expect(view.body).toMatchObject({
      capacity: {
        planName: "Starter", mode: "FINITE", used: 1, limit: 1,
        remaining: 0, atLimit: true, overLimit: false,
      },
      warehouses: [{ name: "Main Warehouse", isDefault: true }],
    });

    const beforeAudits = await db.select().from(schema.auditLogs).where(and(
      eq(schema.auditLogs.tenantId, tenant.tenant.id),
      eq(schema.auditLogs.action, "warehouse.created"),
    ));
    const blocked = await request(app).post("/api/v1/settings/warehouses").set(tenant.auth).send({
      name: "Second Store",
      address: "12 Samora Machel Avenue\nHarare",
    });
    expect(blocked.status).toBe(409);
    expect(blocked.body.message).toContain("Starter supports 1 stock location");
    expect(await db.select().from(schema.warehouses).where(
      eq(schema.warehouses.tenantId, tenant.tenant.id),
    )).toHaveLength(1);
    const afterAudits = await db.select().from(schema.auditLogs).where(and(
      eq(schema.auditLogs.tenantId, tenant.tenant.id),
      eq(schema.auditLogs.action, "warehouse.created"),
    ));
    expect(afterAudits).toHaveLength(beforeAudits.length);
  });

  it("derives a name from the first address line and atomically changes the default with audit evidence", async () => {
    const tenant = await signup("Growth", "derived");
    const created = await request(app).post("/api/v1/settings/warehouses").set(tenant.auth).send({
      name: "",
      address: "  25 Robert Mugabe Road  \nMutare\nZimbabwe",
      isDefault: true,
    });
    expect(created.status).toBe(200);
    expect(created.body).toMatchObject({
      warehouse: {
        name: "25 Robert Mugabe Road",
        address: "25 Robert Mugabe Road  \nMutare\nZimbabwe",
        isDefault: true,
      },
      capacity: { planName: "Growth", used: 2, limit: 2, atLimit: true },
    });

    const view = await request(app).get("/api/v1/settings/warehouses").set(tenant.auth);
    expect(view.body.warehouses.filter((row: { isDefault: boolean }) => row.isDefault)).toHaveLength(1);
    expect(view.body.warehouses[0].id).toBe(created.body.warehouse.id);

    const updated = await request(app)
      .patch(`/api/v1/settings/warehouses/${created.body.warehouse.id}`)
      .set(tenant.auth).send({ name: "Mutare Store" });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({ name: "Mutare Store", isDefault: true });

    const audits = await db.select().from(schema.auditLogs).where(and(
      eq(schema.auditLogs.tenantId, tenant.tenant.id),
      eq(schema.auditLogs.entityId, created.body.warehouse.id),
    ));
    expect(audits.map((row) => row.action)).toEqual(expect.arrayContaining(["warehouse.created", "warehouse.updated"]));
    expect(audits.find((row) => row.action === "warehouse.updated")?.metadata)
      .toMatchObject({ changedFields: ["name"] });
    expect(JSON.stringify(audits)).not.toContain("Mutare\nZimbabwe");
  });

  it("enforces permissions and tenant isolation for settings administration", async () => {
    const tenantA = await signup("Growth", "permissions-a");
    const tenantB = await signup("Growth", "permissions-b");
    const settingsAuth = await authFor(tenantA.tenant.id, ["settings.manage"], "settings");
    const readOnlyAuth = await authFor(tenantA.tenant.id, ["inventory.read"], "read");

    const allowed = await request(app).post("/api/v1/settings/warehouses").set(settingsAuth).send({
      name: "Settings-managed Store",
    });
    expect(allowed.status).toBe(200);
    expect((await request(app).post("/api/v1/settings/warehouses").set(readOnlyAuth)
      .send({ name: "Denied Store" })).status).toBe(403);

    const otherWarehouse = (await request(app).get("/api/v1/settings/warehouses").set(tenantB.auth)).body.warehouses[0];
    const crossTenant = await request(app)
      .patch(`/api/v1/settings/warehouses/${otherWarehouse.id}`)
      .set(settingsAuth).send({ name: "Leaked Store" });
    expect(crossTenant.status).toBe(404);
    const [unchanged] = await db.select().from(schema.warehouses).where(eq(schema.warehouses.id, otherWarehouse.id));
    expect(unchanged.name).toBe("Main Warehouse");
  });

  it("serialises simultaneous creates so a Growth tenant cannot exceed two locations", async () => {
    const tenant = await signup("Growth", "concurrency");
    const [first, second] = await Promise.all([
      request(app).post("/api/v1/settings/warehouses").set(tenant.auth).send({ name: "Branch One" }),
      request(app).post("/api/v1/settings/warehouses").set(tenant.auth).send({ name: "Branch Two" }),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 409]);
    expect(await db.select().from(schema.warehouses).where(
      eq(schema.warehouses.tenantId, tenant.tenant.id),
    )).toHaveLength(2);
  });

  it("preserves existing locations after a downgrade and blocks only further creation", async () => {
    const tenant = await signup("Business", "downgrade");
    for (const name of ["North", "South", "East", "West"]) {
      const created = await request(app).post("/api/v1/settings/warehouses").set(tenant.auth).send({ name });
      expect(created.status).toBe(200);
    }
    const [starter] = await db.select({ id: schema.plans.id }).from(schema.plans)
      .where(eq(schema.plans.name, "Starter"));
    await db.update(schema.subscriptions).set({ planId: starter.id })
      .where(eq(schema.subscriptions.tenantId, tenant.tenant.id));

    const view = await request(app).get("/api/v1/settings/warehouses").set(tenant.auth);
    expect(view.body.capacity).toMatchObject({
      planName: "Starter", used: 5, limit: 1, remaining: 0, atLimit: true, overLimit: true,
    });
    expect(view.body.warehouses).toHaveLength(5);
    expect((await request(app).post("/api/v1/settings/warehouses").set(tenant.auth)
      .send({ name: "Sixth" })).status).toBe(409);
    expect((await request(app).get("/api/v1/warehouses").set(tenant.auth)).body).toHaveLength(5);
  });
});
