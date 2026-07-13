import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { login } from "../src/auth.js";
import { db, schema } from "../src/lib.js";
import { LowStockAlertCoordinator } from "../src/low-stock-alerts.js";
import { DOMAIN_EVENTS, runWithPostCommitEvents } from "../src/platform/events/index.js";
import { NOTIFICATION_SERVICE, platformKernel } from "../src/platform-runtime.js";
import { createProduct, defaultWarehouse, signupFinanceTenant } from "./finance/helpers.js";

const app = createApp();

async function createUser(
  tenantId: string,
  permissions: string[],
  label: string,
  status = "active",
): Promise<{ id: string; token: string }> {
  const [tenant] = await db.select({ subdomain: schema.tenants.subdomain })
    .from(schema.tenants).where(eq(schema.tenants.id, tenantId));
  const [role] = await db.insert(schema.roles).values({
    tenantId, name: `Low stock ${label} ${Date.now()}`, permissions, isSystem: false,
  }).returning();
  const email = `low-stock-${label}-${Date.now()}@test.vaka`;
  const password = "Low-Stock-Test-123!";
  const [user] = await db.insert(schema.users).values({
    tenantId, email, passwordHash: await bcrypt.hash(password, 4),
    fullName: `Low Stock ${label}`, roleId: role.id, status,
  }).returning();
  const token = status === "active" ? (await login(email, password, tenant.subdomain)).token : "";
  return { id: user.id, token };
}

async function productNotifications(tenantId: string, productId: string) {
  const rows = await db.select().from(schema.notifications).where(and(
    eq(schema.notifications.tenantId, tenantId),
    eq(schema.notifications.template, "inventory.low_stock"),
  ));
  return rows.filter((row) => (row.variables as Record<string, string>).productId === productId);
}

describe("P5-004 reorder rules and low-stock alerts", () => {
  it("audits rule changes and alerts once per breach, re-arming only above the threshold", async () => {
    const tenant = await signupFinanceTenant("low-stock-transitions");
    const warehouse = await defaultWarehouse(tenant);
    const created = await request(app).post("/api/v1/products").set(tenant.auth).send({
      sku: `LOW-${Date.now()}`, name: "Low Stock Product", costPrice: "1.00", salePrice: "2.00",
      currency: "USD", taxTreatment: "standard", reorderLevel: 0, trackStock: true,
    });
    expect(created.status).toBe(200);
    const productId = created.body.id as string;

    const rule = await request(app).patch(`/api/v1/products/${productId}/reorder-rule`)
      .set(tenant.auth).send({ reorderLevel: 5 });
    expect(rule.status).toBe(200);
    expect(rule.body.reorderLevel).toBe(5);
    expect(await productNotifications(tenant.tenantId, productId)).toHaveLength(1);

    const [ruleAudit] = await db.select().from(schema.auditLogs).where(and(
      eq(schema.auditLogs.tenantId, tenant.tenantId),
      eq(schema.auditLogs.action, "inventory.reorder_rule_changed"),
      eq(schema.auditLogs.entityId, productId),
    ));
    expect(ruleAudit.metadata).toMatchObject({ previousReorderLevel: 0, reorderLevel: 5, alertsEnabled: true });
    const [notificationAudit] = await db.select().from(schema.auditLogs).where(and(
      eq(schema.auditLogs.tenantId, tenant.tenantId),
      eq(schema.auditLogs.action, "notification.accepted"),
    ));
    expect(notificationAudit).toMatchObject({ entityType: "notification" });

    const opening = await request(app).post("/api/v1/stock/opening").set(tenant.auth).send({
      productId, warehouseId: warehouse.id, quantity: "2.000", unitCost: "1.00",
    });
    expect(opening.status).toBe(200);
    expect(await productNotifications(tenant.tenantId, productId)).toHaveLength(1);

    const replenish = await request(app).post("/api/v1/stock/adjust").set(tenant.auth)
      .set("Idempotency-Key", `low-stock-up-${productId}`).send({
        productId, warehouseId: warehouse.id, quantityDelta: "6.000", note: "Replenishment count",
      });
    expect(replenish.status).toBe(200);
    let [state] = await db.select().from(schema.lowStockAlertStates).where(eq(schema.lowStockAlertStates.productId, productId));
    expect(state).toMatchObject({ state: "HEALTHY", breachSequence: 1, notificationPending: false });

    const breachAgain = await request(app).post("/api/v1/stock/adjust").set(tenant.auth)
      .set("Idempotency-Key", `low-stock-down-${productId}`).send({
        productId, warehouseId: warehouse.id, quantityDelta: "-3.000", note: "Damaged stock count",
      });
    expect(breachAgain.status).toBe(200);
    const alerts = await productNotifications(tenant.tenantId, productId);
    expect(alerts).toHaveLength(2);
    const latestVariables = alerts.map((row) => row.variables as Record<string, string>);
    expect(latestVariables).toEqual(expect.arrayContaining([
      expect.objectContaining({ productId, onHand: "5.000", threshold: "5" }),
    ]));
    [state] = await db.select().from(schema.lowStockAlertStates).where(eq(schema.lowStockAlertStates.productId, productId));
    expect(state).toMatchObject({ state: "LOW", breachSequence: 2, notificationPending: false });

    const disabled = await request(app).patch(`/api/v1/products/${productId}/reorder-rule`)
      .set(tenant.auth).send({ reorderLevel: 0 });
    expect(disabled.status).toBe(200);
    [state] = await db.select().from(schema.lowStockAlertStates).where(eq(schema.lowStockAlertStates.productId, productId));
    expect(state).toMatchObject({ state: "HEALTHY", threshold: 0, notificationPending: false });
  });

  it("delivers only to active inventory writers and serializes concurrent evaluations", async () => {
    const tenant = await signupFinanceTenant("low-stock-concurrency");
    const stockUser = await createUser(tenant.tenantId, ["inventory.read", "inventory.write"], "stock-user");
    const readUser = await createUser(tenant.tenantId, ["inventory.read"], "read-user");
    const inactive = await createUser(tenant.tenantId, ["inventory.write"], "inactive", "disabled");
    const product = await createProduct(tenant, "concurrent", { reorderLevel: 4, trackStock: true });
    const coordinator = new LowStockAlertCoordinator(platformKernel().container.get(NOTIFICATION_SERVICE));

    await Promise.all(Array.from({ length: 5 }, () => coordinator.evaluate(tenant.tenantId, product.id, tenant.userId)));
    const alerts = await productNotifications(tenant.tenantId, product.id);
    expect(alerts).toHaveLength(2);
    expect(alerts.map((row) => row.recipient).sort()).toEqual([tenant.userId, stockUser.id].sort());
    expect(alerts.map((row) => row.recipient)).not.toContain(readUser.id);
    expect(alerts.map((row) => row.recipient)).not.toContain(inactive.id);
    const [state] = await db.select().from(schema.lowStockAlertStates).where(eq(schema.lowStockAlertStates.productId, product.id));
    expect(state).toMatchObject({ state: "LOW", breachSequence: 1, notificationPending: false });
  });

  it("keeps a generation pending without recipients and retries the same generation", async () => {
    const tenant = await signupFinanceTenant("low-stock-pending");
    const product = await createProduct(tenant, "pending", { reorderLevel: 2, trackStock: true });
    await db.update(schema.users).set({ status: "disabled" }).where(eq(schema.users.id, tenant.userId));
    const coordinator = new LowStockAlertCoordinator(platformKernel().container.get(NOTIFICATION_SERVICE));
    await coordinator.evaluate(tenant.tenantId, product.id, tenant.userId);
    let [state] = await db.select().from(schema.lowStockAlertStates).where(eq(schema.lowStockAlertStates.productId, product.id));
    expect(state).toMatchObject({ state: "LOW", breachSequence: 1, notificationPending: true });
    expect(await productNotifications(tenant.tenantId, product.id)).toHaveLength(0);

    await db.update(schema.users).set({ status: "active" }).where(eq(schema.users.id, tenant.userId));
    const failing = new LowStockAlertCoordinator({
      send: async () => { throw new Error("notification unavailable"); },
    });
    await expect(failing.evaluate(tenant.tenantId, product.id, tenant.userId)).rejects.toThrow("notification unavailable");
    [state] = await db.select().from(schema.lowStockAlertStates).where(eq(schema.lowStockAlertStates.productId, product.id));
    expect(state).toMatchObject({ breachSequence: 1, notificationPending: true });
    await coordinator.evaluate(tenant.tenantId, product.id, tenant.userId);
    expect(await productNotifications(tenant.tenantId, product.id)).toHaveLength(1);
    [state] = await db.select().from(schema.lowStockAlertStates).where(eq(schema.lowStockAlertStates.productId, product.id));
    expect(state).toMatchObject({ state: "LOW", breachSequence: 1, notificationPending: false });
  });

  it("compares the exact three-decimal balance at the inclusive threshold", async () => {
    const tenant = await signupFinanceTenant("low-stock-exact");
    const warehouse = await defaultWarehouse(tenant);
    const product = await createProduct(tenant, "exact", { reorderLevel: 0, trackStock: true });
    await request(app).post("/api/v1/stock/opening").set(tenant.auth).send({
      productId: product.id, warehouseId: warehouse.id, quantity: "5.001", unitCost: "1.00",
    });
    await request(app).patch(`/api/v1/products/${product.id}/reorder-rule`).set(tenant.auth).send({ reorderLevel: 5 });
    expect(await productNotifications(tenant.tenantId, product.id)).toHaveLength(0);
    const movement = await request(app).post("/api/v1/stock/adjust").set(tenant.auth)
      .set("Idempotency-Key", `low-stock-exact-${product.id}`).send({
        productId: product.id, warehouseId: warehouse.id, quantityDelta: "-0.001", note: "Exact boundary check",
      });
    expect(movement.status).toBe(200);
    const alerts = await productNotifications(tenant.tenantId, product.id);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].variables).toMatchObject({ onHand: "5.000", threshold: "5" });
  });

  it("enforces rule RBAC/tenant scope and publishes nothing from rollback", async () => {
    const tenantA = await signupFinanceTenant("low-stock-scope-a");
    const tenantB = await signupFinanceTenant("low-stock-scope-b");
    const productA = await createProduct(tenantA, "scope", { reorderLevel: 0 });
    const reader = await createUser(tenantA.tenantId, ["inventory.read"], "reader");

    expect((await request(app).patch(`/api/v1/products/${productA.id}/reorder-rule`)
      .set({ Authorization: `Bearer ${reader.token}` }).send({ reorderLevel: 3 })).status).toBe(403);
    expect((await request(app).patch(`/api/v1/products/${productA.id}/reorder-rule`)
      .set(tenantB.auth).send({ reorderLevel: 3 })).status).toBe(404);
    expect((await request(app).patch(`/api/v1/products/${productA.id}/reorder-rule`)
      .set(tenantA.auth).send({ reorderLevel: -1 })).status).toBe(400);

    await expect(runWithPostCommitEvents((queue) => db.transaction(async (tx) => {
      await tx.update(schema.products).set({ reorderLevel: 7 }).where(eq(schema.products.id, productA.id));
      queue({
        id: `${DOMAIN_EVENTS.PRODUCT_CHANGED}:${productA.id}:rollback`,
        type: DOMAIN_EVENTS.PRODUCT_CHANGED,
        tenantId: tenantA.tenantId,
        actorUserId: tenantA.userId,
        payload: { productId: productA.id, change: "updated" },
      });
      throw new Error("synthetic rollback");
    }))).rejects.toThrow("synthetic rollback");
    const [unchanged] = await db.select().from(schema.products).where(eq(schema.products.id, productA.id));
    expect(unchanged.reorderLevel).toBe(0);
    expect(await db.select().from(schema.lowStockAlertStates).where(eq(schema.lowStockAlertStates.productId, productA.id))).toHaveLength(0);
  });
});
