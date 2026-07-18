import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createDraftInvoice, issueInvoice, recordPayment } from "../src/invoicing.js";
import { db, schema } from "../src/lib.js";
import { EVENT_BUS, platformKernel } from "../src/platform-runtime.js";
import { DOMAIN_EVENTS } from "../src/platform/events/registry.js";
import { createContact, signupFinanceTenant } from "./finance/helpers.js";

describe("P1-005 domain event integration", () => {
  it("emits invoice and payment facts only after their rows commit", async () => {
    const tenant = await signupFinanceTenant("domain-events");
    const customer = await createContact(tenant, "Event Customer");
    const draft = await createDraftInvoice({
      tenantId: tenant.tenantId, contactId: customer.id, currency: "USD", createdBy: tenant.userId,
      lines: [{ description: "Event service", quantity: "1", unitPrice: "100.00", taxRate: "15" }],
    });
    const bus = platformKernel().container.get(EVENT_BUS);
    const received: string[] = [];
    const invoiceSubscription = bus.subscribe<{ invoiceId: string }>(DOMAIN_EVENTS.INVOICE_ISSUED, async (event) => {
      const [row] = await db.select().from(schema.invoices).where(and(
        eq(schema.invoices.id, event.payload.invoiceId), eq(schema.invoices.status, "ISSUED"),
      ));
      if (row) received.push(`invoice:${event.tenantId}:${event.actorUserId}`);
    });
    const paymentSubscription = bus.subscribe<{ paymentId: string }>(DOMAIN_EVENTS.PAYMENT_RECORDED, async (event) => {
      const [row] = await db.select().from(schema.payments).where(eq(schema.payments.id, event.payload.paymentId));
      if (row) received.push(`payment:${event.tenantId}:${event.actorUserId}`);
    });
    const issued = await issueInvoice({ tenantId: tenant.tenantId, invoiceId: draft.id, createdBy: tenant.userId });
    await recordPayment({
      tenantId: tenant.tenantId, invoiceId: issued.id, amount: "25.00",
      idempotencyKey: `event-payment-${Date.now()}`, createdBy: tenant.userId,
    });
    invoiceSubscription.unsubscribe();
    paymentSubscription.unsubscribe();
    expect(received).toEqual([
      `invoice:${tenant.tenantId}:${tenant.userId}`,
      `payment:${tenant.tenantId}:${tenant.userId}`,
    ]);
    const persisted = await db.select({
      eventType: schema.platformEvents.eventType,
      objectId: schema.platformEvents.objectId,
      status: schema.platformEvents.status,
    }).from(schema.platformEvents).where(eq(schema.platformEvents.tenantId, tenant.tenantId));
    expect(persisted).toEqual(expect.arrayContaining([
      expect.objectContaining({ eventType: DOMAIN_EVENTS.INVOICE_CREATED, objectId: draft.id, status: "processed" }),
      expect.objectContaining({ eventType: DOMAIN_EVENTS.INVOICE_ISSUED, objectId: draft.id, status: "processed" }),
      expect.objectContaining({ eventType: DOMAIN_EVENTS.PAYMENT_RECEIVED, objectId: expect.any(String), status: "processed" }),
      expect.objectContaining({ eventType: DOMAIN_EVENTS.PAYMENT_RECORDED, objectId: expect.any(String), status: "processed" }),
    ]));
  });
});
