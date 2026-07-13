import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { login } from "../src/auth.js";
import { db, schema } from "../src/lib.js";
import { DOMAIN_EVENTS, runWithPostCommitEvents } from "../src/platform/events/index.js";
import { createContact, signupFinanceTenant } from "./finance/helpers.js";

const app = createApp();

async function createToken(tenantId: string, permissions: string[], label: string): Promise<string> {
  const [tenant] = await db.select({ subdomain: schema.tenants.subdomain })
    .from(schema.tenants).where(eq(schema.tenants.id, tenantId));
  const [role] = await db.insert(schema.roles).values({
    tenantId,
    name: `Search ${label} ${Date.now()}`,
    permissions,
    isSystem: false,
  }).returning();
  const email = `search-${label}-${Date.now()}@test.vaka`;
  const password = "Search-Test-User-123!";
  await db.insert(schema.users).values({
    tenantId,
    email,
    passwordHash: await bcrypt.hash(password, 4),
    fullName: `Search ${label}`,
    roleId: role.id,
  });
  return (await login(email, password, tenant.subdomain)).token;
}

describe("P1-006 search service adapter", () => {
  it("reconciles existing canonical records and enforces tenant and result permissions", async () => {
    const tenantA = await signupFinanceTenant("search-scope-a");
    const tenantB = await signupFinanceTenant("search-scope-b");
    const customerA = await createContact(tenantA, "Acacia Holdings", { tags: ["retail"] });
    const customerB = await createContact(tenantB, "Acacia Holdings");
    const [productA] = await db.insert(schema.products).values({
      tenantId: tenantA.tenantId,
      sku: "ACACIA-001",
      name: "Acacia Stock Item",
      description: "Retail display unit",
      costPrice: "1.00",
      salePrice: "2.00",
      currency: "USD",
      taxRate: "15.00",
      taxTreatment: "standard",
    }).returning();
    const [invoiceA] = await db.insert(schema.invoices).values({
      tenantId: tenantA.tenantId,
      contactId: customerA.id,
      number: "INV-ACACIA-001",
      currency: "USD",
      status: "ISSUED",
      total: "115.00",
    }).returning();

    const resultA = await request(app).get("/api/v1/search").query({ q: "acacia" }).set(tenantA.auth);
    expect(resultA.status).toBe(200);
    expect(resultA.headers["cache-control"]).toBe("private, no-store");
    expect(resultA.body.results.map((row: { id: string }) => row.id)).toEqual(expect.arrayContaining([
      customerA.id, productA.id, invoiceA.id,
    ]));

    const resultB = await request(app).get("/api/v1/search").query({ q: "acacia" }).set(tenantB.auth);
    expect(resultB.status).toBe(200);
    expect(resultB.body.results.map((row: { id: string }) => row.id)).toEqual([customerB.id]);
    expect(resultB.body.results.map((row: { id: string }) => row.id)).not.toContain(customerA.id);

    const crmToken = await createToken(tenantA.tenantId, ["crm.read"], "crm-only");
    const crmOnly = await request(app).get("/api/v1/search").query({ q: "acacia" })
      .set({ Authorization: `Bearer ${crmToken}` });
    expect(crmOnly.status).toBe(200);
    expect(crmOnly.body.results).toHaveLength(1);
    expect(crmOnly.body.results[0]).toMatchObject({ id: customerA.id, entityType: "customer" });

    const reportsToken = await createToken(tenantA.tenantId, ["reports.read"], "reports-only");
    const forbidden = await request(app).get("/api/v1/search").query({ q: "acacia" })
      .set({ Authorization: `Bearer ${reportsToken}` });
    expect(forbidden.status).toBe(403);
  });

  it("refreshes customers, products, invoices and imports only after committed writes", async () => {
    const tenant = await signupFinanceTenant("search-events");
    expect((await request(app).get("/api/v1/search").query({ q: "sunrise" }).set(tenant.auth)).body.results).toEqual([]);

    const contact = await request(app).post("/api/v1/contacts").set(tenant.auth).send({
      name: "Sunrise Retail",
      type: "COMPANY",
      isCustomer: true,
    });
    expect(contact.status).toBe(200);
    expect((await request(app).get("/api/v1/search").query({ q: "sunrise" }).set(tenant.auth)).body.results[0])
      .toMatchObject({ id: contact.body.id, entityType: "customer" });

    const updated = await request(app).patch(`/api/v1/contacts/${contact.body.id}`).set(tenant.auth)
      .send({ name: "Dawn Markets" });
    expect(updated.status).toBe(200);
    expect((await request(app).get("/api/v1/search").query({ q: "sunrise" }).set(tenant.auth)).body.results).toEqual([]);
    expect((await request(app).get("/api/v1/search").query({ q: "dawn" }).set(tenant.auth)).body.results[0].id)
      .toBe(contact.body.id);

    const product = await request(app).post("/api/v1/products").set(tenant.auth).send({
      sku: "DAWN-001",
      name: "Dawn Display Unit",
      salePrice: "25.00",
      costPrice: "10.00",
      currency: "USD",
      taxTreatment: "standard",
      trackStock: false,
    });
    expect(product.status).toBe(200);
    expect((await request(app).get("/api/v1/search").query({ q: "DAWN-001" }).set(tenant.auth)).body.results[0])
      .toMatchObject({ id: product.body.id, entityType: "product" });

    const draft = await request(app).post("/api/v1/invoices").set(tenant.auth).send({
      contactId: contact.body.id,
      currency: "USD",
      lines: [{ description: "Advisory", quantity: "1", unitPrice: "20.00", taxTreatment: "standard" }],
    });
    expect(draft.status).toBe(200);
    const draftSearch = await request(app).get("/api/v1/search")
      .query({ q: "draft invoice", entityTypes: "invoice" }).set(tenant.auth);
    expect(draftSearch.body.results[0]).toMatchObject({ id: draft.body.id, entityType: "invoice" });
    const issued = await request(app).post(`/api/v1/invoices/${draft.body.id}/issue`).set(tenant.auth).send({});
    expect(issued.status).toBe(200);
    const issuedSearch = await request(app).get("/api/v1/search").query({ q: issued.body.number }).set(tenant.auth);
    expect(issuedSearch.body.results[0].document).toMatchObject({ id: draft.body.id, status: "ISSUED" });
    const payment = await request(app).post(`/api/v1/invoices/${draft.body.id}/payments`).set(tenant.auth)
      .set("Idempotency-Key", `search-payment-${draft.body.id}`).send({ amount: "23.00" });
    expect(payment.status).toBe(200);
    const paidSearch = await request(app).get("/api/v1/search").query({ q: issued.body.number }).set(tenant.auth);
    expect(paidSearch.body.results[0].document).toMatchObject({ id: draft.body.id, status: "PAID" });

    const renamedCustomer = await request(app).patch(`/api/v1/contacts/${contact.body.id}`).set(tenant.auth)
      .send({ name: "Dawn Marketplace" });
    expect(renamedCustomer.status).toBe(200);
    const renamedInvoice = await request(app).get("/api/v1/search")
      .query({ q: "Marketplace", entityTypes: "invoice" }).set(tenant.auth);
    expect(renamedInvoice.body.results[0].document).toMatchObject({
      id: draft.body.id,
      customerName: "Dawn Marketplace",
    });

    const contactCsv = "name,type,is_customer,is_vendor\nImported Search Customer,COMPANY,yes,no";
    const contactPreview = await request(app).post("/api/v1/imports/contacts/preview")
      .set(tenant.auth).send({ csvText: contactCsv });
    const contactCommit = await request(app).post(`/api/v1/imports/contacts/${contactPreview.body.batch.id}/commit`)
      .set(tenant.auth).send({});
    expect(contactCommit.status).toBe(200);
    expect((await request(app).get("/api/v1/search").query({ q: "Imported Search Customer" }).set(tenant.auth)).body.results)
      .toHaveLength(1);

    const productCsv = [
      "sku,name,cost_price,sale_price,currency,tax_treatment,track_stock,is_active",
      "IMPORTED-SEARCH-1,Imported Search Product,0,50.00,USD,exempt,no,yes",
    ].join("\n");
    const productPreview = await request(app).post("/api/v1/imports/products/preview")
      .set(tenant.auth).send({ csvText: productCsv });
    const productCommit = await request(app).post(`/api/v1/imports/products/${productPreview.body.batch.id}/commit`)
      .set(tenant.auth).send({});
    expect(productCommit.status).toBe(200);
    expect((await request(app).get("/api/v1/search").query({ q: "IMPORTED-SEARCH-1" }).set(tenant.auth)).body.results)
      .toHaveLength(1);

    await expect(runWithPostCommitEvents((queue) => db.transaction(async (tx) => {
      const [rolledBack] = await tx.insert(schema.contacts).values({
        tenantId: tenant.tenantId,
        name: "Rolled Back Search Customer",
        isCustomer: true,
      }).returning();
      queue({ id: `${DOMAIN_EVENTS.CUSTOMER_CHANGED}:${rolledBack.id}:created`, type: DOMAIN_EVENTS.CUSTOMER_CHANGED,
        tenantId: tenant.tenantId, actorUserId: tenant.userId,
        payload: { customerId: rolledBack.id, change: "created" } });
      throw new Error("synthetic rollback");
    }))).rejects.toThrow("synthetic rollback");
    expect((await request(app).get("/api/v1/search").query({ q: "Rolled Back" }).set(tenant.auth)).body.results).toEqual([]);
  });

  it("ranks exact titles, paginates deterministically and rejects invalid cursors or filters", async () => {
    const tenant = await signupFinanceTenant("search-cursor");
    for (const name of ["Mbare", "Mbare Foods", "Greater Mbare Trading", "Mbare Tools"]) {
      const response = await request(app).post("/api/v1/contacts").set(tenant.auth).send({ name, isCustomer: true });
      expect(response.status).toBe(200);
    }
    const first = await request(app).get("/api/v1/search").query({ q: "Mbare", limit: 2, entityTypes: "customer" }).set(tenant.auth);
    expect(first.status).toBe(200);
    expect(first.body.results).toHaveLength(2);
    expect(first.body.results[0]).toMatchObject({ title: "Mbare", score: 100 });
    expect(first.body.nextCursor).toEqual(expect.any(String));

    const second = await request(app).get("/api/v1/search").query({
      q: "Mbare", limit: 2, entityTypes: "customer", cursor: first.body.nextCursor,
    }).set(tenant.auth);
    expect(second.status).toBe(200);
    expect(second.body.results).toHaveLength(2);
    expect(second.body.results.map((row: { id: string }) => row.id))
      .not.toEqual(expect.arrayContaining(first.body.results.map((row: { id: string }) => row.id)));

    const wrongQueryCursor = await request(app).get("/api/v1/search")
      .query({ q: "Foods", cursor: first.body.nextCursor }).set(tenant.auth);
    expect(wrongQueryCursor.status).toBe(400);
    expect((await request(app).get("/api/v1/search").query({ q: " " }).set(tenant.auth)).status).toBe(400);
    expect((await request(app).get("/api/v1/search").query({ q: "Mbare", entityTypes: "company" }).set(tenant.auth)).status).toBe(400);
  });
});
