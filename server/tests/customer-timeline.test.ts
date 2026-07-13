import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { login } from "../src/auth.js";
import { createDraftInvoice, issueInvoice, recordPayment, voidInvoice } from "../src/invoicing.js";
import { db, schema } from "../src/lib.js";
import { DOMAIN_EVENTS, runWithPostCommitEvents } from "../src/platform/events/index.js";
import { createContact, signupFinanceTenant } from "./finance/helpers.js";

const app = createApp();

async function tokenWithPermissions(tenantId: string, permissions: string[], label: string): Promise<string> {
  const [tenant] = await db.select({ subdomain: schema.tenants.subdomain })
    .from(schema.tenants).where(eq(schema.tenants.id, tenantId));
  const [role] = await db.insert(schema.roles).values({
    tenantId, name: `Timeline ${label} ${Date.now()}`, permissions, isSystem: false,
  }).returning();
  const email = `timeline-${label}-${Date.now()}@test.vaka`;
  const password = "Timeline-Test-123!";
  await db.insert(schema.users).values({
    tenantId, email, passwordHash: await bcrypt.hash(password, 4), fullName: `Timeline ${label}`, roleId: role.id,
  });
  return (await login(email, password, tenant.subdomain)).token;
}

describe("P3-003 customer timeline", () => {
  it("records manual activity atomically, audits it and projects it after commit", async () => {
    const tenant = await signupFinanceTenant("timeline-activity");
    const customer = await createContact(tenant, "Timeline Customer");
    const response = await request(app).post("/api/v1/activities").set(tenant.auth).send({
      contactId: customer.id, type: "email", body: "Sent the revised quotation.",
    });
    expect(response.status).toBe(200);

    const timeline = await request(app).get(`/api/v1/contacts/${customer.id}/timeline`).set(tenant.auth);
    expect(timeline.status).toBe(200);
    expect(timeline.headers["cache-control"]).toBe("private, no-store");
    expect(timeline.body.items).toHaveLength(1);
    expect(timeline.body.items[0]).toMatchObject({
      kind: "activity.recorded",
      sourceId: response.body.id,
      actorUserId: tenant.userId,
      detail: { type: "activity", activityType: "email", body: "Sent the revised quotation." },
    });

    const [audit] = await db.select().from(schema.auditLogs).where(and(
      eq(schema.auditLogs.tenantId, tenant.tenantId),
      eq(schema.auditLogs.action, "activity.recorded"),
      eq(schema.auditLogs.entityId, response.body.id),
    ));
    expect(audit).toMatchObject({ userId: tenant.userId, entityType: "activity" });

    expect((await request(app).post("/api/v1/activities").set(tenant.auth).send({
      contactId: customer.id, type: "note", body: "   ",
    })).status).toBe(400);
  });

  it("combines issued/voided invoices and exact-cent payments without duplicating canonical records", async () => {
    const tenant = await signupFinanceTenant("timeline-finance");
    const customer = await createContact(tenant, "Financial Timeline Customer");
    const draft = await createDraftInvoice({
      tenantId: tenant.tenantId, contactId: customer.id, currency: "USD", createdBy: tenant.userId,
      lines: [{ description: "Timeline service", quantity: "1", unitPrice: "100.00", taxRate: "15" }],
    });
    const issued = await issueInvoice({ tenantId: tenant.tenantId, invoiceId: draft.id, createdBy: tenant.userId });
    await recordPayment({
      tenantId: tenant.tenantId, invoiceId: issued.id, amount: "25.01",
      idempotencyKey: `timeline-payment-${issued.id}`, reference: "BANK-2501", createdBy: tenant.userId,
    });

    const voidCustomer = await createContact(tenant, "Void Timeline Customer");
    const voidDraft = await createDraftInvoice({
      tenantId: tenant.tenantId, contactId: voidCustomer.id, currency: "USD", createdBy: tenant.userId,
      lines: [{ description: "Void service", quantity: "1", unitPrice: "10.00", taxRate: "15" }],
    });
    await issueInvoice({ tenantId: tenant.tenantId, invoiceId: voidDraft.id, createdBy: tenant.userId });
    await voidInvoice({ tenantId: tenant.tenantId, invoiceId: voidDraft.id, reason: "Customer cancelled", createdBy: tenant.userId });

    const timeline = await request(app).get(`/api/v1/contacts/${customer.id}/timeline`).set(tenant.auth);
    expect(timeline.status).toBe(200);
    expect(timeline.body.items.map((item: { kind: string }) => item.kind)).toEqual([
      "payment.recorded", "invoice.issued",
    ]);
    expect(timeline.body.items[0]).toMatchObject({
      detail: { type: "payment", amountCents: "2501", currency: "USD", reference: "BANK-2501" },
    });
    expect(timeline.body.items[1]).toMatchObject({
      detail: { type: "invoice", totalCents: "11500", currency: "USD" },
    });

    const voidTimeline = await request(app).get(`/api/v1/contacts/${voidCustomer.id}/timeline`).set(tenant.auth);
    expect(voidTimeline.body.items.map((item: { kind: string }) => item.kind)).toEqual([
      "invoice.voided", "invoice.issued",
    ]);
    expect(await db.select().from(schema.contacts).where(eq(schema.contacts.id, customer.id))).toHaveLength(1);
    expect(await db.select().from(schema.invoices).where(eq(schema.invoices.id, issued.id))).toHaveLength(1);
  });

  it("reconciles pre-existing history, paginates deterministically and rejects invalid cursors", async () => {
    const tenant = await signupFinanceTenant("timeline-reconcile");
    const customer = await createContact(tenant, "Reconcile Customer");
    const occurredAt = new Date("2026-06-01T10:00:00.000Z");
    await db.insert(schema.activities).values([
      { tenantId: tenant.tenantId, contactId: customer.id, type: "call", body: "First", ownerUserId: tenant.userId, createdAt: occurredAt },
      { tenantId: tenant.tenantId, contactId: customer.id, type: "note", body: "Second", ownerUserId: tenant.userId, createdAt: occurredAt },
      { tenantId: tenant.tenantId, contactId: customer.id, type: "task", body: "Third", ownerUserId: tenant.userId, createdAt: occurredAt },
    ]);
    expect(await db.select().from(schema.customerTimelineEvents).where(eq(schema.customerTimelineEvents.contactId, customer.id))).toHaveLength(0);

    const first = await request(app).get(`/api/v1/contacts/${customer.id}/timeline`).query({ limit: 2 }).set(tenant.auth);
    expect(first.status).toBe(200);
    expect(first.body.items).toHaveLength(2);
    expect(first.body.nextCursor).toEqual(expect.any(String));
    const second = await request(app).get(`/api/v1/contacts/${customer.id}/timeline`)
      .query({ limit: 2, cursor: first.body.nextCursor }).set(tenant.auth);
    expect(second.status).toBe(200);
    expect(second.body.items).toHaveLength(1);
    expect(second.body.items[0].id).not.toBe(first.body.items[0].id);
    await request(app).get(`/api/v1/contacts/${customer.id}/timeline`).set(tenant.auth);
    expect(await db.select().from(schema.customerTimelineEvents).where(eq(schema.customerTimelineEvents.contactId, customer.id))).toHaveLength(3);
    expect((await request(app).get(`/api/v1/contacts/${customer.id}/timeline`).query({ cursor: "not-a-cursor" }).set(tenant.auth)).status).toBe(400);
  });

  it("enforces read/write permissions, tenant isolation and rollback boundaries", async () => {
    const tenantA = await signupFinanceTenant("timeline-scope-a");
    const tenantB = await signupFinanceTenant("timeline-scope-b");
    const customerA = await createContact(tenantA, "Tenant A Customer");
    const customerB = await createContact(tenantB, "Tenant B Customer");
    await request(app).post("/api/v1/activities").set(tenantA.auth).send({
      contactId: customerA.id, type: "note", body: "Tenant A only",
    });

    expect((await request(app).get(`/api/v1/contacts/${customerA.id}/timeline`).set(tenantB.auth)).status).toBe(404);
    expect((await request(app).post("/api/v1/activities").set(tenantB.auth).send({
      contactId: customerA.id, type: "note", body: "Cross tenant",
    })).status).toBe(404);

    const readOnlyToken = await tokenWithPermissions(tenantA.tenantId, ["crm.read"], "read-only");
    const writeOnlyToken = await tokenWithPermissions(tenantA.tenantId, ["crm.write"], "write-only");
    expect((await request(app).get(`/api/v1/contacts/${customerA.id}/timeline`)
      .set({ Authorization: `Bearer ${readOnlyToken}` })).status).toBe(200);
    expect((await request(app).post("/api/v1/activities").set({ Authorization: `Bearer ${readOnlyToken}` }).send({
      contactId: customerA.id, type: "note", body: "Denied",
    })).status).toBe(403);
    expect((await request(app).get(`/api/v1/contacts/${customerA.id}/timeline`)
      .set({ Authorization: `Bearer ${writeOnlyToken}` })).status).toBe(403);

    let rolledBackId = "";
    await expect(runWithPostCommitEvents((queue) => db.transaction(async (tx) => {
      const [activity] = await tx.insert(schema.activities).values({
        tenantId: tenantB.tenantId, contactId: customerB.id, type: "note", body: "Rolled back",
      }).returning();
      rolledBackId = activity.id;
      queue({
        id: `${DOMAIN_EVENTS.ACTIVITY_RECORDED}:${activity.id}`,
        type: DOMAIN_EVENTS.ACTIVITY_RECORDED,
        tenantId: tenantB.tenantId,
        actorUserId: tenantB.userId,
        payload: { activityId: activity.id, customerId: customerB.id },
      });
      throw new Error("synthetic rollback");
    }))).rejects.toThrow("synthetic rollback");
    expect(await db.select().from(schema.activities).where(eq(schema.activities.id, rolledBackId))).toHaveLength(0);
    expect(await db.select().from(schema.customerTimelineEvents).where(eq(schema.customerTimelineEvents.sourceId, rolledBackId))).toHaveLength(0);
  });
});
