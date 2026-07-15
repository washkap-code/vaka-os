// ============================================================================
// P2-005 — Financial period close.
//
// Closing a month locks every journal posting dated inside it: invoices,
// payments, expenses, stock effects, procurement, bank reconciliation and
// manual journals all flow through postJournal, which calls
// assertPeriodOpen() inside the same transaction. A database trigger
// (0034_accounting_period_close.sql) enforces the same rule beneath the
// application boundary. History is never edited: corrections are posted as
// offsetting entries in an open period.
//
// Accountant gate: technically verified only. A qualified Zimbabwean
// accountant must approve the close workflow before it is presented as part
// of an audited month-end procedure.
// ============================================================================
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { audit, badRequest, conflict, db, notFound, schema, type DB } from "./lib.js";

export const periodMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Period must be YYYY-MM");
export const periodReasonSchema = z.string().trim().min(3).max(500);

/** First day of the UTC month containing `date`, as YYYY-MM-DD. */
export function periodMonthOf(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
}

const monthKeyToDate = (month: string): string => `${month}-01`;

/**
 * Fail closed when a posting date falls inside a CLOSED period. Called by
 * postJournal inside the posting transaction, so a concurrent close cannot
 * race past it silently (the DB trigger backstops any other path).
 */
export async function assertPeriodOpen(tx: DB, tenantId: string, date: Date): Promise<void> {
  const [closed] = await tx.select({ id: schema.accountingPeriods.id })
    .from(schema.accountingPeriods).where(and(
      eq(schema.accountingPeriods.tenantId, tenantId),
      eq(schema.accountingPeriods.periodMonth, periodMonthOf(date)),
      eq(schema.accountingPeriods.status, "CLOSED"),
    ));
  if (closed) {
    throw badRequest(
      "This accounting period is closed. Post a correction as an offsetting entry dated in an open period.",
    );
  }
}

export async function listAccountingPeriods(tenantId: string) {
  return db.select({
    id: schema.accountingPeriods.id,
    periodMonth: schema.accountingPeriods.periodMonth,
    status: schema.accountingPeriods.status,
    closedBy: schema.accountingPeriods.closedBy,
    closedAt: schema.accountingPeriods.closedAt,
    closedReason: schema.accountingPeriods.closedReason,
    reopenedBy: schema.accountingPeriods.reopenedBy,
    reopenedAt: schema.accountingPeriods.reopenedAt,
    reopenedReason: schema.accountingPeriods.reopenedReason,
  }).from(schema.accountingPeriods)
    .where(eq(schema.accountingPeriods.tenantId, tenantId))
    .orderBy(desc(schema.accountingPeriods.periodMonth));
}

export async function closeAccountingPeriod(opts: {
  tenantId: string; actorUserId: string; month: string; reason: string;
}) {
  const month = periodMonthSchema.parse(opts.month);
  const periodMonth = monthKeyToDate(month);
  // Only complete months may be closed: the current month still receives
  // day-to-day postings and future months have no history to protect.
  if (periodMonth >= periodMonthOf(new Date())) {
    throw badRequest("Only completed past months can be closed");
  }

  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(schema.accountingPeriods).where(and(
      eq(schema.accountingPeriods.tenantId, opts.tenantId),
      eq(schema.accountingPeriods.periodMonth, periodMonth),
    )).for("update");
    if (existing?.status === "CLOSED") throw conflict("This period is already closed");

    const values = {
      status: "CLOSED" as const,
      closedBy: opts.actorUserId,
      closedAt: new Date(),
      closedReason: opts.reason,
      reopenedBy: null,
      reopenedAt: null,
      reopenedReason: null,
    };
    const [row] = existing
      ? await tx.update(schema.accountingPeriods).set(values)
        .where(eq(schema.accountingPeriods.id, existing.id)).returning()
      : await tx.insert(schema.accountingPeriods).values({
        tenantId: opts.tenantId, periodMonth, ...values,
      }).returning();

    await audit(tx, opts.tenantId, opts.actorUserId, "accounting.period_closed",
      "accounting_period", row.id, { periodMonth: month, reason: opts.reason });
    return row;
  });
}

export async function reopenAccountingPeriod(opts: {
  tenantId: string; actorUserId: string; periodId: string; reason: string;
}) {
  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(schema.accountingPeriods).where(and(
      eq(schema.accountingPeriods.id, opts.periodId),
      eq(schema.accountingPeriods.tenantId, opts.tenantId),
    )).for("update");
    if (!existing) throw notFound("Accounting period not found");
    if (existing.status !== "CLOSED") throw conflict("This period is not closed");

    const [row] = await tx.update(schema.accountingPeriods).set({
      status: "OPEN",
      reopenedBy: opts.actorUserId,
      reopenedAt: new Date(),
      reopenedReason: opts.reason,
    }).where(eq(schema.accountingPeriods.id, existing.id)).returning();

    await audit(tx, opts.tenantId, opts.actorUserId, "accounting.period_reopened",
      "accounting_period", row.id, { periodMonth: row.periodMonth.slice(0, 7), reason: opts.reason });
    return row;
  });
}
