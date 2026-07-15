// ============================================================================
// P2-009 PAYROLL TESTS — statutory math, run lifecycle, ledger integrity.
//   1. PAYE band edges (USD + ZWG tables) and AIDS levy rounding
//   2. NSSA ceiling, tax deductibility, fail-closed unconfigured currency
//   3. Effective-date fail-closed behaviour (month before any table)
//   4. Run lifecycle: draft -> adjust -> post (balanced journal) -> immutable
//      -> reverse (offsetting journal) -> month re-runnable
//   5. Period close refuses payroll posting
//   6. Tenant isolation and permission gates
//   7. Accountant gate: verification status on config and runs
// ============================================================================
import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { createApp } from "../src/app.js";
import { db, schema, toCents } from "../src/lib.js";
import { login } from "../src/auth.js";
import { calculatePaye, computePayslip, effectivePayeTable, effectiveSocialSecurity } from "../src/payroll.js";
import { ZIMBABWE } from "../src/countries/zw.js";

const app = createApp();
const uniq = `pr${Date.now().toString(36)}`;

async function makeTenant(n: string, currency: "USD" | "ZWG" = "USD") {
  const res = await request(app).post("/api/v1/auth/signup").send({
    companyName: `Payroll Co ${n}`, subdomain: `${uniq}${n}`, baseCurrency: currency,
    ownerEmail: `owner-${uniq}-${n}@test.zw`, ownerPassword: "SuperSecret123!", ownerName: "Owner",
    planName: "Growth",
  });
  expect(res.status).toBe(200);
  return { token: res.body.token as string, tenantId: res.body.tenant.id as string, subdomain: `${uniq}${n}` };
}
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

const config = ZIMBABWE.payroll!;
const usdTable = effectivePayeTable(config, "USD", "2026-03-01");
const zwgTable = effectivePayeTable(config, "ZWG", "2026-03-01");
const ssRule = effectiveSocialSecurity(config, "2026-03-01");

let A: { token: string; tenantId: string; subdomain: string };
let B: { token: string; tenantId: string; subdomain: string };

beforeAll(async () => {
  A = await makeTenant("a");
  B = await makeTenant("b");
});

describe("PAYE calculation (USD 2026 table)", () => {
  const paye = (taxable: string) => calculatePaye(toCents(taxable), usdTable);

  it("charges nothing at or below the tax-free threshold", () => {
    expect(paye("100.00").payeCents).toBe(0n);
    expect(paye("100.00").levyCents).toBe(0n);
    expect(paye("50.00").payeCents).toBe(0n);
  });
  it("taxes only the excess in the 20% band", () => {
    expect(paye("300.00").payeCents).toBe(toCents("40.00")); // 200 @ 20%
    expect(paye("101.00").payeCents).toBe(toCents("0.20"));
  });
  it("crosses into the 25% and 40% bands progressively", () => {
    expect(paye("3000.00").payeCents).toBe(toCents("715.00")); // 40 + 2700@25%
    expect(paye("5000.00").payeCents).toBe(toCents("1515.00")); // 715 + 2000@40%
  });
  it("applies the 3% AIDS levy to the PAYE amount", () => {
    const r = paye("5000.00");
    expect(r.levyCents).toBe(toCents("45.45")); // 3% of 1515
  });
  it("resolves the ZWG table independently", () => {
    const r = calculatePaye(toCents("2800.00"), zwgTable);
    expect(r.payeCents).toBe(0n);
    const r2 = calculatePaye(toCents("8400.00"), zwgTable);
    expect(r2.payeCents).toBe(toCents("1120.00")); // 5600 @ 20%
  });
});

describe("NSSA and payslip composition", () => {
  it("caps insurable earnings at the ceiling and deducts before PAYE", () => {
    const slip = computePayslip({
      basicSalary: "1000.00", allowances: "0", currency: "USD",
      payeTable: usdTable, ssRule, onDate: "2026-03-01",
    });
    expect(slip.ssEmployee).toBe("31.50"); // 4.5% of 700 ceiling
    expect(slip.ssEmployer).toBe("31.50");
    expect(slip.taxablePay).toBe("968.50"); // 1000 - 31.50
    expect(slip.paye).toBe("207.13"); // 40 + 668.50@25% (rounded half-up)
    expect(slip.taxLevy).toBe("6.21");
    expect(slip.netPay).toBe("755.16");
    expect(slip.calculationTrace).toMatchObject({
      socialSecurity: { insurableEarnings: "700.00", employeeContributionTaxDeductible: true },
    });
  });
  it("uses full earnings below the ceiling", () => {
    const slip = computePayslip({
      basicSalary: "500.00", allowances: "0", currency: "USD",
      payeTable: usdTable, ssRule, onDate: "2026-03-01",
    });
    expect(slip.ssEmployee).toBe("22.50"); // 4.5% of 500
  });
  it("fails closed for a currency without a configured ceiling (ZWG)", () => {
    expect(() => computePayslip({
      basicSalary: "50000.00", allowances: "0", currency: "ZWG",
      payeTable: zwgTable, ssRule, onDate: "2026-03-01",
    })).toThrow(/ceiling for ZWG is not configured/);
  });
  it("fails closed when no PAYE table covers the date", () => {
    expect(() => effectivePayeTable(config, "USD", "2025-12-01")).toThrow(/No effective PAYE table/);
  });
});

describe("payroll run lifecycle", () => {
  let employeeId: string;
  let runId: string;
  let payslipId: string;

  it("serves the accountant-gate verification status on config", async () => {
    const res = await request(app).get("/api/v1/payroll/config").set(auth(A.token));
    expect(res.status).toBe(200);
    expect(res.body.verification.status).toBe("TECHNICAL_PREVIEW");
    expect(res.body.baseCurrency).toBe("USD");
  });

  it("registers an employee (audited, base currency enforced)", async () => {
    const bad = await request(app).post("/api/v1/payroll/employees").set(auth(A.token)).send({
      employeeNumber: "E001", firstName: "Tariro", lastName: "Moyo",
      currency: "ZWG", basicSalary: "1000.00",
    });
    expect(bad.status).toBe(400);
    expect(bad.body.message).toMatch(/base currency/);

    const res = await request(app).post("/api/v1/payroll/employees").set(auth(A.token)).send({
      employeeNumber: "E001", firstName: "Tariro", lastName: "Moyo",
      nationalId: "63-123456A70", nssaNumber: "NS12345",
      currency: "USD", basicSalary: "1000.00", startDate: "2026-01-01",
    });
    expect(res.status).toBe(200);
    employeeId = res.body.id;

    const dup = await request(app).post("/api/v1/payroll/employees").set(auth(A.token)).send({
      employeeNumber: "E001", firstName: "Dup", lastName: "Licate",
      currency: "USD", basicSalary: "500.00",
    });
    expect(dup.status).toBe(409);
  });

  it("creates a draft run with computed payslips and a calculation trace", async () => {
    const res = await request(app).post("/api/v1/payroll/runs").set(auth(A.token))
      .send({ month: "2026-03" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("DRAFT");
    expect(res.body.verificationStatus).toBe("TECHNICAL_PREVIEW");
    expect(res.body.grossTotal).toBe("1000.00");
    expect(res.body.netTotal).toBe("755.16");
    runId = res.body.id;

    const detail = await request(app).get(`/api/v1/payroll/runs/${runId}`).set(auth(A.token));
    expect(detail.status).toBe(200);
    expect(detail.body.payslips).toHaveLength(1);
    payslipId = detail.body.payslips[0].id;
    expect(detail.body.payslips[0].paye).toBe("207.13");
    expect(detail.body.payslips[0].calculationTrace.payeBands.length).toBeGreaterThan(0);

    const clash = await request(app).post("/api/v1/payroll/runs").set(auth(A.token))
      .send({ month: "2026-03" });
    expect(clash.status).toBe(409);
  });

  it("recomputes a draft payslip when allowances change", async () => {
    const res = await request(app)
      .patch(`/api/v1/payroll/runs/${runId}/payslips/${payslipId}`)
      .set(auth(A.token)).send({ allowances: "200.00" });
    expect(res.status).toBe(200);
    expect(res.body.grossTotal).toBe("1200.00");

    const detail = await request(app).get(`/api/v1/payroll/runs/${runId}`).set(auth(A.token));
    const slip = detail.body.payslips[0];
    expect(slip.grossPay).toBe("1200.00");
    expect(slip.ssEmployee).toBe("31.50"); // still capped at the ceiling
    expect(slip.taxablePay).toBe("1168.50");

    // Return to the baseline for the posting assertions below.
    const reset = await request(app)
      .patch(`/api/v1/payroll/runs/${runId}/payslips/${payslipId}`)
      .set(auth(A.token)).send({ allowances: "0.00" });
    expect(reset.status).toBe(200);
  });

  it("posts one balanced journal routed to the payroll control accounts", async () => {
    const res = await request(app).post(`/api/v1/payroll/runs/${runId}/post`).set(auth(A.token));
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("POSTED");
    const journalEntryId = res.body.journalEntryId as string;
    expect(journalEntryId).toBeTruthy();

    const lines = await db.select({
      debit: schema.journalLines.debit, credit: schema.journalLines.credit,
      accountId: schema.journalLines.accountId,
    }).from(schema.journalLines).where(eq(schema.journalLines.journalEntryId, journalEntryId));
    expect(lines).toHaveLength(4);
    const totalDebit = lines.reduce((s, l) => s + toCents(l.debit), 0n);
    const totalCredit = lines.reduce((s, l) => s + toCents(l.credit), 0n);
    expect(totalDebit).toBe(totalCredit);
    expect(totalDebit).toBe(toCents("1031.50")); // gross 1000 + employer NSSA 31.50

    const accounts = await db.select().from(schema.accounts)
      .where(eq(schema.accounts.tenantId, A.tenantId));
    const byKey = (key: string) => accounts.find((a) => a.systemKey === key)!;
    expect(byKey("WAGES_EXPENSE")).toBeTruthy();
    expect(byKey("NET_WAGES_PAYABLE")).toBeTruthy();
    const netLine = lines.find((l) => l.accountId === byKey("NET_WAGES_PAYABLE").id)!;
    expect(netLine.credit).toBe("755.16");
    const payeLine = lines.find((l) => l.accountId === byKey("PAYE_PAYABLE").id)!;
    expect(payeLine.credit).toBe("213.34"); // 207.13 PAYE + 6.21 levy
    const nssaLine = lines.find((l) => l.accountId === byKey("NSSA_PAYABLE").id)!;
    expect(nssaLine.credit).toBe("63.00");
  });

  it("keeps posted runs immutable", async () => {
    const adjust = await request(app)
      .patch(`/api/v1/payroll/runs/${runId}/payslips/${payslipId}`)
      .set(auth(A.token)).send({ allowances: "999.00" });
    expect(adjust.status).toBe(409);
    const del = await request(app).delete(`/api/v1/payroll/runs/${runId}`).set(auth(A.token));
    expect(del.status).toBe(409);
    const repost = await request(app).post(`/api/v1/payroll/runs/${runId}/post`).set(auth(A.token));
    expect(repost.status).toBe(409);
  });

  it("reverses with a full offsetting journal and frees the month", async () => {
    const res = await request(app).post(`/api/v1/payroll/runs/${runId}/reverse`)
      .set(auth(A.token)).send({ reason: "Incorrect salary configuration" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("REVERSED");
    const reversalId = res.body.reversalJournalEntryId as string;
    const lines = await db.select({
      debit: schema.journalLines.debit, credit: schema.journalLines.credit,
    }).from(schema.journalLines).where(eq(schema.journalLines.journalEntryId, reversalId));
    const totalDebit = lines.reduce((s, l) => s + toCents(l.debit), 0n);
    expect(totalDebit).toBe(toCents("1031.50"));

    const rerun = await request(app).post("/api/v1/payroll/runs").set(auth(A.token))
      .send({ month: "2026-03" });
    expect(rerun.status).toBe(200);
    // Clean up the fresh draft so later tests see a stable state.
    await request(app).delete(`/api/v1/payroll/runs/${rerun.body.id}`).set(auth(A.token));
  });

  it("refuses to post into a closed accounting period", async () => {
    const run = await request(app).post("/api/v1/payroll/runs").set(auth(A.token))
      .send({ month: "2026-04" });
    expect(run.status).toBe(200);
    const close = await request(app).post("/api/v1/accounting/periods/close").set(auth(A.token))
      .send({ month: "2026-04", reason: "Month-end close for testing" });
    expect(close.status).toBe(200);
    const post = await request(app).post(`/api/v1/payroll/runs/${run.body.id}/post`).set(auth(A.token));
    expect(post.status).toBe(400);
    expect(post.body.message).toMatch(/period is closed/);
  });

  it("fails closed for a month before any effective PAYE table", async () => {
    const res = await request(app).post("/api/v1/payroll/runs").set(auth(A.token))
      .send({ month: "2025-11" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/No effective PAYE table/);
  });
});

describe("tenant isolation and permissions", () => {
  it("hides tenant A's payroll from tenant B", async () => {
    const runs = await request(app).get("/api/v1/payroll/runs").set(auth(B.token));
    expect(runs.status).toBe(200);
    expect(runs.body).toHaveLength(0);
    const employees = await request(app).get("/api/v1/payroll/employees").set(auth(B.token));
    expect(employees.body).toHaveLength(0);

    const aRuns = await request(app).get("/api/v1/payroll/runs").set(auth(A.token));
    const anyRun = aRuns.body[0];
    const stolen = await request(app).get(`/api/v1/payroll/runs/${anyRun.id}`).set(auth(B.token));
    expect(stolen.status).toBe(404);
  });

  it("denies payroll to roles without payroll permissions", async () => {
    const roles = await db.select().from(schema.roles).where(eq(schema.roles.tenantId, A.tenantId));
    const sales = roles.find((r) => r.name === "Sales")!;
    const email = `sales-${uniq}@test.zw`;
    await db.insert(schema.users).values({
      tenantId: A.tenantId, email, fullName: "Sales User",
      passwordHash: await bcrypt.hash("Sales-Test-123!", 4),
      roleId: sales.id, mustChangePassword: false, status: "active",
    });
    const token = (await login(email, "Sales-Test-123!", A.subdomain)).token;
    const read = await request(app).get("/api/v1/payroll/employees").set(auth(token));
    expect(read.status).toBe(403);
    const write = await request(app).post("/api/v1/payroll/runs").set(auth(token))
      .send({ month: "2026-05" });
    expect(write.status).toBe(403);
  });

  it("grants the seeded Accountant role full payroll access", async () => {
    const roles = await db.select().from(schema.roles).where(eq(schema.roles.tenantId, A.tenantId));
    const accountant = roles.find((r) => r.name === "Accountant")!;
    expect(accountant.permissions).toContain("payroll.read");
    expect(accountant.permissions).toContain("payroll.manage");
    expect(accountant.permissions).toContain("payroll.post");
  });
});
