import { and, eq } from "drizzle-orm";
import { latestEmailPreference } from "./communication-preferences.js";
import { publicAppUrl } from "./config.js";
import { createInvoiceShareLink } from "./invoice-sharing.js";
import {
  FINANCE_DELIVERY_TEMPLATES, resolveFinanceCatalogue,
  type FinanceDeliveryKind, type FinanceDeliveryLocale,
} from "./finance-delivery-catalogues.js";
import { getCustomerStatementSummary } from "./customer-statements.js";
import {
  assertIdempotencyFingerprint, badRequest, conflict, db, forbidden,
  notFound, payloadFingerprint, schema,
} from "./lib.js";
import { recordAudit } from "./platform/audit-facade.js";
import type { NotificationServiceContract } from "./platform/notifications/interfaces.js";
import { NOTIFICATION_SERVICE, platformKernel } from "./platform-runtime.js";
import { fromMinorUnits, toMinorUnits } from "./reports.js";

type DeliveryInput = {
  tenantId: string;
  actorUserId: string;
  idempotencyKey: string;
  kind: FinanceDeliveryKind;
  invoiceId?: string;
  contactId?: string;
  asAt?: Date;
};

type PreparedDelivery = {
  contact: { id: string; name: string; email: string };
  invoiceId: string | null;
  variables: Record<string, string>;
  entityType: "invoice" | "contact";
  entityId: string;
};

const safeFailureCode = (error: unknown): string =>
  error instanceof Error && /(not configured|required for production document delivery)/i.test(error.message)
    ? "DELIVERY_CONFIGURATION_MISSING"
    : "PROVIDER_FAILED";

async function prepareDelivery(input: DeliveryInput): Promise<PreparedDelivery> {
  const [tenant] = await db.select({ companyName: schema.tenants.companyName }).from(schema.tenants)
    .where(eq(schema.tenants.id, input.tenantId));
  if (!tenant) throw notFound("Tenant not found");
  if (input.kind === "STATEMENT") {
    if (!input.contactId || !input.asAt) throw badRequest("Statement contact and as-at date are required");
    const [contact] = await db.select({ id: schema.contacts.id, name: schema.contacts.name, email: schema.contacts.email })
      .from(schema.contacts).where(and(
        eq(schema.contacts.id, input.contactId),
        eq(schema.contacts.tenantId, input.tenantId),
      ));
    if (!contact) throw notFound("Customer not found");
    if (!contact.email) throw badRequest("Customer email is required for delivery");
    const statement = await getCustomerStatementSummary({
      tenantId: input.tenantId, contactId: contact.id, asAt: input.asAt,
    });
    return {
      contact: { ...contact, email: contact.email },
      invoiceId: null,
      entityType: "contact",
      entityId: contact.id,
      variables: {
        companyName: tenant.companyName,
        customerName: contact.name,
        asAt: statement.asAt,
        invoiceCount: String(statement.invoiceCount),
        currencySummaries: JSON.stringify(statement.currencies),
      },
    };
  }

  if (!input.invoiceId) throw badRequest("Invoice is required for delivery");
  const [invoice] = await db.select({
    id: schema.invoices.id,
    contactId: schema.invoices.contactId,
    number: schema.invoices.number,
    status: schema.invoices.status,
    currency: schema.invoices.currency,
    total: schema.invoices.total,
    amountPaid: schema.invoices.amountPaid,
    issueDate: schema.invoices.issueDate,
    dueDate: schema.invoices.dueDate,
  }).from(schema.invoices).where(and(
    eq(schema.invoices.id, input.invoiceId),
    eq(schema.invoices.tenantId, input.tenantId),
  ));
  if (!invoice || !["ISSUED", "PARTIAL"].includes(invoice.status)) throw notFound("Issued invoice not found");
  const [contact] = await db.select({ id: schema.contacts.id, name: schema.contacts.name, email: schema.contacts.email })
    .from(schema.contacts).where(and(
      eq(schema.contacts.id, invoice.contactId),
      eq(schema.contacts.tenantId, input.tenantId),
    ));
  if (!contact) throw notFound("Invoice customer not found");
  if (!contact.email) throw badRequest("Customer email is required for delivery");
  const outstandingCents = toMinorUnits(invoice.total) - toMinorUnits(invoice.amountPaid);
  if (input.kind === "PAYMENT_REMINDER") {
    const now = new Date();
    const dueAt = invoice.dueDate ?? invoice.issueDate;
    if (!dueAt || dueAt >= now || outstandingCents <= 0n) throw badRequest("Only overdue invoices with an outstanding balance can be reminded");
  }
  return {
    contact: { ...contact, email: contact.email },
    invoiceId: invoice.id,
    entityType: "invoice",
    entityId: invoice.id,
    variables: {
      companyName: tenant.companyName,
      customerName: contact.name,
      invoiceNumber: invoice.number ?? invoice.id,
      currency: invoice.currency,
      total: invoice.total,
      outstanding: fromMinorUnits(outstandingCents),
      issueDate: invoice.issueDate?.toISOString().slice(0, 10) ?? "",
      dueDate: invoice.dueDate?.toISOString().slice(0, 10) ?? "",
    },
  };
}

async function auditSuppressed(input: DeliveryInput, prepared: PreparedDelivery | null, reason: string) {
  await recordAudit({
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    action: "finance_delivery.suppressed",
    entityType: prepared?.entityType ?? (input.invoiceId ? "invoice" : "contact"),
    entityId: prepared?.entityId ?? input.invoiceId ?? input.contactId ?? null,
    metadata: { documentType: input.kind, reason },
  });
}

async function claimDelivery(input: DeliveryInput, prepared: PreparedDelivery, preferenceId: string, locale: FinanceDeliveryLocale) {
  const fingerprint = payloadFingerprint({
    kind: input.kind,
    invoiceId: prepared.invoiceId,
    contactId: prepared.contact.id,
    asAt: input.asAt?.toISOString().slice(0, 10) ?? null,
    recipient: prepared.contact.email,
    preferenceId,
    locale,
  });
  const [claimed] = await db.insert(schema.financeDocumentDeliveryRequests).values({
    tenantId: input.tenantId,
    contactId: prepared.contact.id,
    invoiceId: prepared.invoiceId,
    documentType: input.kind,
    idempotencyKey: input.idempotencyKey,
    idempotencyFingerprint: fingerprint,
    createdBy: input.actorUserId,
  }).onConflictDoNothing({
    target: [schema.financeDocumentDeliveryRequests.tenantId, schema.financeDocumentDeliveryRequests.idempotencyKey],
  }).returning();
  if (claimed) return { claimed, deduplicated: false };
  const [existing] = await db.select().from(schema.financeDocumentDeliveryRequests).where(and(
    eq(schema.financeDocumentDeliveryRequests.tenantId, input.tenantId),
    eq(schema.financeDocumentDeliveryRequests.idempotencyKey, input.idempotencyKey),
  ));
  if (!existing) throw conflict("Finance delivery idempotency claim was not available");
  assertIdempotencyFingerprint(existing.idempotencyFingerprint, fingerprint, "finance delivery request");
  return { claimed: existing, deduplicated: true };
}

export async function sendFinanceDocument(
  input: DeliveryInput,
  notificationService: NotificationServiceContract = platformKernel().container.get(NOTIFICATION_SERVICE),
) {
  let prepared: PreparedDelivery | null = null;
  try {
    prepared = await prepareDelivery(input);
  } catch (error) {
    await auditSuppressed(input, prepared, "INVALID_RECIPIENT_OR_DOCUMENT_STATE");
    throw error;
  }
  const preference = await latestEmailPreference(input.tenantId, prepared.contact.id);
  if (!preference || preference.status !== "CONSENTED") {
    await auditSuppressed(input, prepared, preference?.status === "OPTED_OUT" ? "OPTED_OUT" : "CONSENT_NOT_RECORDED");
    throw forbidden(preference?.status === "OPTED_OUT" ? "Customer has opted out of email delivery" : "Customer email consent is not recorded");
  }
  const locale = resolveFinanceCatalogue(preference.locale as FinanceDeliveryLocale);
  const claim = await claimDelivery(input, prepared, preference.id, locale.requestedLocale);
  if (claim.deduplicated) {
    return {
      requestId: claim.claimed.id,
      status: claim.claimed.status,
      emailNotificationId: claim.claimed.emailNotificationId,
      inAppNotificationId: claim.claimed.inAppNotificationId,
      deduplicated: true,
    };
  }

  const requestId = claim.claimed.id;
  const template = FINANCE_DELIVERY_TEMPLATES[input.kind];
  const copy = locale.copy[input.kind];
  const variables: Record<string, string> = {
    ...prepared.variables,
    subject: copy.subject(prepared.variables),
    preview: copy.preview(prepared.variables),
    requestedLocale: locale.requestedLocale,
    resolvedLocale: locale.resolvedLocale,
  };
  let shareLinkId: string | null = null;
  const emailNotificationId = `${requestId}:email`;
  const inAppNotificationId = `${requestId}:in-app`;
  let emailAccepted = false;
  try {
    if (input.kind === "INVOICE" && prepared.invoiceId) {
      const documentOrigin = publicAppUrl();
      const share = await createInvoiceShareLink({
        tenantId: input.tenantId,
        invoiceId: prepared.invoiceId,
        actorUserId: input.actorUserId,
        expiresInDays: 14,
      });
      shareLinkId = share.id;
      variables.documentUrl = `${documentOrigin}${share.publicPath}`;
      variables.documentExpiresAt = share.expiresAt.toISOString();
      await db.update(schema.financeDocumentDeliveryRequests).set({ shareLinkId, updatedAt: new Date() })
        .where(eq(schema.financeDocumentDeliveryRequests.id, requestId));
    }
    const email = await notificationService.send({
      id: emailNotificationId,
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      recipient: prepared.contact.email,
      channel: "EMAIL",
      template,
      locale: locale.resolvedLocale,
      variables,
      sensitiveVariableKeys: input.kind === "INVOICE" ? ["documentUrl"] : undefined,
      dedupeKey: `finance-delivery:${requestId}:email`,
    });
    emailAccepted = true;
    await notificationService.send({
      id: inAppNotificationId,
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      recipient: input.actorUserId,
      channel: "IN_APP",
      template: FINANCE_DELIVERY_TEMPLATES.OUTCOME_SENT,
      locale: locale.resolvedLocale,
      variables: { documentType: input.kind, recipientName: prepared.contact.name, providerStatus: email.status ?? "sent" },
      dedupeKey: `finance-delivery:${requestId}:in-app`,
    });
    await db.update(schema.financeDocumentDeliveryRequests).set({
      status: "SENT",
      emailNotificationId,
      inAppNotificationId,
      updatedAt: new Date(),
    }).where(eq(schema.financeDocumentDeliveryRequests.id, requestId));
    await recordAudit({
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      action: "finance_delivery.sent",
      entityType: prepared.entityType,
      entityId: prepared.entityId,
      metadata: {
        requestId,
        documentType: input.kind,
        channel: "EMAIL",
        template,
        requestedLocale: locale.requestedLocale,
        resolvedLocale: locale.resolvedLocale,
        localeFallback: locale.fellBack,
        consentEventId: preference.id,
        providerStatus: email.status ?? "sent",
        transmitted: email.transmitted ?? false,
        shareLinkId,
      },
    });
    return { requestId, status: "SENT", emailNotificationId, inAppNotificationId, deduplicated: false };
  } catch (error) {
    const failureCode = emailAccepted ? "IN_APP_OUTCOME_FAILED" : safeFailureCode(error);
    try {
      await notificationService.send({
        id: inAppNotificationId,
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        recipient: input.actorUserId,
        channel: "IN_APP",
        template: FINANCE_DELIVERY_TEMPLATES.OUTCOME_FAILED,
        locale: locale.resolvedLocale,
        variables: { documentType: input.kind, recipientName: prepared.contact.name, failureCode },
        dedupeKey: `finance-delivery:${requestId}:in-app`,
      });
    } catch {
      // The email attempt remains persisted/audited; the domain request below
      // records failure even when the secondary in-app channel is unavailable.
    }
    await db.update(schema.financeDocumentDeliveryRequests).set({
      status: "FAILED",
      emailNotificationId,
      inAppNotificationId,
      failureCode,
      updatedAt: new Date(),
    }).where(eq(schema.financeDocumentDeliveryRequests.id, requestId));
    await recordAudit({
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      action: "finance_delivery.failed",
      entityType: prepared.entityType,
      entityId: prepared.entityId,
      metadata: {
        requestId,
        documentType: input.kind,
        channel: "EMAIL",
        template,
        requestedLocale: locale.requestedLocale,
        resolvedLocale: locale.resolvedLocale,
        consentEventId: preference.id,
        failureCode,
        emailAccepted,
        shareLinkId,
      },
    });
    throw error;
  }
}
