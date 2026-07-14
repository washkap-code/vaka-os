import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { paynowProviderConfig, publicAppUrl } from "./config.js";
import { markSubscriptionInvoicePaid } from "./billing.js";
import { AppError, audit, badRequest, conflict, db, notFound, schema, toCents } from "./lib.js";
import { protectPaynowPollUrl, revealPaynowPollUrl } from "./payment-secrets.js";
import { PaynowClient, PaynowResponseError, type PaynowStatus } from "./paynow.js";

type Attempt = typeof schema.subscriptionPaymentAttempts.$inferSelect;
type NormalizedPaymentStatus = Attempt["status"];

const providerUnavailable = () => new AppError(
  503,
  "Online subscription payments are not active yet. Please use the published billing contact while merchant setup is completed.",
  "PAYMENT_PROVIDER_UNAVAILABLE",
);

const safeAttempt = (attempt: Attempt) => ({
  id: attempt.id,
  subscriptionInvoiceId: attempt.subscriptionInvoiceId,
  provider: attempt.provider,
  merchantReference: attempt.merchantReference,
  amount: attempt.amount,
  currency: attempt.currency,
  status: attempt.status,
  providerStatus: attempt.providerStatus,
  providerReference: attempt.providerReference,
  createdAt: attempt.createdAt,
  updatedAt: attempt.updatedAt,
  settledAt: attempt.settledAt,
});

function activeClient(): { client: PaynowClient; currency: "USD" | "ZWG" } {
  const config = paynowProviderConfig();
  if (!config) throw providerUnavailable();
  return {
    client: new PaynowClient(config.integrationId, config.integrationKey),
    currency: config.currency,
  };
}

export function subscriptionPaymentAvailability() {
  const config = paynowProviderConfig();
  return {
    provider: "PAYNOW",
    available: Boolean(config),
    currency: config?.currency ?? null,
    methods: config ? ["CARD", "ECOCASH", "ONEMONEY"] : [],
  };
}

export async function listSubscriptionPaymentAttempts(tenantId: string) {
  const attempts = await db.select().from(schema.subscriptionPaymentAttempts)
    .where(eq(schema.subscriptionPaymentAttempts.tenantId, tenantId))
    .orderBy(desc(schema.subscriptionPaymentAttempts.createdAt));
  return attempts.map(safeAttempt);
}

export async function initiateSubscriptionPayment(input: {
  tenantId: string;
  invoiceId: string;
  actorUserId: string;
  idempotencyKey: string;
}) {
  const [invoice] = await db.select().from(schema.subscriptionInvoices).where(and(
    eq(schema.subscriptionInvoices.id, input.invoiceId),
    eq(schema.subscriptionInvoices.tenantId, input.tenantId),
  ));
  if (!invoice) throw notFound("Subscription invoice not found");
  if (!(["pending", "overdue"] as const).includes(invoice.status as "pending" | "overdue")) {
    throw conflict("Only an open subscription invoice can be paid");
  }
  const { client, currency: providerCurrency } = activeClient();
  if (invoice.currency !== providerCurrency) {
    throw badRequest(`Online payment is configured for ${providerCurrency}; this invoice is ${invoice.currency}`);
  }
  if (toCents(invoice.amount) <= 0n) throw badRequest("Subscription invoice amount must be positive");

  const [existing] = await db.select().from(schema.subscriptionPaymentAttempts).where(and(
    eq(schema.subscriptionPaymentAttempts.tenantId, input.tenantId),
    eq(schema.subscriptionPaymentAttempts.subscriptionInvoiceId, input.invoiceId),
    eq(schema.subscriptionPaymentAttempts.idempotencyKey, input.idempotencyKey),
  ));
  if (existing) {
    return { attempt: safeAttempt(existing), redirectUrl: existing.redirectUrl, idempotent: true };
  }

  const [[tenant], [user]] = await Promise.all([
    db.select({ subdomain: schema.tenants.subdomain }).from(schema.tenants)
      .where(eq(schema.tenants.id, input.tenantId)),
    db.select({ email: schema.users.email }).from(schema.users)
      .where(eq(schema.users.id, input.actorUserId)),
  ]);
  if (!tenant || !user) throw notFound("Billing account not found");

  const attemptId = randomUUID();
  const merchantReference = `VAKA-${attemptId.replaceAll("-", "").slice(0, 24).toUpperCase()}`;
  const [created] = await db.insert(schema.subscriptionPaymentAttempts).values({
    id: attemptId,
    tenantId: input.tenantId,
    subscriptionInvoiceId: invoice.id,
    merchantReference,
    idempotencyKey: input.idempotencyKey,
    amount: invoice.amount,
    currency: invoice.currency,
    initiatedBy: input.actorUserId,
  }).returning();

  const origin = publicAppUrl();
  const returnUrl = new URL(`/workspace/${encodeURIComponent(tenant.subdomain)}`, origin);
  returnUrl.searchParams.set("paymentAttempt", attemptId);
  const resultUrl = new URL("/api/v1/public/payments/paynow/result", origin);
  try {
    const initiated = await client.initiate({
      reference: merchantReference,
      amount: invoice.amount,
      additionalInfo: "VAKA OS subscription invoice",
      returnUrl: returnUrl.toString(),
      resultUrl: resultUrl.toString(),
      email: user.email,
    });
    const now = new Date();
    const [updated] = await db.update(schema.subscriptionPaymentAttempts).set({
      status: "PENDING",
      providerStatus: "Created",
      redirectUrl: initiated.redirectUrl,
      encryptedPollUrl: protectPaynowPollUrl(initiated.pollUrl),
      lastCheckedAt: now,
      updatedAt: now,
    }).where(eq(schema.subscriptionPaymentAttempts.id, attemptId)).returning();
    await audit(db, input.tenantId, input.actorUserId, "billing.subscription_payment_initiated",
      "subscription_payment_attempt", attemptId, {
        subscriptionInvoiceId: invoice.id,
        provider: "PAYNOW",
        merchantReference,
        amount: invoice.amount,
        currency: invoice.currency,
      });
    return { attempt: safeAttempt(updated), redirectUrl: initiated.redirectUrl, idempotent: false };
  } catch (error) {
    const definiteRejection = error instanceof PaynowResponseError;
    const now = new Date();
    await db.update(schema.subscriptionPaymentAttempts).set({
      status: definiteRejection ? "FAILED" : "CREATED",
      providerStatus: definiteRejection ? "Initiation rejected" : "Initiation outcome unknown",
      lastCheckedAt: now,
      updatedAt: now,
    }).where(eq(schema.subscriptionPaymentAttempts.id, attemptId));
    await audit(db, input.tenantId, input.actorUserId,
      definiteRejection ? "billing.subscription_payment_failed" : "billing.subscription_payment_initiation_uncertain",
      "subscription_payment_attempt", attemptId, {
        subscriptionInvoiceId: invoice.id,
        provider: "PAYNOW",
        merchantReference,
      });
    throw new AppError(502,
      definiteRejection
        ? "Paynow could not start this payment. No invoice status was changed."
        : "The payment provider did not confirm initiation. Do not retry with a new reference until the attempt is reviewed.",
      "PAYMENT_INITIATION_FAILED");
  }
}

function normalizeStatus(status: string): NormalizedPaymentStatus {
  switch (status.trim().toLowerCase()) {
    case "paid": return "PAID";
    case "cancelled": return "CANCELLED";
    case "disputed": return "DISPUTED";
    case "refunded": return "REFUNDED";
    case "created":
    case "sent":
    case "awaiting delivery":
    case "delivered":
      return "PENDING";
    default: return "PENDING";
  }
}

function validateStatusEvidence(attempt: Attempt, status: PaynowStatus) {
  if (status.reference !== attempt.merchantReference) {
    throw new PaynowResponseError("Paynow status reference does not match the payment attempt");
  }
  if (!/^\d{1,10}\.\d{2}$/.test(status.amount) || toCents(status.amount) !== toCents(attempt.amount)) {
    throw new PaynowResponseError("Paynow status amount does not match the subscription invoice");
  }
}

async function reconcileAttempt(attempt: Attempt, actorUserId: string | null) {
  const { client } = activeClient();
  if (!attempt.encryptedPollUrl) {
    throw conflict("This payment attempt has no confirmed provider poll reference and requires review");
  }
  const provider = await client.poll(revealPaynowPollUrl(attempt.encryptedPollUrl));
  try {
    validateStatusEvidence(attempt, provider);
  } catch (error) {
    const now = new Date();
    await db.update(schema.subscriptionPaymentAttempts).set({
      status: "REQUIRES_REVIEW",
      providerStatus: "Evidence mismatch",
      lastCheckedAt: now,
      updatedAt: now,
    }).where(eq(schema.subscriptionPaymentAttempts.id, attempt.id));
    await audit(db, attempt.tenantId, actorUserId, "billing.subscription_payment_evidence_mismatch",
      "subscription_payment_attempt", attempt.id, { provider: "PAYNOW" });
    throw error;
  }

  const normalized = normalizeStatus(provider.status);
  const now = new Date();
  if (normalized === "PAID") {
    const settled = await markSubscriptionInvoicePaid({
      tenantId: attempt.tenantId,
      invoiceId: attempt.subscriptionInvoiceId,
      actorUserId,
      providerPayment: {
        attemptId: attempt.id,
        providerReference: provider.paynowReference,
        providerStatus: provider.status,
        confirmedAt: now,
      },
    });
    const [updated] = await db.select().from(schema.subscriptionPaymentAttempts)
      .where(eq(schema.subscriptionPaymentAttempts.id, attempt.id));
    return { attempt: safeAttempt(updated), settlement: settled };
  }

  const terminal = ["PAID", "FAILED", "CANCELLED", "DISPUTED", "REFUNDED", "REQUIRES_REVIEW"]
    .includes(attempt.status);
  const nextStatus = terminal && attempt.status !== normalized ? "REQUIRES_REVIEW" : normalized;
  const [updated] = await db.update(schema.subscriptionPaymentAttempts).set({
    status: nextStatus,
    providerStatus: provider.status,
    providerReference: provider.paynowReference,
    providerConfirmedAt: now,
    lastCheckedAt: now,
    updatedAt: now,
  }).where(eq(schema.subscriptionPaymentAttempts.id, attempt.id)).returning();
  if (updated.status !== attempt.status || updated.providerStatus !== attempt.providerStatus) {
    await audit(db, attempt.tenantId, actorUserId, "billing.subscription_payment_status_updated",
      "subscription_payment_attempt", attempt.id, {
        subscriptionInvoiceId: attempt.subscriptionInvoiceId,
        provider: "PAYNOW",
        from: attempt.status,
        to: updated.status,
        providerStatus: provider.status,
      });
  }
  return { attempt: safeAttempt(updated), settlement: null };
}

export async function refreshSubscriptionPayment(input: {
  tenantId: string;
  attemptId: string;
  actorUserId: string;
}) {
  const [attempt] = await db.select().from(schema.subscriptionPaymentAttempts).where(and(
    eq(schema.subscriptionPaymentAttempts.id, input.attemptId),
    eq(schema.subscriptionPaymentAttempts.tenantId, input.tenantId),
  ));
  if (!attempt) throw notFound("Subscription payment attempt not found");
  return reconcileAttempt(attempt, input.actorUserId);
}

export async function processPaynowResult(rawBody: string) {
  const { client } = activeClient();
  const inbound = client.verifyInbound(rawBody);
  const reference = inbound.get("reference");
  if (!reference) throw badRequest("Paynow result reference is missing");
  const [attempt] = await db.select().from(schema.subscriptionPaymentAttempts)
    .where(eq(schema.subscriptionPaymentAttempts.merchantReference, reference));
  if (!attempt) throw notFound("Payment attempt not found");
  return reconcileAttempt(attempt, null);
}
