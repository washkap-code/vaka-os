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
import { and, eq, lt, count, gte } from "drizzle-orm";
import { DB, db, schema, badRequest, conflict, notFound, audit } from "./lib.js";

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
    await db.transaction(async (tx) => {
      const [plan] = await tx.select().from(schema.plans).where(eq(schema.plans.id, sub.planId));

      if (sub.status === "TRIALING" && asOf >= sub.trialEnd) {
        const periodEnd = addMonths(sub.trialEnd, 1);
        await issueSubscriptionInvoice(tx, sub, plan, sub.trialEnd, periodEnd, asOf);
        await tx.update(schema.subscriptions).set({
          status: "ACTIVE", currentPeriodStart: sub.trialEnd, currentPeriodEnd: periodEnd,
        }).where(eq(schema.subscriptions.id, sub.id));
        await tx.update(schema.tenants).set({ status: "ACTIVE" }).where(eq(schema.tenants.id, sub.tenantId));
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
          results.suspended++;
        }
      }
    });
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
export async function markSubscriptionInvoicePaid(opts: { tenantId: string; invoiceId: string; actorUserId?: string | null }) {
  return db.transaction(async (tx) => {
    const [inv] = await tx.select().from(schema.subscriptionInvoices).where(and(
      eq(schema.subscriptionInvoices.id, opts.invoiceId),
      eq(schema.subscriptionInvoices.tenantId, opts.tenantId)));
    if (!inv) throw notFound("Subscription invoice not found");
    if (inv.status === "paid") throw conflict("Invoice already paid");
    await tx.update(schema.subscriptionInvoices).set({ status: "paid", paidAt: new Date() })
      .where(eq(schema.subscriptionInvoices.id, inv.id));

    const remaining = await tx.select({ c: count() }).from(schema.subscriptionInvoices).where(and(
      eq(schema.subscriptionInvoices.tenantId, opts.tenantId),
      eq(schema.subscriptionInvoices.status, "overdue")));
    const stillOverdue = Number(remaining[0].c) > 0;
    if (!stillOverdue) {
      await tx.update(schema.subscriptions).set({ status: "ACTIVE", suspendedAt: null })
        .where(eq(schema.subscriptions.tenantId, opts.tenantId));
      await tx.update(schema.tenants).set({ status: "ACTIVE" }).where(eq(schema.tenants.id, opts.tenantId));
      await audit(tx, opts.tenantId, opts.actorUserId ?? null, "tenant.reactivated", "subscription", inv.subscriptionId);
    }
    return { paid: true, reactivated: !stillOverdue };
  });
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
