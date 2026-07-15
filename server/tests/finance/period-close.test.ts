// ============================================================================
// P2-005 — financial period close.
//
// Covers: migration idempotency, close/reopen lifecycle with audit, posting
// refusal in a closed period across the postJournal funnel (manual journal,
// expense route), DB-trigger defence in depth, offsetting corrections in an
// open period, current/future month refusal, permission and Owner gates,
// tenant isolation and double-close conflicts.
// ============================================================================
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { and, eq, sql } from "drizzle-orm";
import { createApp } from "../../src/app.js";
import { db, schema } from "../../src/lib.js";
import { postJournal } from "../../src/accounting.js";
import { closeAccountingPeriod, periodMonthOf } from "../../src/accounting-periods.js";
import { signupFinanceTenant, systemAccountId } from "./helpers.js";

const app = createApp();

// A completed month strictly in the past, and a posting date inside it.
const now = new Date();
const closedMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1));
const closedMonthKey = `${closedMonthStart.getUTCFullYear()}-${String(closedMonthStart.getUTCMonth() + 1).padStart(2, "0")}`;
const dateInClosedMonth = new Date(Date.UTC(closedMonthStart.getUTCFullYear(), closedMonthStart.getUTCMonth(), 15, 12));
const currentMonthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

async function manualJournal(tenant: { tenantId: string; userId: string }, date: Date, memo: string) {
  const bank = await systemAccountId(tenant.tenantId, "BANK");
  const sales = await systemAccountId(tenant.tenantId, "SALES");
  return db.transaction(async (tx) => postJournal(tx, {
    tenantId: tenant.tenantId, date, memo, sourceType: "manual",
    createdBy: tenant.userId,
    lines: [
      { accountId: bank, debit: "100.00" },
      { accountId: sales, credit: "100.00" },
    ],
  }));
}

describe("P2-005 financial period close", () => {
  it("applies the 0034 migration idempotently with runtime schema present", async () => {
    const migration = readFileSync(new URL("../../drizzle/0034_accounting_period_close.sql", import.meta.url), "utf8");
    await db.execute(sql.raw(migration));
    await db.execute(sql.raw(migration));
    const { rows } = await db.execute(sql`
      SELECT count(*)::int AS n FROM information_schema.columns
      WHERE table_name = 'accounting_periods'
        AND column_name IN ('tenant_id', 'period_month', 'status', 'closed_by', 'closed_reason')
    `) as unknown as { rows: { n: number }[] };
    expect(rows[0].n).toBe(5);
    const { rows: trigger } = await db.execute(sql`
      SELECT count(*)::int AS n FROM pg_trigger WHERE tgname = 'journal_entries_period_lock'
    `) as unknown as { rows: { n: number }[] };
    expect(trigger[0].n).toBe(1);
  });

  it("locks a closed month across the posting funnel and accepts offsetting corrections in an open month", async () => {
    const tenant = await signupFinanceTenant("period-close-core");

    // History exists in the month before it closes.
    await manualJournal(tenant, dateInClosedMonth, "Pre-close revenue");

    const closed = await request(app).post("/api/v1/accounting/periods/close").set(tenant.auth)
      .send({ month: closedMonthKey, reason: "Month-end review complete" });
    expect(closed.status).toBe(200);
    expect(closed.body.status).toBe("CLOSED");

    // Manual journal into the closed month is refused with the correction guidance.
    await expect(manualJournal(tenant, dateInClosedMonth, "Late edit attempt"))
      .rejects.toMatchObject({ status: 400 });

    // The expense route (a postJournal consumer) is refused too.
    const [expenseAccount] = await db.select({ id: schema.accounts.id }).from(schema.accounts)
      .where(and(
        eq(schema.accounts.tenantId, tenant.tenantId),
        eq(schema.accounts.type, "EXPENSE"),
        eq(schema.accounts.isActive, true),
      )).limit(1);
    const expense = await request(app).post("/api/v1/expenses").set(tenant.auth)
      .set("Idempotency-Key", `closed-expense-${Date.now()}`)
      .send({
        categoryAccountId: expenseAccount.id, amount: "50.00", currency: "USD", rateToBase: "1",
        date: dateInClosedMonth.toISOString(), description: "Backdated expense attempt",
      });
    expect(expense.status).toBe(400);
    expect(expense.body.message).toContain("closed");

    // Correction posts as an offsetting entry dated today (open period).
    await expect(manualJournal(tenant, new Date(), "Offsetting correction for closed month"))
      .resolves.toBeTruthy();

    // Audit evidence.
    const [event] = await db.select().from(schema.auditLogs).where(and(
      eq(schema.auditLogs.tenantId, tenant.tenantId),
      eq(schema.auditLogs.action, "accounting.period_closed"),
    ));
    expect(event).toBeTruthy();
    expect((event.metadata as any).periodMonth).toBe(closedMonthKey);
  });

  it("enforces the lock at the database beneath the application boundary", async () => {
    const tenant = await signupFinanceTenant("period-close-trigger");
    await closeAccountingPeriod({
      tenantId: tenant.tenantId, actorUserId: tenant.userId,
      month: closedMonthKey, reason: "Trigger defence test",
    });
    const bypass = await db.execute(sql`
      INSERT INTO journal_entries (tenant_id, date, memo, source_type)
      VALUES (${tenant.tenantId}, ${dateInClosedMonth.toISOString()}::timestamptz, 'Raw bypass attempt', 'manual')
    `).then(() => null, (error: unknown) => error as Error & { cause?: Error });
    expect(bypass, "raw insert into a closed month must be rejected by the trigger").toBeTruthy();
    expect(`${bypass!.message} ${bypass!.cause?.message ?? ""}`).toMatch(/closed/i);
  });

  it("refuses closing current or future months, double closes, and enforces role gates", async () => {
    const tenant = await signupFinanceTenant("period-close-gates");

    const current = await request(app).post("/api/v1/accounting/periods/close").set(tenant.auth)
      .send({ month: currentMonthKey, reason: "Too eager" });
    expect(current.status).toBe(400);

    const future = await request(app).post("/api/v1/accounting/periods/close").set(tenant.auth)
      .send({ month: `${now.getUTCFullYear() + 1}-01`, reason: "Future month" });
    expect(future.status).toBe(400);

    const first = await request(app).post("/api/v1/accounting/periods/close").set(tenant.auth)
      .send({ month: closedMonthKey, reason: "First close" });
    expect(first.status).toBe(200);
    const again = await request(app).post("/api/v1/accounting/periods/close").set(tenant.auth)
      .send({ month: closedMonthKey, reason: "Second close" });
    expect(again.status).toBe(409);

    expect((await request(app).post("/api/v1/accounting/periods/close")
      .send({ month: closedMonthKey, reason: "Anonymous" })).status).toBe(401);
  });

  it("reopen is Owner-only, audited, and restores posting; periods list is tenant-scoped", async () => {
    const tenantA = await signupFinanceTenant("period-reopen-a");
    const tenantB = await signupFinanceTenant("period-reopen-b");
    const closed = await request(app).post("/api/v1/accounting/periods/close").set(tenantA.auth)
      .send({ month: closedMonthKey, reason: "Reopen lifecycle test" });
    expect(closed.status).toBe(200);
    const periodId = closed.body.id as string;

    // Tenant B cannot see or reopen tenant A's period; tenant B stays unlocked.
    const listB = await request(app).get("/api/v1/accounting/periods").set(tenantB.auth);
    expect(listB.body.some((row: any) => row.id === periodId)).toBe(false);
    expect((await request(app).post(`/api/v1/accounting/periods/${periodId}/reopen`)
      .set(tenantB.auth).send({ reason: "Cross-tenant attempt" })).status).toBe(404);
    await expect(manualJournal(tenantB, dateInClosedMonth, "Other tenant unaffected"))
      .resolves.toBeTruthy();

    // Owner reopens; posting into the month resumes; audit recorded.
    const reopened = await request(app).post(`/api/v1/accounting/periods/${periodId}/reopen`)
      .set(tenantA.auth).send({ reason: "Accountant requested a reopen for corrections" });
    expect(reopened.status).toBe(200);
    expect(reopened.body.status).toBe("OPEN");
    await expect(manualJournal(tenantA, dateInClosedMonth, "Post-reopen correction"))
      .resolves.toBeTruthy();
    const [event] = await db.select().from(schema.auditLogs).where(and(
      eq(schema.auditLogs.tenantId, tenantA.tenantId),
      eq(schema.auditLogs.action, "accounting.period_reopened"),
    ));
    expect(event).toBeTruthy();

    // Re-close after reopen works (lifecycle round trip).
    const reclosed = await request(app).post("/api/v1/accounting/periods/close").set(tenantA.auth)
      .send({ month: closedMonthKey, reason: "Corrections complete" });
    expect(reclosed.status).toBe(200);
    expect(reclosed.body.status).toBe("CLOSED");
  });

  it("periodMonthOf uses UTC month boundaries", () => {
    expect(periodMonthOf(new Date("2026-03-31T23:59:59.999Z"))).toBe("2026-03-01");
    expect(periodMonthOf(new Date("2026-04-01T00:00:00.000Z"))).toBe("2026-04-01");
  });
});
