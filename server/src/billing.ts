// ============================================================================
// PLATFORM BILLING — Jonomi's own revenue engine + tenant lifecycle.
// State machine (enforced server-side on EVERY api request via middleware):
//   TRIALING → ACTIVE → PAST_DUE → SUSPENDED → (reactivate) ACTIVE
//                                → (long-stop, per legal policy) CLOSED
// Suspension NEVER deletes data (suspend-then-escrow policy): a suspended
// tenant's data is retained; reactivation = settle arrears + reactivation fee.
// CLOSED is only reachable via the platform-admin long-stop process with the
// export-first requirement — there is deliberately no automatic path to it.
// ============================================================================
import { and, eq, lt, count, or, sql } from "drizzle-orm";
import { DB, db, schema, badRequest, conflict, notFound, audit, fromCents, toCents } from "./lib.js";
import { DOMAIN_EVENTS, runWithPostCommitEvents } from "./platform/events/index.js";

const GRACE_DAYS = 14;            // invoice due date after issue
const PAST_DUE_TO_SUSPEND_DAYS = 75; // ~2.5 months past due => suspend (matches business plan's 2–3 months)

export async function collectUsageSummary(tx: DB, tenantId: string) {
  const [u] = await tx.select({ c: count() }).from(schema.users)
    .where(and(eq(schema.users.tenantId, tenantId), eq(schema.users.status, "active")));
  const [inv] = await tx.select({ c: count() }).from(schema.invoices)
    .where(eq(schema.invoices.tenantId, tenantId));
  const [con] = await tx.select({ c: count() }).from(schema.contacts)
    .where(eq(schema.contacts.tenantId, tenantId));
  const [prod] = await tx.select({ c: count() }).from(schema.products)
    .where(eq(schema.products.tenantId, tenantId));
  const [mov] = await tx.select({ c: count() }).from(schema.stockMovements)
    .where(eq(schema.stockMovements.tenantId, tenantId));
  return {
    activeUsers: Number(u.c), invoicesIssued: Number(inv.c),
    contacts: Number(con.c), products: Number(prod.c), stockMovements: Number(mov.c),
  };
}

export async function getArrearsStatus(
  tenantId: string,
  tenantStatus: string,
  asOf = new Date(),
) {
  const invoices = await db.select().from(schema.subscriptionInvoices).where(and(
    eq(schema.subscriptionInvoices.tenantId, tenantId),
    or(
      eq(schema.subscriptionInvoices.status, "pending"),
      eq(schema.subscriptionInvoices.status, "overdue"),
    ),
  ));
  const dueSoonCutoff = addDays(asOf, 7);
  const overdue = invoices.filter((invoice) => invoice.dueAt < asOf);
  const dueSoon = invoices.filter((invoice) =>
    invoice.dueAt >= asOf && invoice.dueAt <= dueSoonCutoff);
  const relevant = [...overdue, ...dueSoon];
  const amounts = new Map<string, bigint>();
  for (const invoice of relevant) {
    amounts.set(
      invoice.currency,
      (amounts.get(invoice.currency) ?? 0n) + toCents(invoice.amount),
    );
  }
  const oldestDueAt = overdue.length
    ? new Date(Math.min(...overdue.map((invoice) => invoice.dueAt.getTime())))
    : dueSoon.length
      ? new Date(Math.min(...dueSoon.map((invoice) => invoice.dueAt.getTime())))
      : null;
  const daysOverdue = oldestDueAt && oldestDueAt < asOf
    ? Math.floor((asOf.getTime() - oldestDueAt.getTime()) / 86_400_000)
    : 0;
  const stage = tenantStatus === "SUSPENDED"
    ? "SUSPENDED"
    : overdue.length
      ? "OVERDUE"
      : dueSoon.length
        ? "DUE_SOON"
        : "CLEAR";

  return {
    asAt: asOf.toISOString(),
    stage,
    overdueInvoiceCount: overdue.length,
    dueSoonInvoiceCount: dueSoon.length,
    oldestDueAt: oldestDueAt?.toISOString() ?? null,
    daysOverdue,
    amounts: [...amounts.entries()].map(([currency, cents]) => ({
      currency,
      amount: fromCents(cents),
    })),
  };
}

/**
 * Monthly billing run (invoked by a scheduled job / cron):
 *  - TRIALING subscriptions past trialEnd become ACTIVE and get their first invoice
 *  - ACTIVE subscriptions past period end get their renewal invoice + usage summary
 *  - unpaid invoices past due flip subscription+tenant to PAST_DUE (dunning starts)
 *  - PAST_DUE beyond the grace window flips to SUSPENDED (data retained)
 */
export async function runBillingCycle(asOf = new Date()) {
  const results = { invoiced: 0, movedPastDue: 0, suspended: 0, activatedFromTrial: 0 };
  const subs = await db.select().from(schema.subscriptions);
  for (const sub of subs) {
    await runWithPostCommitEvents((queue) => db.transaction(async (tx) => {
      const [plan] = await tx.select().from(schema.plans).where(eq(schema.plans.id, sub.planId));

      if (sub.status === "TRIALING" && asOf >= sub.trialEnd) {
        const periodEnd = addMonths(sub.trialEnd, 1);
        await issueSubscriptionInvoice(tx, sub, plan, sub.trialEnd, periodEnd, asOf);
        await tx.update(schema.subscriptions).set({
          status: "ACTIVE", currentPeriodStart: sub.trialEnd, currentPeriodEnd: periodEnd,
        }).where(eq(schema.subscriptions.id, sub.id));
        await tx.update(schema.tenants).set({ status: "ACTIVE" }).where(eq(schema.tenants.id, sub.tenantId));
        queue({ id: `${DOMAIN_EVENTS.TENANT_LIFECYCLE_CHANGED}:${sub.tenantId}:TRIAL:ACTIVE:${asOf.toISOString()}`, type: DOMAIN_EVENTS.TENANT_LIFECYCLE_CHANGED, tenantId: sub.tenantId, actorUserId: null,
          payload: { tenantId: sub.tenantId, from: "TRIAL", to: "ACTIVE" } });
        results.activatedFromTrial++; results.invoiced++;
        return;
      }

      if (sub.status === "ACTIVE" && asOf >= sub.currentPeriodEnd) {
        const newEnd = addMonths(sub.currentPeriodEnd, 1);
        await issueSubscriptionInvoice(tx, sub, plan, sub.currentPeriodEnd, newEnd, asOf);
        await tx.update(schema.subscriptions).set({
          currentPeriodStart: sub.currentPeriodEnd, currentPeriodEnd: newEnd,
        }).where(eq(schema.subscriptions.id, sub.id));
        results.invoiced++;
      }

      // overdue check
      const overdue = await tx.select().from(schema.subscriptionInvoices).where(and(
        eq(schema.subscriptionInvoices.subscriptionId, sub.id),
        eq(schema.subscriptionInvoices.status, "pending"),
        lt(schema.subscriptionInvoices.dueAt, asOf)));
      if (overdue.length && (sub.status === "ACTIVE")) {
        for (const oi of overdue) {
          await tx.update(schema.subscriptionInvoices).set({ status: "overdue" })
            .where(eq(schema.subscriptionInvoices.id, oi.id));
          await tx.insert(schema.dunningEvents).values({
            subscriptionInvoiceId: oi.id, channel: "email", attemptNumber: 1,
          });
        }
        await tx.update(schema.subscriptions).set({ status: "PAST_DUE" }).where(eq(schema.subscriptions.id, sub.id));
        await tx.update(schema.tenants).set({ status: "PAST_DUE" }).where(eq(schema.tenants.id, sub.tenantId));
        await audit(tx, sub.tenantId, null, "tenant.past_due", "subscription", sub.id);
        queue({ id: `${DOMAIN_EVENTS.TENANT_LIFECYCLE_CHANGED}:${sub.tenantId}:ACTIVE:PAST_DUE:${asOf.toISOString()}`, type: DOMAIN_EVENTS.TENANT_LIFECYCLE_CHANGED, tenantId: sub.tenantId, actorUserId: null,
          payload: { tenantId: sub.tenantId, from: "ACTIVE", to: "PAST_DUE" } });
        results.movedPastDue++;
      }

      if (sub.status === "PAST_DUE") {
        const oldest = await tx.select().from(schema.subscriptionInvoices).where(and(
          eq(schema.subscriptionInvoices.subscriptionId, sub.id),
          eq(schema.subscriptionInvoices.status, "overdue"),
          lt(schema.subscriptionInvoices.dueAt, addDays(asOf, -PAST_DUE_TO_SUSPEND_DAYS))));
        if (oldest.length) {
          await tx.update(schema.subscriptions).set({ status: "SUSPENDED", suspendedAt: asOf })
            .where(eq(schema.subscriptions.id, sub.id));
          await tx.update(schema.tenants).set({ status: "SUSPENDED" }).where(eq(schema.tenants.id, sub.tenantId));
          await audit(tx, sub.tenantId, null, "tenant.suspended", "subscription", sub.id,
            { policy: "suspend-then-escrow: data retained, reactivation = arrears + fee" });
          queue({ id: `${DOMAIN_EVENTS.TENANT_LIFECYCLE_CHANGED}:${sub.tenantId}:PAST_DUE:SUSPENDED:${asOf.toISOString()}`, type: DOMAIN_EVENTS.TENANT_LIFECYCLE_CHANGED, tenantId: sub.tenantId, actorUserId: null,
            payload: { tenantId: sub.tenantId, from: "PAST_DUE", to: "SUSPENDED" } });
          results.suspended++;
        }
      }
    }));
  }
  return results;
}

async function issueSubscriptionInvoice(tx: DB, sub: any, plan: any, periodStart: Date, periodEnd: Date, asOf: Date) {
  const usage = await collectUsageSummary(tx, sub.tenantId);
  await tx.insert(schema.subscriptionInvoices).values({
    tenantId: sub.tenantId, subscriptionId: sub.id,
    periodStart, periodEnd, amount: plan.priceAmount, currency: plan.priceCurrency,
    status: "pending", usageSummary: usage, dueAt: addDays(asOf, GRACE_DAYS),
  });
  await audit(tx, sub.tenantId, null, "billing.invoice_issued", "subscription", sub.id,
    { amount: plan.priceAmount, period: [periodStart, periodEnd], usage });
}

/** Mark a subscription invoice paid; reactivate suspended/past-due tenants when clear. */
export async function markSubscriptionInvoicePaid(opts: {
  tenantId: string;
  invoiceId: string;
  actorUserId?: string | null;
  providerPayment?: {
    attemptId: string;
    providerReference: string | null;
    providerStatus: string;
    confirmedAt: Date;
  };
}) {
  return runWithPostCommitEvents((queue) => db.transaction(async (tx) => {
    let paymentAttempt: typeof schema.subscriptionPaymentAttempts.$inferSelect | null = null;
    if (opts.providerPayment) {
      await tx.execute(sql`SELECT id FROM subscription_payment_attempts
        WHERE id = ${opts.providerPayment.attemptId} FOR UPDATE`);
      const [attempt] = await tx.select().from(schema.subscriptionPaymentAttempts).where(and(
        eq(schema.subscriptionPaymentAttempts.id, opts.providerPayment.attemptId),
        eq(schema.subscriptionPaymentAttempts.tenantId, opts.tenantId),
        eq(schema.subscriptionPaymentAttempts.subscriptionInvoiceId, opts.invoiceId),
      ));
      if (!attempt) throw notFound("Subscription payment attempt not found");
      if (attempt.status === "PAID") return { paid: true, reactivated: false, idempotent: true };
      paymentAttempt = attempt;
    }
    const [inv] = await tx.select().from(schema.subscriptionInvoices).where(and(
      eq(schema.subscriptionInvoices.id, opts.invoiceId),
      eq(schema.subscriptionInvoices.tenantId, opts.tenantId)));
    if (!inv) throw notFound("Subscription invoice not found");
    if (inv.status === "paid") throw conflict("Invoice already paid");
    await tx.update(schema.subscriptionInvoices).set({ status: "paid", paidAt: new Date() })
      .where(eq(schema.subscriptionInvoices.id, inv.id));

    if (paymentAttempt && opts.providerPayment) {
      await tx.update(schema.subscriptionPaymentAttempts).set({
        status: "PAID",
        providerStatus: opts.providerPayment.providerStatus,
        providerReference: opts.providerPayment.providerReference,
        providerConfirmedAt: opts.providerPayment.confirmedAt,
        settledAt: opts.providerPayment.confirmedAt,
        lastCheckedAt: opts.providerPayment.confirmedAt,
        updatedAt: opts.providerPayment.confirmedAt,
      }).where(eq(schema.subscriptionPaymentAttempts.id, paymentAttempt.id));
      await audit(tx, opts.tenantId, opts.actorUserId ?? null,
        "billing.subscription_payment_confirmed", "subscription_payment_attempt", paymentAttempt.id, {
          subscriptionInvoiceId: inv.id,
          provider: paymentAttempt.provider,
          providerReference: opts.providerPayment.providerReference,
          providerStatus: opts.providerPayment.providerStatus,
        });
    }

    const remaining = await tx.select({ c: count() }).from(schema.subscriptionInvoices).where(and(
      eq(schema.subscriptionInvoices.tenantId, opts.tenantId),
      eq(schema.subscriptionInvoices.status, "overdue")));
    const stillOverdue = Number(remaining[0].c) > 0;
    if (!stillOverdue) {
      const [tenant] = await tx.select({ status: schema.tenants.status }).from(schema.tenants)
        .where(eq(schema.tenants.id, opts.tenantId));
      if (!tenant) throw notFound("Tenant not found");
      await tx.update(schema.subscriptions).set({ status: "ACTIVE", suspendedAt: null })
        .where(eq(schema.subscriptions.tenantId, opts.tenantId));
      await tx.update(schema.tenants).set({ status: "ACTIVE" }).where(eq(schema.tenants.id, opts.tenantId));
      await audit(tx, opts.tenantId, opts.actorUserId ?? null, "tenant.reactivated", "subscription", inv.subscriptionId);
      if (tenant.status !== "ACTIVE") {
        queue({ id: `${DOMAIN_EVENTS.TENANT_LIFECYCLE_CHANGED}:${opts.tenantId}:${tenant.status}:ACTIVE:${opts.invoiceId}`, type: DOMAIN_EVENTS.TENANT_LIFECYCLE_CHANGED, tenantId: opts.tenantId, actorUserId: opts.actorUserId ?? null,
          payload: { tenantId: opts.tenantId, from: tenant.status, to: "ACTIVE" } });
      }
    }
    return { paid: true, reactivated: !stillOverdue, idempotent: false };
  }));
}

const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
const addMonths = (d: Date, n: number) => { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; };

/**
 * What a tenant status allows. Enforced by middleware on every request:
 *   TRIAL/ACTIVE  -> full access
 *   PAST_DUE      -> full access + persistent banner (grace window)
 *   SUSPENDED     -> read-only + billing endpoints + data export (their asses
 *                    are covered: they can always see and export their data)
 *   CLOSED        -> export/billing only
 */
export function accessLevelFor(status: string): "full" | "readonly" | "export_only" {
  if (status === "TRIAL" || status === "ACTIVE" || status === "PAST_DUE") return "full";
  if (status === "SUSPENDED") return "readonly";
  return "export_only";
}
