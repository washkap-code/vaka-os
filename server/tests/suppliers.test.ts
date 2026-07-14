import bcrypt from "bcryptjs";
import { and, count, eq } from "drizzle-orm";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { login } from "../src/auth.js";
import { db, schema } from "../src/lib.js";
import { createContact, signupFinanceTenant } from "./finance/helpers.js";

const app = createApp();

async function authFor(tenantId: string, permissions: string[], label: string) {
  const [tenant] = await db.select({ subdomain: schema.tenants.subdomain })
    .from(schema.tenants).where(eq(schema.tenants.id, tenantId));
  const [role] = await db.insert(schema.roles).values({
    tenantId, name: `Supplier ${label} ${Date.now()}`, permissions, isSystem: false,
  }).returning();
  const email = `supplier-${label}-${Date.now()}@test.vaka`;
  const password = "Supplier-Test-123!";
  await db.insert(schema.users).values({
    tenantId, email, passwordHash: await bcrypt.hash(password, 4), fullName: `Supplier ${label}`, roleId: role.id,
  });
  return { Authorization: `Bearer ${(await login(email, password, tenant.subdomain)).token}` };
}

describe("P4-001 canonical supplier records", () => {
  it("uses one contact identity with procurement permissions, supplier fields, audit, metadata and search", async () => {
    const tenantA = await signupFinanceTenant("supplier-record-a");
    const tenantB = await signupFinanceTenant("supplier-record-b");
    const inventoryAuth = await authFor(tenantA.tenantId, ["inventory.read", "inventory.write"], "inventory");
    const crmAuth = await authFor(tenantA.tenantId, ["crm.read", "crm.write"], "crm");

    const created = await request(app).post("/api/v1/suppliers").set(inventoryAuth).send({
      name: "Mbare Supply Company",
      type: "COMPANY",
      email: "orders@mbare.example",
      addressLine1: "12 Market Road",
      city: "Harare",
      countryCode: "zw",
      supplierCode: "SUP-001",
      supplierCurrency: "USD",
      supplierPaymentTermsDays: 30,
      supplierLeadTimeDays: 7,
    });
    expect(created.status).toBe(200);
    expect(created.body).toMatchObject({
      isVendor: true, isCustomer: false, supplierCode: "SUP-001",
      supplierCurrency: "USD", supplierPaymentTermsDays: 30, supplierLeadTimeDays: 7,
    });

    const [canonical] = await db.select().from(schema.contacts).where(eq(schema.contacts.id, created.body.id));
    expect(canonical).toMatchObject({ id: created.body.id, tenantId: tenantA.tenantId, isVendor: true });
    expect((await request(app).get("/api/v1/suppliers").set(inventoryAuth)).body.map((row: { id: string }) => row.id))
      .toEqual([canonical.id]);
    expect((await request(app).get(`/api/v1/suppliers/${canonical.id}`).set(tenantB.auth)).status).toBe(404);
    expect((await request(app).get("/api/v1/suppliers").set(crmAuth)).status).toBe(403);
    expect((await request(app).post("/api/v1/suppliers").set(crmAuth).send({ name: "Denied" })).status).toBe(403);

    const updated = await request(app).patch(`/api/v1/suppliers/${canonical.id}`).set(inventoryAuth).send({
      supplierPaymentTermsDays: 45,
      supplierLeadTimeDays: 10,
    });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({ supplierPaymentTermsDays: 45, supplierLeadTimeDays: 10 });
    expect((await request(app).post("/api/v1/suppliers").set(inventoryAuth).send({
      name: "Duplicate Code", supplierCode: "sup-001",
    })).status).toBe(409);

    const metadata = await request(app).get("/api/v1/metadata/objects").set(inventoryAuth);
    expect(metadata.body.objects.map((object: { key: string }) => object.key)).toEqual(["company", "supplier", "product"]);
    const search = await request(app).get("/api/v1/search").query({ q: "SUP-001" }).set(inventoryAuth);
    expect(search.body.results).toHaveLength(1);
    expect(search.body.results[0]).toMatchObject({
      id: canonical.id, entityType: "supplier",
      object: { key: "supplier", navigation: { section: "procurement", recordView: "supplier" } },
      document: { supplierCode: "SUP-001", supplierCurrency: "USD" },
    });

    const audits = await db.select().from(schema.auditLogs).where(and(
      eq(schema.auditLogs.tenantId, tenantA.tenantId), eq(schema.auditLogs.entityId, canonical.id),
    ));
    expect(audits.map((row) => row.action)).toEqual(expect.arrayContaining(["supplier.created", "supplier.updated"]));
    expect(JSON.stringify(audits)).not.toContain("orders@mbare.example");
    expect(JSON.stringify(audits)).not.toContain("12 Market Road");
  });

  it("keeps customer and supplier projections correct across dual roles, imports and removal", async () => {
    const tenant = await signupFinanceTenant("supplier-projections");
    const dual = await request(app).post("/api/v1/contacts").set(tenant.auth).send({
      name: "Dual Role Trading", isCustomer: true, isVendor: true,
    });
    expect(dual.status).toBe(200);
    const both = await request(app).get("/api/v1/search").query({ q: "Dual Role Trading" }).set(tenant.auth);
    expect(both.body.results.map((row: { entityType: string }) => row.entityType).sort()).toEqual(["customer", "supplier"]);

    expect((await request(app).patch(`/api/v1/contacts/${dual.body.id}`).set(tenant.auth).send({ isVendor: false })).status).toBe(200);
    const customerOnly = await request(app).get("/api/v1/search").query({ q: "Dual Role Trading" }).set(tenant.auth);
    expect(customerOnly.body.results.map((row: { entityType: string }) => row.entityType)).toEqual(["customer"]);

    const csv = "name,type,is_customer,is_vendor\nImported Vendor,COMPANY,no,yes";
    const preview = await request(app).post("/api/v1/imports/contacts/preview").set(tenant.auth).send({ csvText: csv });
    const committed = await request(app).post(`/api/v1/imports/contacts/${preview.body.batch.id}/commit`).set(tenant.auth).send({});
    expect(committed.status).toBe(200);
    const imported = await request(app).get("/api/v1/search").query({ q: "Imported Vendor" }).set(tenant.auth);
    expect(imported.body.results).toHaveLength(1);
    expect(imported.body.results[0].entityType).toBe("supplier");

    const supplierId = imported.body.results[0].id as string;
    expect((await request(app).post("/api/v1/contacts/deletions").set(tenant.auth)
      .send({ ids: [supplierId], reason: "Owner-approved duplicate cleanup" })).status).toBe(200);
    expect((await request(app).get("/api/v1/search").query({ q: "Imported Vendor" }).set(tenant.auth)).body.results).toEqual([]);
  });

  it("blocks invalid PO and expense vendors before number, journal, document or audit writes", async () => {
    const tenantA = await signupFinanceTenant("supplier-integrity-a");
    const tenantB = await signupFinanceTenant("supplier-integrity-b");
    const supplier = await request(app).post("/api/v1/suppliers").set(tenantA.auth).send({ name: "Valid Supplier" });
    const nonVendor = await createContact(tenantA, "Customer Only", { isCustomer: true, isVendor: false });
    const otherSupplier = await request(app).post("/api/v1/suppliers").set(tenantB.auth).send({ name: "Other Supplier" });
    const removedSupplier = await request(app).post("/api/v1/suppliers").set(tenantA.auth).send({ name: "Removed Supplier" });
    await db.update(schema.contacts).set({ deletedAt: new Date(), deletedBy: tenantA.userId })
      .where(eq(schema.contacts.id, removedSupplier.body.id));
    const [warehouse] = await db.select().from(schema.warehouses).where(eq(schema.warehouses.tenantId, tenantA.tenantId));
    const [product] = await db.insert(schema.products).values({
      tenantId: tenantA.tenantId, sku: `SUP-${Date.now()}`, name: "Supplier Test Stock",
      costPrice: "10.00", salePrice: "15.00", currency: "USD", taxRate: "15.00", taxTreatment: "standard",
    }).returning();
    const poBody = (vendorContactId: string) => ({
      vendorContactId, currency: "USD", rateToBase: "1",
      lines: [{ productId: product.id, warehouseId: warehouse.id, quantity: "1", unitCost: "10.00" }],
    });

    const validPo = await request(app).post("/api/v1/purchase-orders").set(tenantA.auth).send(poBody(supplier.body.id));
    expect(validPo.status).toBe(200);
    expect(validPo.body.vendorContactId).toBe(supplier.body.id);
    const [sequenceBefore] = await db.select().from(schema.numberSequences).where(and(
      eq(schema.numberSequences.tenantId, tenantA.tenantId), eq(schema.numberSequences.key, "purchase_order"),
    ));
    const [poCountBefore] = await db.select({ value: count() }).from(schema.purchaseOrders)
      .where(eq(schema.purchaseOrders.tenantId, tenantA.tenantId));
    for (const invalidId of [nonVendor.id, otherSupplier.body.id, removedSupplier.body.id]) {
      expect((await request(app).post("/api/v1/purchase-orders").set(tenantA.auth).send(poBody(invalidId))).status).toBe(404);
    }
    const [sequenceAfter] = await db.select().from(schema.numberSequences).where(and(
      eq(schema.numberSequences.tenantId, tenantA.tenantId), eq(schema.numberSequences.key, "purchase_order"),
    ));
    const [poCountAfter] = await db.select({ value: count() }).from(schema.purchaseOrders)
      .where(eq(schema.purchaseOrders.tenantId, tenantA.tenantId));
    expect(sequenceAfter?.nextVal ?? null).toBe(sequenceBefore?.nextVal ?? null);
    expect(Number(poCountAfter.value)).toBe(Number(poCountBefore.value));

    const [expenseAccount] = await db.select().from(schema.accounts).where(and(
      eq(schema.accounts.tenantId, tenantA.tenantId), eq(schema.accounts.type, "EXPENSE"), eq(schema.accounts.isActive, true),
    ));
    const [expenseCountBefore] = await db.select({ value: count() }).from(schema.expenses)
      .where(eq(schema.expenses.tenantId, tenantA.tenantId));
    const [journalCountBefore] = await db.select({ value: count() }).from(schema.journalEntries)
      .where(eq(schema.journalEntries.tenantId, tenantA.tenantId));
    const invalidExpense = await request(app).post("/api/v1/expenses").set(tenantA.auth)
      .set("Idempotency-Key", `bad-vendor-${Date.now()}`).send({
        categoryAccountId: expenseAccount.id, vendorContactId: nonVendor.id,
        amount: "10.00", currency: "USD", rateToBase: "1", date: "2026-07-14", description: "Invalid supplier",
      });
    expect(invalidExpense.status).toBe(404);
    const [expenseCountAfter] = await db.select({ value: count() }).from(schema.expenses)
      .where(eq(schema.expenses.tenantId, tenantA.tenantId));
    const [journalCountAfter] = await db.select({ value: count() }).from(schema.journalEntries)
      .where(eq(schema.journalEntries.tenantId, tenantA.tenantId));
    expect(Number(expenseCountAfter.value)).toBe(Number(expenseCountBefore.value));
    expect(Number(journalCountAfter.value)).toBe(Number(journalCountBefore.value));
  });
});
