import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { postJournal } from "../../src/accounting.js";
import { createApp } from "../../src/app.js";
import { login } from "../../src/auth.js";
import { createDraftInvoice, issueInvoice } from "../../src/invoicing.js";
import { db, schema } from "../../src/lib.js";
import { renderStatutoryReportCsv } from "../../src/statutory-report-exports.js";
import { getStatutoryReportPack, statutoryReportPeriodSchema } from "../../src/statutory-report-pack.js";
import { createContact, signupFinanceTenant, systemAccountId } from "./helpers.js";

const app = createApp();
const today = () => new Date().toISOString().slice(0, 10);

async function restrictedToken(tenantId: string, subdomain: string): Promise<string> {
  const [role] = await db.insert(schema.roles).values({ tenantId, name: `No reports ${Date.now()}`, permissions: ["crm.read"], isSystem: false }).returning();
  const email = `statutory-no-reports-${Date.now()}@test.vaka`;
  const password = "Statutory-Test-123!";
  await db.insert(schema.users).values({ tenantId, email, passwordHash: await bcrypt.hash(password, 4), fullName: "Restricted User", roleId: role.id });
  return (await login(email, password, subdomain)).token;
}

describe("P2-006 statutory report pack", () => {
  it("validates ordered, bounded calendar periods", () => {
    expect(() => statutoryReportPeriodSchema.parse({ from: "2026-02-30", to: "2026-03-01", asAt: "2026-03-01" })).toThrow();
    expect(() => statutoryReportPeriodSchema.parse({ from: "2026-07-14", to: "2026-07-13", asAt: "2026-07-14" })).toThrow();
    expect(() => statutoryReportPeriodSchema.parse({ from: "2026-07-01", to: "2026-07-13", asAt: "2026-07-12" })).toThrow();
    expect(() => statutoryReportPeriodSchema.parse({ from: "2025-01-01", to: "2026-07-01", asAt: "2026-07-01" })).toThrow();
  });

  it("ties posted statements, excludes after-cutoff entries, and exposes AP coverage gaps", async () => {
    const tenant = await signupFinanceTenant("statutory-ledger");
    const customer = await createContact(tenant, "=Unsafe Customer");
    const draft = await createDraftInvoice({
      tenantId: tenant.tenantId, contactId: customer.id, currency: "USD", createdBy: tenant.userId,
      lines: [{ description: "Professional service", quantity: "1", unitPrice: "100.00", taxRate: "15" }],
    });
    await issueInvoice({ tenantId: tenant.tenantId, invoiceId: draft.id, createdBy: tenant.userId });

    const vendor = await createContact(tenant, "Vendor Fixture", { isVendor: true, isCustomer: false });
    const [po] = await db.insert(schema.purchaseOrders).values({
      tenantId: tenant.tenantId, vendorContactId: vendor.id, number: `PO-${Date.now()}`,
      status: "RECEIVED", currency: "USD", total: "40.00", receivedAt: new Date(), createdBy: tenant.userId,
    }).returning();
    const ap = await systemAccountId(tenant.tenantId, "AP");
    const inventory = await systemAccountId(tenant.tenantId, "INVENTORY");
    const expense = await systemAccountId(tenant.tenantId, "COGS");
    await db.transaction((tx) => postJournal(tx, {
      tenantId: tenant.tenantId, date: new Date(), memo: "Supported PO liability", sourceType: "po_receipt", sourceId: po.id, createdBy: tenant.userId,
      lines: [{ accountId: inventory, debit: "40.00" }, { accountId: ap, credit: "40.00" }],
    }));
    await db.transaction((tx) => postJournal(tx, {
      tenantId: tenant.tenantId, date: new Date(), memo: "Unsupported manual AP control entry", sourceType: "manual", sourceId: "manual-ap-gap", createdBy: tenant.userId,
      lines: [{ accountId: expense, debit: "5.00" }, { accountId: ap, credit: "5.00" }],
    }));
    const future = new Date(`${today()}T12:00:00.000Z`); future.setUTCDate(future.getUTCDate() + 1);
    await db.transaction((tx) => postJournal(tx, {
      tenantId: tenant.tenantId, date: future, memo: "After cutoff", sourceType: "manual", sourceId: "future-entry", createdBy: tenant.userId,
      lines: [{ accountId: expense, debit: "999.00" }, { accountId: ap, credit: "999.00" }],
    }));

    const period = { from: today(), to: today(), asAt: today() };
    const report = await getStatutoryReportPack({ tenantId: tenant.tenantId, period, generatedAt: new Date("2026-07-13T10:00:00.000Z") });
    expect(report).toMatchObject({
      availability: "TECHNICAL_PREVIEW", notFilingReady: true, currency: "USD",
      checks: { trialBalanceBalances: true, profitAndLossTies: true, balanceSheetBalances: true },
      agedReceivables: { controlBalance: "115.00", scheduledBalance: "115.00", unallocatedBalance: "0.00" },
      agedPayables: { controlBalance: "45.00", scheduledBalance: "40.00", unallocatedBalance: "5.00", requiresReconciliation: true, completeOpenItemSubledger: false },
    });
    expect(report.trialBalance.find((row) => row.accountId === ap)?.credit).toBe("45.00");
    expect(report.agedPayables.items).toHaveLength(1);
    expect(report.review.blockerCodes).toContain("AP_OPEN_ITEM_SUBLEDGER_INCOMPLETE");
    const csv = renderStatutoryReportCsv(report);
    expect(csv).toContain("'=Unsafe Customer");
    expect(csv).toContain('"AGED PAYABLES - SUPPORTED SOURCES ONLY"');
  });

  it("serves tenant-safe private exports, audits them, and enforces reports.read", async () => {
    const tenant = await signupFinanceTenant("statutory-api");
    const period = { from: today(), to: today(), asAt: today() };
    const json = await request(app).get("/api/v1/reports/statutory-pack").query(period).set(tenant.auth);
    expect(json.status).toBe(200);
    expect(json.headers["cache-control"]).toBe("private, no-store");
    expect(json.body).toMatchObject({ notFilingReady: true, agedReceivables: { controlBalance: "0.00" } });
    expect(json.body.trialBalance.every((row: { debit: string; credit: string }) => row.debit === "0.00" && row.credit === "0.00")).toBe(true);

    const csv = await request(app).get("/api/v1/reports/statutory-pack.csv").query(period).set(tenant.auth);
    expect(csv.status).toBe(200);
    expect(csv.headers["content-type"]).toContain("text/csv");
    expect(csv.headers["cache-control"]).toBe("private, no-store");
    const pdf = await request(app).get("/api/v1/reports/statutory-pack.pdf").query(period).set(tenant.auth);
    expect(pdf.status).toBe(200);
    expect(pdf.body.subarray(0, 8).toString()).toBe("%PDF-1.4");
    expect(pdf.body.toString("latin1")).toContain("technical preview");
    expect(pdf.body.toString("latin1")).toContain("Powered by VAKA OS  |  www.vakaos.com");

    const audits = await db.select().from(schema.auditLogs).where(and(eq(schema.auditLogs.tenantId, tenant.tenantId), eq(schema.auditLogs.action, "report.statutory_pack_exported")));
    expect(audits).toHaveLength(2);
    expect(audits.map((row) => (row.metadata as { format: string }).format).sort()).toEqual(["csv", "pdf"]);

    const [tenantRow] = await db.select({ subdomain: schema.tenants.subdomain }).from(schema.tenants).where(eq(schema.tenants.id, tenant.tenantId));
    const token = await restrictedToken(tenant.tenantId, tenantRow.subdomain);
    const denied = await request(app).get("/api/v1/reports/statutory-pack").query(period).set({ Authorization: `Bearer ${token}` });
    expect(denied.status).toBe(403);

    const other = await signupFinanceTenant("statutory-isolation");
    const isolated = await request(app).get("/api/v1/reports/statutory-pack").query(period).set(other.auth);
    expect(isolated.status).toBe(200);
    expect(isolated.body.agedPayables.controlBalance).toBe("0.00");
  });
});
