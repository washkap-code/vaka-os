import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { login } from "../src/auth.js";
import { db, schema } from "../src/lib.js";
import { createContact, signupFinanceTenant } from "./finance/helpers.js";

const app = createApp();

async function userAuth(tenantId: string, permissions: string[], label: string) {
  const [tenant] = await db.select({ subdomain: schema.tenants.subdomain })
    .from(schema.tenants).where(eq(schema.tenants.id, tenantId));
  const [role] = await db.insert(schema.roles).values({
    tenantId, name: `Records ${label} ${Date.now()}`, permissions, isSystem: false,
  }).returning();
  const email = `records-${label}-${Date.now()}@test.vaka`;
  const password = "Records-Test-123!";
  const [user] = await db.insert(schema.users).values({
    tenantId, email, passwordHash: await bcrypt.hash(password, 4), fullName: `Records ${label}`, roleId: role.id,
  }).returning();
  const session = await login(email, password, tenant.subdomain);
  return { user, auth: { Authorization: `Bearer ${session.token}` } };
}

describe("P3-004 customer record management", () => {
  it("maintains structured profile fields under tenant and write permission scope", async () => {
    const tenant = await signupFinanceTenant("records-profile");
    const contact = await createContact(tenant, "Profile Customer");
    const response = await request(app).patch(`/api/v1/contacts/${contact.id}`).set(tenant.auth).send({
      email: "accounts@example.co.zw",
      phone: "+263 24 2000000",
      website: "https://example.co.zw",
      industry: "Distribution",
      registrationNumber: "CO-2026-001",
      taxNumber: "BP-12345",
      addressLine1: "12 Samora Machel Avenue",
      addressLine2: "Suite 4",
      city: "Harare",
      region: "Harare Province",
      postalCode: "00263",
      countryCode: "zw",
      notes: "Prefers month-end statements.",
      tags: ["key account", "wholesale"],
    });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      city: "Harare", countryCode: "ZW", industry: "Distribution",
      tags: ["key account", "wholesale"],
    });
    const detail = await request(app).get(`/api/v1/contacts/${contact.id}`).set(tenant.auth);
    expect(detail.status).toBe(200);
    expect(detail.body.contact.addressLine1).toBe("12 Samora Machel Avenue");

    const readOnly = await userAuth(tenant.tenantId, ["crm.read"], "profile-readonly");
    expect((await request(app).patch(`/api/v1/contacts/${contact.id}`).set(readOnly.auth).send({ city: "Bulawayo" })).status).toBe(403);
  });

  it("requires principal-owner approval for non-owner deletion and preserves referenced history", async () => {
    const tenantA = await signupFinanceTenant("records-delete-a");
    const tenantB = await signupFinanceTenant("records-delete-b");
    const contact = await createContact(tenantA, "Approval Customer");
    const staff = await userAuth(tenantA.tenantId, ["crm.read", "crm.write"], "delete-staff");

    const requested = await request(app).post("/api/v1/contacts/deletions").set(staff.auth).send({
      ids: [contact.id], reason: "Duplicate customer record",
    });
    expect(requested.status).toBe(200);
    expect(requested.body).toEqual({ outcome: "REQUESTED", count: 1 });
    expect((await request(app).get("/api/v1/contacts").set(tenantA.auth)).body.map((row: { id: string }) => row.id)).toContain(contact.id);

    const requests = await request(app).get("/api/v1/contacts/deletion-requests").set(tenantA.auth);
    expect(requests.status).toBe(200);
    expect(requests.body[0]).toMatchObject({ entityId: contact.id, status: "PENDING", requesterName: staff.user.fullName });
    const requestId = requests.body[0].id as string;
    expect((await request(app).post(`/api/v1/contacts/deletion-requests/${requestId}/decision`).set(staff.auth)
      .send({ decision: "APPROVE", reason: "Not my authority" })).status).toBe(403);
    expect((await request(app).post(`/api/v1/contacts/deletion-requests/${requestId}/decision`).set(tenantB.auth)
      .send({ decision: "APPROVE", reason: "Cross-tenant attempt" })).status).toBe(404);

    const approved = await request(app).post(`/api/v1/contacts/deletion-requests/${requestId}/decision`).set(tenantA.auth)
      .send({ decision: "APPROVE", reason: "Confirmed duplicate after review" });
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe("APPROVED");
    expect((await request(app).get("/api/v1/contacts").set(tenantA.auth)).body.map((row: { id: string }) => row.id)).not.toContain(contact.id);
    expect((await request(app).get(`/api/v1/contacts/${contact.id}`).set(tenantA.auth)).status).toBe(404);

    const [stored] = await db.select().from(schema.contacts).where(eq(schema.contacts.id, contact.id));
    expect(stored.deletedAt).toBeInstanceOf(Date);
    expect(stored.deletedBy).toBe(tenantA.userId);
    const audits = await db.select().from(schema.auditLogs).where(and(
      eq(schema.auditLogs.tenantId, tenantA.tenantId), eq(schema.auditLogs.entityId, contact.id),
    ));
    expect(audits.map((event) => event.action)).toContain("contact.removed");
  });

  it("applies bounded bulk changes atomically and lets the owner remove exact selections", async () => {
    const tenant = await signupFinanceTenant("records-bulk");
    const first = await createContact(tenant, "Bulk First");
    const second = await createContact(tenant, "Bulk Second");
    const missing = "00000000-0000-4000-8000-000000000099";

    expect((await request(app).post("/api/v1/contacts/bulk").set(tenant.auth).send({
      ids: [first.id, missing], operation: { action: "ADD_TAG", tag: "priority" },
    })).status).toBe(404);
    expect((await db.select().from(schema.contacts).where(eq(schema.contacts.id, first.id)))[0].tags).toEqual([]);

    const tagged = await request(app).post("/api/v1/contacts/bulk").set(tenant.auth).send({
      ids: [first.id, second.id], operation: { action: "ADD_TAG", tag: "priority" },
    });
    expect(tagged.body.updated).toBe(2);
    const removed = await request(app).post("/api/v1/contacts/deletions").set(tenant.auth).send({
      ids: [first.id, second.id], reason: "Owner-approved test cleanup",
    });
    expect(removed.body).toEqual({ outcome: "REMOVED", count: 2 });
    expect((await request(app).get("/api/v1/contacts").set(tenant.auth)).body).toEqual([]);
  });
});

describe("P2-007 invoice detail and draft amendment", () => {
  it("lists active tenant customers for accounting users without broad CRM access", async () => {
    const tenantA = await signupFinanceTenant("invoice-customer-options-a");
    const tenantB = await signupFinanceTenant("invoice-customer-options-b");
    const activeCustomer = await createContact(tenantA, "Active Invoice Customer");
    const vendorOnly = await createContact(tenantA, "Vendor Only");
    const removedCustomer = await createContact(tenantA, "Removed Customer");
    await createContact(tenantB, "Other Tenant Customer");
    await db.update(schema.contacts).set({ isCustomer: false, isVendor: true })
      .where(and(eq(schema.contacts.id, vendorOnly.id), eq(schema.contacts.tenantId, tenantA.tenantId)));
    await db.update(schema.contacts).set({ deletedAt: new Date(), deletedBy: tenantA.userId })
      .where(and(eq(schema.contacts.id, removedCustomer.id), eq(schema.contacts.tenantId, tenantA.tenantId)));

    const accountingReader = await userAuth(tenantA.tenantId, ["accounting.read"], "invoice-customer-reader");
    expect((await request(app).get("/api/v1/contacts").set(accountingReader.auth)).status).toBe(403);
    const response = await request(app).get("/api/v1/invoice-customers").set(accountingReader.auth);
    expect(response.status).toBe(200);
    expect(response.body).toEqual([{
      id: activeCustomer.id,
      name: activeCustomer.name,
      email: activeCustomer.email,
      phone: activeCustomer.phone,
    }]);

    const crmReader = await userAuth(tenantA.tenantId, ["crm.read"], "invoice-customer-crm-only");
    expect((await request(app).get("/api/v1/invoice-customers").set(crmReader.auth)).status).toBe(403);
  });

  it("replaces a tenant-owned draft atomically, recomputes tax, audits, and locks issued history", async () => {
    const tenantA = await signupFinanceTenant("invoice-edit-a");
    const tenantB = await signupFinanceTenant("invoice-edit-b");
    const firstCustomer = await createContact(tenantA, "Original Customer");
    const nextCustomer = await createContact(tenantA, "Amended Customer");
    const otherCustomer = await createContact(tenantB, "Other Tenant Customer");
    const draft = await request(app).post("/api/v1/invoices").set(tenantA.auth).send({
      contactId: firstCustomer.id, currency: "USD",
      lines: [{ description: "Original line", quantity: "1", unitPrice: "10.00", taxTreatment: "standard" }],
    });
    expect(draft.status).toBe(200);

    const amended = await request(app).patch(`/api/v1/invoices/${draft.body.id}`).set(tenantA.auth).send({
      contactId: nextCustomer.id, currency: "USD", dueDate: "2026-08-31", notes: "Approved draft amendment",
      taxDate: "2026-07-13",
      lines: [
        { description: "Standard service", quantity: "2", unitPrice: "50.00", taxTreatment: "standard" },
        { description: "Exempt service", quantity: "1", unitPrice: "25.00", taxTreatment: "exempt" },
      ],
    });
    expect(amended.status).toBe(200);
    expect(amended.body).toMatchObject({
      contactId: nextCustomer.id, subtotal: "125.00", taxTotal: "15.00", total: "140.00", status: "DRAFT",
    });
    expect(amended.body.lines).toHaveLength(2);

    const crossTenant = await request(app).patch(`/api/v1/invoices/${draft.body.id}`).set(tenantA.auth).send({
      contactId: otherCustomer.id, currency: "USD",
      lines: [{ description: "Forbidden", quantity: "1", unitPrice: "1.00", taxTreatment: "standard" }],
    });
    expect(crossTenant.status).toBe(404);
    const unchanged = await request(app).get(`/api/v1/invoices/${draft.body.id}`).set(tenantA.auth);
    expect(unchanged.body).toMatchObject({ contactId: nextCustomer.id, total: "140.00" });
    expect(unchanged.body.contact.name).toBe("Amended Customer");

    expect((await request(app).post(`/api/v1/invoices/${draft.body.id}/issue`).set(tenantA.auth).send({})).status).toBe(200);
    expect((await request(app).patch(`/api/v1/invoices/${draft.body.id}`).set(tenantA.auth).send({
      contactId: nextCustomer.id, currency: "USD",
      lines: [{ description: "Illegal edit", quantity: "1", unitPrice: "1.00", taxTreatment: "standard" }],
    })).status).toBe(409);

    const [audit] = await db.select().from(schema.auditLogs).where(and(
      eq(schema.auditLogs.tenantId, tenantA.tenantId),
      eq(schema.auditLogs.action, "invoice.draft_updated"),
      eq(schema.auditLogs.entityId, draft.body.id),
    ));
    expect(audit).toBeTruthy();
  });
});
