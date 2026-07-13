import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { login } from "../src/auth.js";
import { createApp } from "../src/app.js";
import { recordEmailPreference } from "../src/communication-preferences.js";
import { getCustomerStatementSummary } from "../src/customer-statements.js";
import { sendFinanceDocument } from "../src/finance-document-delivery.js";
import { createDraftInvoice, issueInvoice } from "../src/invoicing.js";
import { db, schema } from "../src/lib.js";
import { NOTIFICATION_SERVICE, buildPlatformKernel } from "../src/platform-runtime.js";
import { createContact, signupFinanceTenant } from "./finance/helpers.js";

const app = createApp();

async function issuedInvoice(opts: {
  tenant: Awaited<ReturnType<typeof signupFinanceTenant>>;
  contactId: string;
  currency?: "USD" | "ZWG";
  unitPrice?: string;
  dueDate?: Date;
}) {
  const draft = await createDraftInvoice({
    tenantId: opts.tenant.tenantId,
    contactId: opts.contactId,
    currency: opts.currency ?? "USD",
    dueDate: opts.dueDate ?? new Date("2026-12-31T00:00:00.000Z"),
    createdBy: opts.tenant.userId,
    lines: [{ description: "Delivery test", quantity: "1", unitPrice: opts.unitPrice ?? "100.00", taxRate: "15" }],
  });
  return issueInvoice({ tenantId: opts.tenant.tenantId, invoiceId: draft.id, createdBy: opts.tenant.userId });
}

describe("P7-001 finance document delivery", () => {
  it("sends one consented invoice email plus in-app outcome and deduplicates replay without finance mutation", async () => {
    const tenant = await signupFinanceTenant("finance-delivery-invoice");
    const contact = await createContact(tenant, "Delivery Customer", { email: "delivery.customer@example.com" });
    const invoice = await issuedInvoice({ tenant, contactId: contact.id });
    const preference = await recordEmailPreference({
      tenantId: tenant.tenantId,
      contactId: contact.id,
      actorUserId: tenant.userId,
      status: "CONSENTED",
      locale: "en-ZW",
      evidenceSource: "CUSTOMER_REQUEST",
      reason: "Customer requested invoices by email.",
    });
    const providerMessages: Array<{ recipient: string; locale: string; variables: Record<string, string> }> = [];
    const service = buildPlatformKernel({
      emailTransport: async (message) => {
        providerMessages.push(message);
        return { providerMessageId: "provider-invoice-1" };
      },
    }).container.get(NOTIFICATION_SERVICE);
    const journalsBefore = await db.select({ id: schema.journalEntries.id }).from(schema.journalEntries)
      .where(eq(schema.journalEntries.tenantId, tenant.tenantId));
    const first = await sendFinanceDocument({
      tenantId: tenant.tenantId,
      actorUserId: tenant.userId,
      idempotencyKey: "invoice-delivery-key-001",
      kind: "INVOICE",
      invoiceId: invoice.id,
    }, service);
    const replay = await sendFinanceDocument({
      tenantId: tenant.tenantId,
      actorUserId: tenant.userId,
      idempotencyKey: "invoice-delivery-key-001",
      kind: "INVOICE",
      invoiceId: invoice.id,
    }, service);
    expect(first).toMatchObject({ status: "SENT", deduplicated: false });
    expect(replay).toMatchObject({ requestId: first.requestId, status: "SENT", deduplicated: true });
    await expect(sendFinanceDocument({
      tenantId: tenant.tenantId,
      actorUserId: tenant.userId,
      idempotencyKey: "invoice-delivery-key-001",
      kind: "STATEMENT",
      contactId: contact.id,
      asAt: new Date("2026-12-31T23:59:59.999Z"),
    }, service)).rejects.toMatchObject({ status: 409 });
    expect(providerMessages).toHaveLength(1);
    expect(providerMessages[0]).toMatchObject({ recipient: contact.email, locale: "en-ZW" });
    expect(providerMessages[0].variables.documentUrl).toMatch(/^http:\/\/localhost:4000\/api\/v1\/public\/invoices\//);
    const notifications = await db.select().from(schema.notifications)
      .where(eq(schema.notifications.tenantId, tenant.tenantId));
    expect(notifications.filter((row) => row.channel === "EMAIL")).toHaveLength(1);
    expect(notifications.filter((row) => row.channel === "IN_APP")).toHaveLength(1);
    expect(notifications.find((row) => row.channel === "EMAIL")?.variables)
      .toMatchObject({ documentUrl: "[REDACTED]" });
    const links = await db.select().from(schema.invoiceShareLinks)
      .where(eq(schema.invoiceShareLinks.invoiceId, invoice.id));
    expect(links).toHaveLength(1);
    const [delivery] = await db.select().from(schema.financeDocumentDeliveryRequests)
      .where(eq(schema.financeDocumentDeliveryRequests.id, first.requestId));
    expect(delivery).toMatchObject({ status: "SENT", shareLinkId: links[0].id });
    const [preserved] = await db.select().from(schema.invoices).where(eq(schema.invoices.id, invoice.id));
    expect(preserved).toMatchObject({ status: "ISSUED", amountPaid: "0.00", total: invoice.total });
    const journalsAfter = await db.select({ id: schema.journalEntries.id }).from(schema.journalEntries)
      .where(eq(schema.journalEntries.tenantId, tenant.tenantId));
    expect(journalsAfter).toHaveLength(journalsBefore.length);
    const audits = await db.select().from(schema.auditLogs).where(eq(schema.auditLogs.tenantId, tenant.tenantId));
    expect(audits.some((row) => row.action === "finance_delivery.sent"
      && (row.metadata as { consentEventId?: string })?.consentEventId === preference.id)).toBe(true);
    expect(JSON.stringify(audits)).not.toContain(providerMessages[0].variables.documentUrl);
  });

  it("keeps statement currencies exact and uses reviewed English fallback for an isiNdebele preference", async () => {
    const tenant = await signupFinanceTenant("finance-delivery-statement");
    const contact = await createContact(tenant, "Statement Customer", { email: "statement.customer@example.com" });
    await issuedInvoice({ tenant, contactId: contact.id, currency: "USD", unitPrice: "100.00" });
    await issuedInvoice({ tenant, contactId: contact.id, currency: "ZWG", unitPrice: "200.00" });
    await recordEmailPreference({
      tenantId: tenant.tenantId,
      contactId: contact.id,
      actorUserId: tenant.userId,
      status: "CONSENTED",
      locale: "nd-ZW",
      evidenceSource: "CONTRACT",
    });
    const statement = await getCustomerStatementSummary({
      tenantId: tenant.tenantId,
      contactId: contact.id,
      asAt: new Date("2026-12-31T23:59:59.999Z"),
    });
    expect(statement.reconciled).toBe(true);
    expect(statement.currencies).toEqual([
      { currency: "USD", invoiced: "115.00", paid: "0.00", outstanding: "115.00" },
      { currency: "ZWG", invoiced: "230.00", paid: "0.00", outstanding: "230.00" },
    ]);
    const providerMessages: Array<{ locale: string; variables: Record<string, string> }> = [];
    const service = buildPlatformKernel({
      emailTransport: async (message) => { providerMessages.push(message); return {}; },
    }).container.get(NOTIFICATION_SERVICE);
    await sendFinanceDocument({
      tenantId: tenant.tenantId,
      actorUserId: tenant.userId,
      idempotencyKey: "statement-delivery-key-001",
      kind: "STATEMENT",
      contactId: contact.id,
      asAt: new Date("2026-12-31T23:59:59.999Z"),
    }, service);
    expect(providerMessages[0]).toMatchObject({ locale: "en-ZW" });
    expect(providerMessages[0].variables).toMatchObject({ requestedLocale: "nd-ZW", resolvedLocale: "en-ZW" });
    expect(JSON.parse(providerMessages[0].variables.currencySummaries)).toEqual(statement.currencies);
  });

  it("suppresses opted-out reminders and rejects cross-tenant preference writes", async () => {
    const tenant = await signupFinanceTenant("finance-delivery-optout");
    const other = await signupFinanceTenant("finance-delivery-other");
    const contact = await createContact(tenant, "Opted Out Customer", { email: "opted.out@example.com" });
    const invoice = await issuedInvoice({ tenant, contactId: contact.id, dueDate: new Date("2026-01-01T00:00:00.000Z") });
    await recordEmailPreference({
      tenantId: tenant.tenantId,
      contactId: contact.id,
      actorUserId: tenant.userId,
      status: "CONSENTED",
      locale: "en-ZW",
      evidenceSource: "CUSTOMER_REQUEST",
    });
    await recordEmailPreference({
      tenantId: tenant.tenantId,
      contactId: contact.id,
      actorUserId: tenant.userId,
      status: "OPTED_OUT",
      locale: "en-ZW",
      evidenceSource: "CUSTOMER_REQUEST",
      reason: "Customer withdrew consent.",
    });
    const service = buildPlatformKernel({ emailTransport: async () => ({}) }).container.get(NOTIFICATION_SERVICE);
    await expect(sendFinanceDocument({
      tenantId: tenant.tenantId,
      actorUserId: tenant.userId,
      idempotencyKey: "reminder-optout-key-001",
      kind: "PAYMENT_REMINDER",
      invoiceId: invoice.id,
    }, service)).rejects.toMatchObject({ status: 403 });
    const notifications = await db.select().from(schema.notifications)
      .where(eq(schema.notifications.tenantId, tenant.tenantId));
    expect(notifications).toHaveLength(0);
    const preferenceEvents = await db.select().from(schema.contactCommunicationPreferenceEvents)
      .where(and(
        eq(schema.contactCommunicationPreferenceEvents.tenantId, tenant.tenantId),
        eq(schema.contactCommunicationPreferenceEvents.contactId, contact.id),
      ));
    expect(preferenceEvents).toHaveLength(2);
    const crossTenant = await request(app)
      .post(`/api/v1/contacts/${contact.id}/communication-preferences/email`)
      .set(other.auth)
      .send({ status: "CONSENTED", locale: "en-ZW", evidenceSource: "CUSTOMER_REQUEST" });
    expect(crossTenant.status).toBe(404);
    const audits = await db.select().from(schema.auditLogs).where(eq(schema.auditLogs.tenantId, tenant.tenantId));
    expect(audits.some((row) => row.action === "finance_delivery.suppressed"
      && (row.metadata as { reason?: string })?.reason === "OPTED_OUT")).toBe(true);
  });

  it("persists provider failure plus in-app outcome and enforces accounting.post at the route", async () => {
    const tenant = await signupFinanceTenant("finance-delivery-failure");
    const contact = await createContact(tenant, "Failure Customer", { email: "failure.customer@example.com" });
    const invoice = await issuedInvoice({ tenant, contactId: contact.id, dueDate: new Date("2026-01-01T00:00:00.000Z") });
    await recordEmailPreference({
      tenantId: tenant.tenantId,
      contactId: contact.id,
      actorUserId: tenant.userId,
      status: "CONSENTED",
      locale: "en-ZW",
      evidenceSource: "CUSTOMER_REQUEST",
    });
    const failingService = buildPlatformKernel({
      emailTransport: async () => { throw new Error("provider unavailable"); },
    }).container.get(NOTIFICATION_SERVICE);
    await expect(sendFinanceDocument({
      tenantId: tenant.tenantId,
      actorUserId: tenant.userId,
      idempotencyKey: "reminder-failure-key-001",
      kind: "PAYMENT_REMINDER",
      invoiceId: invoice.id,
    }, failingService)).rejects.toThrow("provider unavailable");
    const notifications = await db.select().from(schema.notifications)
      .where(eq(schema.notifications.tenantId, tenant.tenantId));
    expect(notifications).toEqual(expect.arrayContaining([
      expect.objectContaining({ channel: "EMAIL", status: "failed", transmitted: false }),
      expect.objectContaining({ channel: "IN_APP", status: "accepted", transmitted: false }),
    ]));
    const [delivery] = await db.select().from(schema.financeDocumentDeliveryRequests)
      .where(eq(schema.financeDocumentDeliveryRequests.tenantId, tenant.tenantId));
    expect(delivery).toMatchObject({ status: "FAILED", failureCode: "PROVIDER_FAILED" });
    const [salesRole] = await db.select().from(schema.roles).where(and(
      eq(schema.roles.tenantId, tenant.tenantId), eq(schema.roles.name, "Sales"),
    ));
    const salesEmail = `sales-${Date.now()}@test.zw`;
    const password = "Sales-Test-123!";
    await db.insert(schema.users).values({
      tenantId: tenant.tenantId,
      email: salesEmail,
      passwordHash: await bcrypt.hash(password, 4),
      fullName: "Sales User",
      roleId: salesRole.id,
    });
    const sales = await login(salesEmail, password, undefined);
    const denied = await request(app).post(`/api/v1/invoices/${invoice.id}/payment-reminders/send`)
      .set({ Authorization: `Bearer ${sales.token}`, "Idempotency-Key": "denied-reminder-key-001" })
      .send({ confirm: true });
    expect(denied.status).toBe(403);
  });
});
