import { and, eq } from "drizzle-orm";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../../src/app.js";
import { issueAuthenticatedSession } from "../../../src/auth.js";
import { db, schema } from "../../../src/lib.js";
import { DOMAIN_EVENTS } from "../../../src/platform/events/registry.js";
import { EVENT_BUS, platformKernel } from "../../../src/platform-runtime.js";
import { signupFinanceTenant, type TestTenant } from "../../finance/helpers.js";

const app = createApp();
const unique = `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
let tenantA: TestTenant;
let tenantB: TestTenant;
let platformAuth: { Authorization: string };

beforeAll(async () => {
  tenantA = await signupFinanceTenant("event-admin-a");
  tenantB = await signupFinanceTenant("event-admin-b");
  const roleKey = `EVENT_OPERATOR_${unique}`;
  await db.insert(schema.platformRoles).values({
    key: roleKey,
    name: "Event test operator",
    permissions: ["platform.operations.read"],
    isSystem: false,
  });
  const [operator] = await db.insert(schema.users).values({
    tenantId: null,
    email: `event-operator-${unique}@test.vaka`,
    passwordHash: "not-used-by-event-test",
    fullName: "Event Test Operator",
    isPlatformAdmin: true,
    platformRoleKey: roleKey,
    status: "active",
  }).returning();
  const session = await issueAuthenticatedSession(operator.id);
  platformAuth = { Authorization: `Bearer ${session.token}` };
});

async function createCustomer(tenant: TestTenant, name: string) {
  return request(app).post("/api/v1/contacts").set(tenant.auth).send({
    type: "COMPANY",
    name,
    isCustomer: true,
    isVendor: false,
    tags: [],
  });
}

describe("P1-005 persisted event integration", () => {
  it("persists canonical facts and never lets a throwing subscriber fail the user request", async () => {
    const bus = platformKernel().container.get(EVENT_BUS);
    const handlerName = `test.throwing-customer-${unique}`;
    const subscription = bus.subscribe(DOMAIN_EVENTS.CUSTOMER_CREATED, () => {
      throw new Error("controlled subscriber failure");
    }, { handlerName });

    const created = await createCustomer(tenantA, `Persisted Customer ${unique}`);
    expect(created.status).toBe(200);
    await bus.waitForIdle();
    subscription.unsubscribe();

    const [event] = await db.select().from(schema.platformEvents).where(and(
      eq(schema.platformEvents.tenantId, tenantA.tenantId),
      eq(schema.platformEvents.eventType, DOMAIN_EVENTS.CUSTOMER_CREATED),
      eq(schema.platformEvents.objectId, created.body.id),
    ));
    expect(event).toMatchObject({
      objectType: "Customer",
      status: "failed",
      retryCount: 3,
      payloadJson: { customerId: created.body.id },
    });
    expect(event.processedAt).toBeNull();
  });

  it("exposes only the requested tenant page to an operations administrator", async () => {
    const createdA = await createCustomer(tenantA, `Admin Event A ${unique}`);
    const createdB = await createCustomer(tenantB, `Admin Event B ${unique}`);
    expect(createdA.status).toBe(200);
    expect(createdB.status).toBe(200);

    expect((await request(app).get("/api/v1/platform/events")
      .query({ tenantId: tenantA.tenantId })).status).toBe(401);
    const tenantDenied = await request(app).get("/api/v1/platform/events")
      .query({ tenantId: tenantA.tenantId }).set(tenantA.auth);
    expect(tenantDenied.status).toBe(400);
    expect(tenantDenied.body.message).toBe("Tenant context is derived from the authenticated session");
    expect((await request(app).get("/api/v1/platform/events")
      .set(platformAuth)).status).toBe(400);

    const response = await request(app).get("/api/v1/platform/events").query({
      tenantId: tenantA.tenantId,
      eventType: DOMAIN_EVENTS.CUSTOMER_CREATED,
      page: 1,
      pageSize: 100,
    }).set(platformAuth);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ page: 1, pageSize: 100 });
    expect(response.body.events.length).toBeGreaterThan(0);
    expect(response.body.events.every((event: { payload: { customerId: string } }) =>
      event.payload.customerId !== createdB.body.id)).toBe(true);
    expect(response.body.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectId: createdA.body.id,
        eventType: DOMAIN_EVENTS.CUSTOMER_CREATED,
      }),
    ]));
  });

  it("publishes product and employee creation facts after their writes commit", async () => {
    const product = await request(app).post("/api/v1/products").set(tenantA.auth).send({
      sku: `EVENT-${unique}`,
      name: `Event Product ${unique}`,
      costPrice: "10.00",
      salePrice: "15.00",
      currency: "USD",
      taxTreatment: "standard",
      reorderLevel: 0,
      trackStock: false,
    });
    const employee = await request(app).post("/api/v1/payroll/employees").set(tenantA.auth).send({
      employeeNumber: `EV-${unique}`.slice(0, 30),
      firstName: "Event",
      lastName: "Employee",
      currency: "USD",
      basicSalary: "500.00",
    });
    expect(product.status).toBe(200);
    expect(employee.status).toBe(200);

    const facts = await db.select().from(schema.platformEvents).where(and(
      eq(schema.platformEvents.tenantId, tenantA.tenantId),
      eq(schema.platformEvents.status, "processed"),
    ));
    expect(facts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        eventType: DOMAIN_EVENTS.PRODUCT_CREATED,
        objectId: product.body.id,
        payloadJson: { productId: product.body.id },
      }),
      expect.objectContaining({
        eventType: DOMAIN_EVENTS.EMPLOYEE_CREATED,
        objectId: employee.body.id,
        payloadJson: { employeeId: employee.body.id },
      }),
    ]));
  });
});
