import { and, eq } from "drizzle-orm";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../../src/app.js";
import { issueAuthenticatedSession } from "../../../src/auth.js";
import { db, schema } from "../../../src/lib.js";
import { DOMAIN_EVENTS } from "../../../src/platform/events/registry.js";
import { signupFinanceTenant, type TestTenant } from "../../finance/helpers.js";

const app = createApp();
const unique = `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
let tenantA: TestTenant;
let tenantB: TestTenant;
let crmReaderAuth: { Authorization: string };
let customerId: string;

beforeAll(async () => {
  tenantA = await signupFinanceTenant("timeline-a");
  tenantB = await signupFinanceTenant("timeline-b");
  const [role] = await db.insert(schema.roles).values({
    tenantId: tenantA.tenantId,
    name: `Timeline Reader ${unique}`,
    permissions: ["crm.read"],
    isSystem: false,
  }).returning();
  const [reader] = await db.insert(schema.users).values({
    tenantId: tenantA.tenantId,
    email: `timeline-reader-${unique}@test.vaka`,
    passwordHash: "not-used-by-timeline-test",
    fullName: "Timeline Reader",
    roleId: role.id,
    mustChangePassword: false,
    status: "active",
  }).returning();
  const session = await issueAuthenticatedSession(reader.id);
  crmReaderAuth = { Authorization: `Bearer ${session.token}` };

  const customer = await request(app).post("/api/v1/contacts").set(tenantA.auth).send({
    type: "COMPANY", name: `Timeline Customer ${unique}`, isCustomer: true, isVendor: false, tags: [],
  });
  expect(customer.status).toBe(200);
  customerId = customer.body.id;
});

describe("P1-006 universal object timeline", () => {
  it("merges all four sources in reverse chronology with bounded details", async () => {
    const base = Date.now() + 60_000;
    const [definition] = await db.insert(schema.workflowDefinitions).values({
      tenantId: tenantA.tenantId,
      name: `Customer Review ${unique}`,
      version: 1,
      objectType: "Customer",
      stepsJson: [{
        name: "Review",
        approver: { type: "role", permission: "crm.read", role: "Owner" },
      }],
      active: true,
    }).returning();
    const [instance] = await db.insert(schema.workflowInstances).values({
      tenantId: tenantA.tenantId,
      definitionId: definition.id,
      objectType: "Customer",
      objectId: customerId,
      status: "COMPLETED",
      currentStep: 1,
      startedBy: tenantA.userId,
      startedAt: new Date(base),
      completedAt: new Date(base + 2_000),
    }).returning();
    const [workflow] = await db.insert(schema.workflowActions).values({
      instanceId: instance.id,
      step: 0,
      actorId: tenantA.userId,
      action: "APPROVE",
      comment: "Reviewed",
      actedAt: new Date(base + 2_000),
    }).returning();
    const eventId = `timeline-event-${unique}`;
    await db.insert(schema.platformEvents).values({
      id: eventId,
      tenantId: tenantA.tenantId,
      eventType: DOMAIN_EVENTS.CUSTOMER_CHANGED,
      objectType: "Customer",
      objectId: customerId,
      actorId: tenantA.userId,
      payloadJson: { customerId, change: "updated" },
      occurredAt: new Date(base + 1_000),
      processedAt: new Date(base + 1_000),
      status: "processed",
      retryCount: 0,
    });
    const notificationId = `timeline-notification-${unique}`;
    await db.insert(schema.notifications).values({
      id: notificationId,
      tenantId: tenantA.tenantId,
      userId: tenantA.userId,
      recipient: tenantA.userId,
      channel: "IN_APP",
      template: "timeline.test.v1",
      locale: "en",
      variables: { privateValue: "not returned" },
      priority: "normal",
      title: "Customer review complete",
      body: "Private notification body",
      objectType: "Customer",
      objectId: customerId,
      status: "accepted",
      transmitted: false,
      createdAt: new Date(base + 3_000),
    });

    const response = await request(app)
      .get(`/api/v1/objects/customer/${customerId}/timeline`)
      .query({ page: 1, pageSize: 100 })
      .set(crmReaderAuth);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      object: { type: "Customer", id: customerId },
      page: 1,
      pageSize: 100,
      order: "desc",
    });
    expect(response.body.entries.map((entry: { kind: string }) => entry.kind))
      .toEqual(expect.arrayContaining(["audit", "event", "workflow", "notification"]));
    expect(response.body.entries.slice(0, 3).map((entry: { id: string }) => entry.id))
      .toEqual([notificationId, workflow.id, eventId]);
    const notification = response.body.entries.find((entry: { id: string }) => entry.id === notificationId);
    expect(notification.details).not.toHaveProperty("body");
    expect(notification.details).not.toHaveProperty("variables");
    const autoAudit = response.body.entries.find((entry: { kind: string; details: { source?: string } }) =>
      entry.kind === "audit" && entry.details.source === "auto");
    expect(autoAudit.details.after).not.toHaveProperty("tenantId");
  });

  it("enforces object permissions, tenant scope, unknown objects and pagination", async () => {
    const allowed = await request(app).get(`/api/v1/objects/Customer/${customerId}/timeline`)
      .query({ page: 1, pageSize: 2 }).set(crmReaderAuth);
    expect(allowed.status).toBe(200);
    expect(allowed.body.entries.length).toBeLessThanOrEqual(2);
    expect(allowed.body.hasMore).toBe(true);

    const financeDenied = await request(app)
      .get("/api/v1/objects/Invoice/11111111-1111-4111-8111-111111111111/timeline")
      .set(crmReaderAuth);
    expect(financeDenied.status).toBe(403);

    const crossTenant = await request(app).get(`/api/v1/objects/Customer/${customerId}/timeline`)
      .set(tenantB.auth);
    expect(crossTenant.status).toBe(404);
    const unknownType = await request(app)
      .get(`/api/v1/objects/Unknown/${customerId}/timeline`).set(tenantA.auth);
    expect(unknownType.status).toBe(400);
    const unknownObject = await request(app)
      .get("/api/v1/objects/Customer/11111111-1111-4111-8111-111111111111/timeline")
      .set(tenantA.auth);
    expect(unknownObject.status).toBe(404);
  });

  it("keeps timeline notification rows tenant-scoped", async () => {
    const rows = await db.select({ tenantId: schema.notifications.tenantId })
      .from(schema.notifications).where(and(
        eq(schema.notifications.objectType, "Customer"),
        eq(schema.notifications.objectId, customerId),
      ));
    expect(rows.every((row) => row.tenantId === tenantA.tenantId)).toBe(true);
  });
});
