import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { createApp } from "../src/app.js";
import { db, schema } from "../src/lib.js";

const app = createApp();
const uniq = Date.now().toString(36);
let token: string;
let tenantId: string;
let subscriptionId: string;
let invoiceId: string;

beforeAll(async () => {
  const signup = await request(app).post("/api/v1/auth/signup").send({
    companyName: "Arrears Test",
    subdomain: `arrears${uniq}`,
    baseCurrency: "USD",
    ownerEmail: `arrears-${uniq}@test.zw`,
    ownerPassword: "Arrears-Password-123!",
    ownerName: "Arrears Owner",
    planName: "Starter",
  });
  expect(signup.status).toBe(200);
  token = signup.body.token;
  tenantId = signup.body.tenant.id;
  const [subscription] = await db.select().from(schema.subscriptions)
    .where(eq(schema.subscriptions.tenantId, tenantId));
  subscriptionId = subscription.id;
});

const auth = () => ({ Authorization: `Bearer ${token}` });
const daysFromNow = (days: number) => new Date(Date.now() + days * 86_400_000);

describe("arrears notifications", () => {
  it("reports an exact due-soon balance", async () => {
    const [invoice] = await db.insert(schema.subscriptionInvoices).values({
      tenantId,
      subscriptionId,
      periodStart: daysFromNow(-27),
      periodEnd: daysFromNow(3),
      amount: "19.00",
      currency: "USD",
      status: "pending",
      dueAt: daysFromNow(3),
    }).returning();
    invoiceId = invoice.id;

    const response = await request(app).get("/api/v1/billing/arrears-status").set(auth());
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      stage: "DUE_SOON",
      overdueInvoiceCount: 0,
      dueSoonInvoiceCount: 1,
      amounts: [{ currency: "USD", amount: "19.00" }],
    });
  });

  it("escalates overdue and suspended states", async () => {
    await db.update(schema.subscriptionInvoices).set({
      status: "overdue",
      dueAt: daysFromNow(-10),
    }).where(eq(schema.subscriptionInvoices.id, invoiceId));

    const overdue = await request(app).get("/api/v1/billing/arrears-status").set(auth());
    expect(overdue.body.stage).toBe("OVERDUE");
    expect(overdue.body.daysOverdue).toBeGreaterThanOrEqual(9);

    await db.update(schema.tenants).set({ status: "SUSPENDED" })
      .where(eq(schema.tenants.id, tenantId));
    const suspended = await request(app).get("/api/v1/billing/arrears-status").set(auth());
    expect(suspended.body.stage).toBe("SUSPENDED");
  });

  it("clears the notice after settlement", async () => {
    await db.update(schema.subscriptionInvoices).set({
      status: "paid",
      paidAt: new Date(),
    }).where(eq(schema.subscriptionInvoices.id, invoiceId));
    await db.update(schema.tenants).set({ status: "ACTIVE" })
      .where(eq(schema.tenants.id, tenantId));

    const response = await request(app).get("/api/v1/billing/arrears-status").set(auth());
    expect(response.body).toMatchObject({
      stage: "CLEAR",
      overdueInvoiceCount: 0,
      dueSoonInvoiceCount: 0,
      amounts: [],
    });
  });
});
