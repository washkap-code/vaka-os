import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { postJournal } from "../../src/accounting.js";
import { login } from "../../src/auth.js";
import { createDraftInvoice, issueInvoice, voidInvoice } from "../../src/invoicing.js";
import { db, schema } from "../../src/lib.js";
import { getVatTechnicalReport, vatReportPeriodSchema } from "../../src/vat-return-report.js";
import { renderVatReportCsv } from "../../src/vat-return-exports.js";
import { createContact, signupFinanceTenant, systemAccountId } from "./helpers.js";

const app = createApp();
const today = () => new Date().toISOString().slice(0, 10);

async function createRestrictedToken(tenantId: string, subdomain: string): Promise<string> {
  const [role] = await db.insert(schema.roles).values({
    tenantId,
    name: `No reports ${Date.now()}`,
    permissions: ["crm.read"],
    isSystem: false,
  }).returning();
  const email = `vat-no-reports-${Date.now()}@test.vaka`;
  const password = "VAT-Report-Test-123!";
  await db.insert(schema.users).values({
    tenantId,
    email,
    passwordHash: await bcrypt.hash(password, 4),
    fullName: "No Reports User",
    roleId: role.id,
  });
  return (await login(email, password, subdomain)).token;
}

describe("P2-003 VAT technical report", () => {
  it("reconciles posted output, input, and reversal evidence in exact cents", async () => {
    const tenant = await signupFinanceTenant("vat-report-ledger");
    const customer = await createContact(tenant, "VAT Report Customer");
    const draft = await createDraftInvoice({
      tenantId: tenant.tenantId,
      contactId: customer.id,
      currency: "USD",
      taxDate: today(),
      createdBy: tenant.userId,
      lines: [{ description: "Standard supply", quantity: "1", unitPrice: "100.00", taxTreatment: "standard" }],
    });
    await issueInvoice({ tenantId: tenant.tenantId, invoiceId: draft.id, createdBy: tenant.userId });

    const reversedDraft = await createDraftInvoice({
      tenantId: tenant.tenantId,
      contactId: customer.id,
      currency: "USD",
      taxDate: today(),
      createdBy: tenant.userId,
      lines: [{ description: "Reversed supply", quantity: "1", unitPrice: "50.00", taxTreatment: "standard" }],
    });
    await issueInvoice({ tenantId: tenant.tenantId, invoiceId: reversedDraft.id, createdBy: tenant.userId });
    await voidInvoice({ tenantId: tenant.tenantId, invoiceId: reversedDraft.id, reason: "Synthetic reversal fixture", createdBy: tenant.userId });

    const vatInput = await systemAccountId(tenant.tenantId, "VAT_INPUT");
    const ap = await systemAccountId(tenant.tenantId, "AP");
    await db.transaction((tx) => postJournal(tx, {
      tenantId: tenant.tenantId,
      date: new Date(),
      memo: "=HYPERLINK(\"https://unsafe.test\")",
      sourceType: "supplier_tax_fixture",
      sourceId: "synthetic-input-vat",
      createdBy: tenant.userId,
      lines: [
        { accountId: vatInput, debit: "5.00" },
        { accountId: ap, credit: "5.00" },
      ],
    }));

    const period = { from: today(), to: today() };
    const report = await getVatTechnicalReport({
      tenantId: tenant.tenantId,
      period,
      generatedAt: new Date("2026-07-13T08:00:00.000Z"),
    });
    expect(report).toMatchObject({
      reportType: "vat-technical-preview",
      filingReady: false,
      currency: "USD",
      entity: { tenantId: tenant.tenantId, countryCode: "ZW" },
      totals: { outputVat: "15.00", inputVat: "5.00", netVat: "10.00", position: "payable" },
      coverage: { inputVat: "posted-vat-input-ledger-only" },
    });
    expect(report.evidence).toHaveLength(4);
    expect(report.evidence.filter((row) => row.account === "VAT_OUTPUT").map((row) => row.impact))
      .toEqual(["15.00", "7.50", "-7.50"]);
    expect(report.evidence.find((row) => row.invoice?.id === draft.id)?.invoice).toMatchObject({
      taxJurisdiction: "ZW",
      taxTreatment: "standard",
      taxTotal: "15.00",
    });
    const csv = renderVatReportCsv(report);
    expect(csv).toContain("\"Invoice jurisdiction\"");
    expect(csv).toContain("\"Invoice tax total\"");
    expect(csv).toContain("'=HYPERLINK(\"\"https://unsafe.test\"\")");

    await db.transaction((tx) => postJournal(tx, {
      tenantId: tenant.tenantId,
      date: new Date(),
      memo: "Additional synthetic input VAT for credit-position coverage",
      sourceType: "supplier_tax_fixture",
      sourceId: "synthetic-input-vat-credit",
      createdBy: tenant.userId,
      lines: [
        { accountId: vatInput, debit: "15.00" },
        { accountId: ap, credit: "15.00" },
      ],
    }));
    const creditReport = await getVatTechnicalReport({ tenantId: tenant.tenantId, period });
    expect(creditReport.totals).toEqual({
      outputVat: "15.00",
      inputVat: "20.00",
      netVat: "-5.00",
      position: "credit",
    });
  });

  it("serves tenant-safe JSON/CSV/PDF, audits exports, and enforces permission", async () => {
    const tenantA = await signupFinanceTenant("vat-report-api-a");
    const customer = await createContact(tenantA, "VAT Export Customer");
    const draft = await createDraftInvoice({
      tenantId: tenantA.tenantId,
      contactId: customer.id,
      currency: "USD",
      createdBy: tenantA.userId,
      lines: [{ description: "Export supply", quantity: "1", unitPrice: "20.00", taxTreatment: "standard" }],
    });
    await issueInvoice({ tenantId: tenantA.tenantId, invoiceId: draft.id, createdBy: tenantA.userId });
    const period = { from: today(), to: today() };

    const json = await request(app).get("/api/v1/reports/vat").query(period).set(tenantA.auth);
    expect(json.status).toBe(200);
    expect(json.body.totals).toMatchObject({ outputVat: "3.00", inputVat: "0.00", netVat: "3.00" });

    const csv = await request(app).get("/api/v1/reports/vat.csv").query(period).set(tenantA.auth);
    expect(csv.status).toBe(200);
    expect(csv.headers["content-type"]).toContain("text/csv");
    expect(csv.headers["cache-control"]).toBe("private, no-store");
    expect(csv.text).toContain('"Output VAT","3.00"');
    expect(csv.text).toContain('"Net VAT","3.00"');

    const pdf = await request(app).get("/api/v1/reports/vat.pdf").query(period).set(tenantA.auth);
    expect(pdf.status).toBe(200);
    expect(pdf.headers["content-type"]).toContain("application/pdf");
    expect(pdf.headers["cache-control"]).toBe("private, no-store");
    expect(pdf.body.subarray(0, 8).toString()).toBe("%PDF-1.4");
    // Reports are the tenant's own branded documents — no VAKA branding.
    const vatPdfText = pdf.body.toString("latin1");
    expect(vatPdfText).toContain("Finance Kernel vat-report-api-a");
    expect(vatPdfText).toContain("VAT Technical Preview");
    expect(vatPdfText).toContain("not filing-ready");
    expect(vatPdfText).not.toContain("Powered by VAKA OS");

    const audits = await db.select().from(schema.auditLogs).where(and(
      eq(schema.auditLogs.tenantId, tenantA.tenantId),
      eq(schema.auditLogs.action, "report.vat_exported"),
    ));
    expect(audits).toHaveLength(2);
    expect(audits.map((row) => (row.metadata as { format: string }).format).sort()).toEqual(["csv", "pdf"]);

    const tenantB = await signupFinanceTenant("vat-report-api-b");
    const isolated = await request(app).get("/api/v1/reports/vat").query(period).set(tenantB.auth);
    expect(isolated.status).toBe(200);
    expect(isolated.body).toMatchObject({ totals: { outputVat: "0.00", inputVat: "0.00", netVat: "0.00", position: "nil" }, evidence: [] });

    const [tenantRow] = await db.select({ subdomain: schema.tenants.subdomain })
      .from(schema.tenants).where(eq(schema.tenants.id, tenantA.tenantId));
    const deniedToken = await createRestrictedToken(tenantA.tenantId, tenantRow.subdomain);
    const denied = await request(app).get("/api/v1/reports/vat").query(period)
      .set({ Authorization: `Bearer ${deniedToken}` });
    expect(denied.status).toBe(403);
  });

  it("rejects invalid, reversed, and over-broad periods", async () => {
    expect(() => vatReportPeriodSchema.parse({ from: "2026-02-30", to: "2026-03-01" })).toThrow();
    expect(() => vatReportPeriodSchema.parse({ from: "2026-07-14", to: "2026-07-13" })).toThrow();
    expect(() => vatReportPeriodSchema.parse({ from: "2025-01-01", to: "2026-07-13" })).toThrow();

    const tenant = await signupFinanceTenant("vat-report-invalid-period");
    const response = await request(app).get("/api/v1/reports/vat")
      .query({ from: "2026-02-30", to: "2026-03-01" }).set(tenant.auth);
    expect(response.status).toBe(400);
  });
});
