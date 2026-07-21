import { and, eq } from "drizzle-orm";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../../src/app.js";
import { createDraftInvoice } from "../../../src/invoicing.js";
import { db, schema } from "../../../src/lib.js";
import { assertSafeFinanceTestDatabase } from "../../finance/test-db-guard.js";
import { createContact, signupFinanceTenant } from "../../finance/helpers.js";

assertSafeFinanceTestDatabase();
const app = createApp();

describe("P1-004 workflow notification integration", () => {
  it("requires authentication for every inbox endpoint", async () => {
    expect((await request(app).get("/api/v1/notifications")).status).toBe(401);
    expect((await request(app).post("/api/v1/notifications/read-all").send({})).status).toBe(401);
    expect((await request(app).post("/api/v1/notifications/example/read").send({})).status).toBe(401);
  });

  it("creates an unread, tenant-scoped notification for the invoice approver", async () => {
    const tenant = await signupFinanceTenant("workflow-notification");
    const otherTenant = await signupFinanceTenant("workflow-notification-other");
    const customer = await createContact(tenant, "Workflow Notification Customer");
    const invoice = await createDraftInvoice({
      tenantId: tenant.tenantId,
      contactId: customer.id,
      currency: "USD",
      createdBy: tenant.userId,
      lines: [{ description: "Approval notification", quantity: "1", unitPrice: "75.00", taxRate: "15" }],
    });

    const issued = await request(app)
      .post(`/api/v1/invoices/${invoice.id}/issue`)
      .set(tenant.auth)
      .send({});
    expect(issued.status).toBe(200);

    const [notification] = await db.select().from(schema.notifications).where(and(
      eq(schema.notifications.tenantId, tenant.tenantId),
      eq(schema.notifications.userId, tenant.userId),
      eq(schema.notifications.template, "workflow.pending_approval.v1"),
      eq(schema.notifications.objectType, "Invoice"),
      eq(schema.notifications.objectId, invoice.id),
    ));
    expect(notification).toMatchObject({
      channel: "IN_APP",
      priority: "high",
      title: "Invoice approval required",
      body: "Invoice is awaiting your approval at authorise-issue.",
      link: `/invoices/${invoice.id}`,
      readAt: null,
    });

    const inbox = await request(app)
      .get("/api/v1/notifications")
      .query({ unread: "true", page: 1, pageSize: 10 })
      .set(tenant.auth);
    expect(inbox.status).toBe(200);
    expect(inbox.body).toMatchObject({ page: 1, pageSize: 10, hasMore: false });
    expect(inbox.body.notifications).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: notification.id,
        priority: "high",
        objectType: "Invoice",
        objectId: invoice.id,
        readAt: null,
      }),
    ]));

    const crossTenantRead = await request(app)
      .post(`/api/v1/notifications/${notification.id}/read`)
      .set(otherTenant.auth)
      .send({});
    expect(crossTenantRead.status).toBe(404);

    const marked = await request(app)
      .post(`/api/v1/notifications/${notification.id}/read`)
      .set(tenant.auth)
      .send({});
    expect(marked.status).toBe(200);
    expect(marked.body).toMatchObject({ id: notification.id });
    expect(marked.body.readAt).toEqual(expect.any(String));

    const unread = await request(app)
      .get("/api/v1/notifications")
      .query({ unread: "true" })
      .set(tenant.auth);
    expect(unread.status).toBe(200);
    expect(unread.body.notifications.map((item: { id: string }) => item.id))
      .not.toContain(notification.id);
  });

  it("respects an explicit disabled workflow preference", async () => {
    const tenant = await signupFinanceTenant("workflow-notification-disabled");
    await db.insert(schema.notificationPreferences).values({
      tenantId: tenant.tenantId,
      userId: tenant.userId,
      category: "workflow",
      channel: "IN_APP",
      enabled: false,
    });
    const customer = await createContact(tenant, "Disabled Notification Customer");
    const invoice = await createDraftInvoice({
      tenantId: tenant.tenantId,
      contactId: customer.id,
      currency: "USD",
      createdBy: tenant.userId,
      lines: [{ description: "Preference test", quantity: "1", unitPrice: "25.00", taxRate: "15" }],
    });

    const issued = await request(app)
      .post(`/api/v1/invoices/${invoice.id}/issue`)
      .set(tenant.auth)
      .send({});
    expect(issued.status).toBe(200);
    const notifications = await db.select({ id: schema.notifications.id })
      .from(schema.notifications).where(and(
        eq(schema.notifications.tenantId, tenant.tenantId),
        eq(schema.notifications.template, "workflow.pending_approval.v1"),
        eq(schema.notifications.objectId, invoice.id),
      ));
    expect(notifications).toEqual([]);
  });

  it("marks every unread current-user notification without touching another user", async () => {
    const tenant = await signupFinanceTenant("workflow-notification-read-all");
    await db.insert(schema.notifications).values([
      {
        id: `read-all-a-${tenant.userId}`,
        tenantId: tenant.tenantId,
        userId: tenant.userId,
        recipient: tenant.userId,
        channel: "IN_APP",
        template: "system.notice.v1",
        locale: "en-ZW",
        variables: {},
        priority: "normal",
        status: "accepted",
      },
      {
        id: `read-all-b-${tenant.userId}`,
        tenantId: tenant.tenantId,
        userId: tenant.userId,
        recipient: tenant.userId,
        channel: "IN_APP",
        template: "system.notice.v1",
        locale: "en-ZW",
        variables: {},
        priority: "high",
        status: "accepted",
      },
      {
        id: `read-all-unaddressed-${tenant.userId}`,
        tenantId: tenant.tenantId,
        recipient: "unaddressed",
        channel: "IN_APP",
        template: "system.notice.v1",
        locale: "en-ZW",
        variables: {},
        priority: "normal",
        status: "accepted",
      },
    ]);

    const page = await request(app).get("/api/v1/notifications")
      .query({ page: 1, pageSize: 1 }).set(tenant.auth);
    expect(page.status).toBe(200);
    expect(page.body).toMatchObject({ page: 1, pageSize: 1, total: 2, hasMore: true });
    expect(page.body.notifications).toHaveLength(1);

    const response = await request(app)
      .post("/api/v1/notifications/read-all")
      .set(tenant.auth)
      .send({});
    expect(response.status).toBe(200);
    expect(response.body.updated).toBe(2);
    const rows = await db.select({ id: schema.notifications.id, readAt: schema.notifications.readAt })
      .from(schema.notifications).where(eq(schema.notifications.tenantId, tenant.tenantId));
    expect(rows.filter((row) => row.id.startsWith("read-all-a-") || row.id.startsWith("read-all-b-"))
      .every((row) => row.readAt instanceof Date)).toBe(true);
    expect(rows.find((row) => row.id.startsWith("read-all-unaddressed-"))?.readAt).toBeNull();
  });
});
