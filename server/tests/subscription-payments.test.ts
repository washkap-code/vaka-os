import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { markSubscriptionInvoicePaid } from "../src/billing.js";
import { db, schema } from "../src/lib.js";

const app = createApp();
const unique = Date.now().toString(36);

async function createBillingAccount(label: string) {
  const response = await request(app).post("/api/v1/auth/signup").send({
    companyName: `${label} Company`, subdomain: `pay${unique}${label.toLowerCase()}`,
    baseCurrency: "USD", ownerEmail: `pay-${unique}-${label}@test.zw`,
    ownerPassword: "Subscription-Payment-Password-123!", ownerName: `${label} Owner`, planName: "Starter",
  });
  expect(response.status).toBe(200);
  const [subscription] = await db.select().from(schema.subscriptions)
    .where(eq(schema.subscriptions.tenantId, response.body.tenant.id));
  const [user] = await db.select().from(schema.users).where(and(
    eq(schema.users.tenantId, response.body.tenant.id),
    eq(schema.users.email, `pay-${unique}-${label}@test.zw`),
  ));
  const now = new Date();
  const [invoice] = await db.insert(schema.subscriptionInvoices).values({
    tenantId: response.body.tenant.id,
    subscriptionId: subscription.id,
    periodStart: now,
    periodEnd: new Date(now.getTime() + 30 * 86_400_000),
    amount: "19.00",
    currency: "USD",
    status: "pending",
    dueAt: new Date(now.getTime() + 14 * 86_400_000),
  }).returning();
  return { ...response.body, subscription, user, invoice };
}

describe("VAKA subscription payment controls", () => {
  it("keeps payment attempts tenant-scoped and provider activation truthful", async () => {
    const a = await createBillingAccount("Alpha");
    const b = await createBillingAccount("Bravo");
    const [attemptA] = await db.insert(schema.subscriptionPaymentAttempts).values({
      tenantId: a.tenant.id, subscriptionInvoiceId: a.invoice.id, merchantReference: `VAKA-${randomUUID()}`,
      idempotencyKey: `test-${randomUUID()}`, amount: a.invoice.amount, currency: "USD", status: "PENDING",
      initiatedBy: a.user.id,
    }).returning();
    const [attemptB] = await db.insert(schema.subscriptionPaymentAttempts).values({
      tenantId: b.tenant.id, subscriptionInvoiceId: b.invoice.id, merchantReference: `VAKA-${randomUUID()}`,
      idempotencyKey: `test-${randomUUID()}`, amount: b.invoice.amount, currency: "USD", status: "PENDING",
      initiatedBy: b.user.id,
    }).returning();
    const authA = { Authorization: `Bearer ${a.token}` };
    const list = await request(app).get("/api/v1/billing/payment-attempts").set(authA);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].id).toBe(attemptA.id);
    expect(JSON.stringify(list.body)).not.toContain("encryptedPollUrl");

    const crossTenantRefresh = await request(app)
      .post(`/api/v1/billing/payment-attempts/${attemptB.id}/refresh`).set(authA).send({});
    expect(crossTenantRefresh.status).toBe(404);
    const crossTenantInvoice = await request(app)
      .post(`/api/v1/billing/invoices/${b.invoice.id}/payment-attempts`).set(authA)
      .set("Idempotency-Key", `payment-${randomUUID()}`).send({});
    expect(crossTenantInvoice.status).toBe(404);

    const availability = await request(app).get("/api/v1/billing/payment-provider").set(authA);
    expect(availability.body).toEqual({ provider: "PAYNOW", available: false, currency: null, methods: [] });
    const unavailable = await request(app)
      .post(`/api/v1/billing/invoices/${a.invoice.id}/payment-attempts`).set(authA)
      .set("Idempotency-Key", `payment-${randomUUID()}`).send({});
    expect(unavailable.status).toBe(503);
    expect(unavailable.body.error).toBe("PAYMENT_PROVIDER_UNAVAILABLE");
  });

  it("settles provider evidence and subscription invoice atomically and idempotently", async () => {
    const account = await createBillingAccount("Charlie");
    const [attempt] = await db.insert(schema.subscriptionPaymentAttempts).values({
      tenantId: account.tenant.id, subscriptionInvoiceId: account.invoice.id,
      merchantReference: `VAKA-${randomUUID()}`, idempotencyKey: `test-${randomUUID()}`,
      amount: account.invoice.amount, currency: "USD", status: "PENDING", initiatedBy: account.user.id,
    }).returning();
    const confirmedAt = new Date();
    const first = await markSubscriptionInvoicePaid({
      tenantId: account.tenant.id, invoiceId: account.invoice.id, actorUserId: account.user.id,
      providerPayment: { attemptId: attempt.id, providerReference: "PAYNOW-123", providerStatus: "Paid", confirmedAt },
    });
    expect(first).toMatchObject({ paid: true, idempotent: false });
    const second = await markSubscriptionInvoicePaid({
      tenantId: account.tenant.id, invoiceId: account.invoice.id, actorUserId: account.user.id,
      providerPayment: { attemptId: attempt.id, providerReference: "PAYNOW-123", providerStatus: "Paid", confirmedAt },
    });
    expect(second).toMatchObject({ paid: true, idempotent: true });
    const [[invoice], [storedAttempt]] = await Promise.all([
      db.select().from(schema.subscriptionInvoices).where(eq(schema.subscriptionInvoices.id, account.invoice.id)),
      db.select().from(schema.subscriptionPaymentAttempts).where(eq(schema.subscriptionPaymentAttempts.id, attempt.id)),
    ]);
    expect(invoice.status).toBe("paid");
    expect(storedAttempt).toMatchObject({ status: "PAID", providerReference: "PAYNOW-123" });
    const events = await db.select().from(schema.auditLogs).where(and(
      eq(schema.auditLogs.tenantId, account.tenant.id),
      eq(schema.auditLogs.action, "billing.subscription_payment_confirmed"),
    ));
    expect(events).toHaveLength(1);
  });
});
