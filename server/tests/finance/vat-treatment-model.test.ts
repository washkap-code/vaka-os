import { and, eq } from "drizzle-orm";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { createDraftInvoice, issueInvoice } from "../../src/invoicing.js";
import { db, schema } from "../../src/lib.js";
import { createContact, journalEntriesBySource, signupFinanceTenant } from "./helpers.js";

const app = createApp();

describe("P2-002 VAT treatment model", () => {
  it("preserves standard-rate parity through effective-dated Zimbabwe country-pack evidence", async () => {
    const tenant = await signupFinanceTenant("vat-standard");
    const customer = await createContact(tenant, "Standard VAT Customer");
    const draft = await createDraftInvoice({
      tenantId: tenant.tenantId,
      contactId: customer.id,
      currency: "USD",
      taxDate: "2026-07-13",
      createdBy: tenant.userId,
      lines: [{
        description: "Standard service",
        quantity: "2",
        unitPrice: "100.00",
        taxTreatment: "standard",
        taxRate: "15",
      }],
    });
    expect(draft).toMatchObject({
      taxJurisdiction: "ZW",
      taxDate: "2026-07-13",
      taxTreatment: "standard",
      subtotal: "200.00",
      taxTotal: "30.00",
      total: "230.00",
    });
    const [line] = await db.select().from(schema.invoiceLineItems)
      .where(eq(schema.invoiceLineItems.invoiceId, draft.id));
    expect(line).toMatchObject({
      taxTreatment: "standard",
      taxRate: "15.00",
      taxAmount: "30.00",
      taxRateEffectiveFrom: "2020-01-01",
      taxRateEffectiveTo: null,
    });

    const issued = await issueInvoice({ tenantId: tenant.tenantId, invoiceId: draft.id, createdBy: tenant.userId });
    const [journal] = await journalEntriesBySource(tenant.tenantId, "invoice", issued.id);
    const journalLines = await db.select().from(schema.journalLines)
      .where(eq(schema.journalLines.journalEntryId, journal.id));
    const [vatAccount] = await db.select().from(schema.accounts).where(and(
      eq(schema.accounts.tenantId, tenant.tenantId),
      eq(schema.accounts.systemKey, "VAT_OUTPUT"),
    ));
    expect(journalLines.find((entry) => entry.accountId === vatAccount.id)?.credit).toBe("30.00");
  });

  it("keeps zero-rated and exempt evidence distinct and posts only standard VAT on a mixed invoice", async () => {
    const tenant = await signupFinanceTenant("vat-mixed");
    const customer = await createContact(tenant, "Mixed VAT Customer");
    const draft = await createDraftInvoice({
      tenantId: tenant.tenantId,
      contactId: customer.id,
      currency: "USD",
      taxDate: "2026-07-13",
      createdBy: tenant.userId,
      lines: [
        { description: "Standard", quantity: "1", unitPrice: "100.00", taxTreatment: "standard" },
        { description: "Zero rated", quantity: "1", unitPrice: "100.00", taxTreatment: "zero-rated" },
        { description: "Exempt", quantity: "1", unitPrice: "100.00", taxTreatment: "exempt" },
      ],
    });
    expect(draft).toMatchObject({
      taxTreatment: "mixed",
      subtotal: "300.00",
      taxTotal: "15.00",
      total: "315.00",
    });
    const lines = await db.select().from(schema.invoiceLineItems)
      .where(eq(schema.invoiceLineItems.invoiceId, draft.id));
    expect(lines.map((line) => ({
      treatment: line.taxTreatment,
      rate: line.taxRate,
      tax: line.taxAmount,
    }))).toEqual([
      { treatment: "standard", rate: "15.00", tax: "15.00" },
      { treatment: "zero-rated", rate: "0.00", tax: "0.00" },
      { treatment: "exempt", rate: "0.00", tax: "0.00" },
    ]);

    const issued = await issueInvoice({ tenantId: tenant.tenantId, invoiceId: draft.id, createdBy: tenant.userId });
    const [snapshot] = await db.select().from(schema.invoiceDocumentSnapshots)
      .where(eq(schema.invoiceDocumentSnapshots.invoiceId, issued.id));
    expect(snapshot.document).toMatchObject({
      invoice: { taxJurisdiction: "ZW", taxDate: "2026-07-13", taxTreatment: "mixed", taxTotal: "15.00" },
      lines: [
        expect.objectContaining({ taxTreatment: "standard", taxAmount: "15.00" }),
        expect.objectContaining({ taxTreatment: "zero-rated", taxAmount: "0.00" }),
        expect.objectContaining({ taxTreatment: "exempt", taxAmount: "0.00" }),
      ],
    });
  });

  it("fails atomically when a compatibility rate conflicts with the country pack", async () => {
    const tenant = await signupFinanceTenant("vat-mismatch");
    const customer = await createContact(tenant, "VAT Mismatch Customer");
    const beforeInvoices = await db.select().from(schema.invoices)
      .where(eq(schema.invoices.tenantId, tenant.tenantId));
    await expect(createDraftInvoice({
      tenantId: tenant.tenantId,
      contactId: customer.id,
      currency: "USD",
      createdBy: tenant.userId,
      lines: [{
        description: "Invalid rate",
        quantity: "1",
        unitPrice: "100.00",
        taxTreatment: "standard",
        taxRate: "14.5",
      }],
    })).rejects.toThrow(/does not match/);
    const afterInvoices = await db.select().from(schema.invoices)
      .where(eq(schema.invoices.tenantId, tenant.tenantId));
    expect(afterInvoices).toHaveLength(beforeInvoices.length);
  });

  it("rounds each line tax deterministically to integer cents", async () => {
    const tenant = await signupFinanceTenant("vat-rounding");
    const customer = await createContact(tenant, "VAT Rounding Customer");
    const draft = await createDraftInvoice({
      tenantId: tenant.tenantId,
      contactId: customer.id,
      currency: "USD",
      taxDate: "2026-07-13",
      createdBy: tenant.userId,
      lines: [{ description: "Small taxable item", quantity: "1", unitPrice: "0.05", taxTreatment: "standard" }],
    });
    expect(draft).toMatchObject({ subtotal: "0.05", taxTotal: "0.01", total: "0.06" });
    const [line] = await db.select().from(schema.invoiceLineItems)
      .where(eq(schema.invoiceLineItems.invoiceId, draft.id));
    expect(line.taxAmount).toBe("0.01");
  });

  it("rejects unsupported treatment input at the authenticated API boundary", async () => {
    const tenant = await signupFinanceTenant("vat-api");
    const customer = await createContact(tenant, "VAT API Customer");
    const response = await request(app).post("/api/v1/invoices").set(tenant.auth).send({
      contactId: customer.id,
      currency: "USD",
      lines: [{ description: "Invalid treatment", quantity: "1", unitPrice: "10.00", taxTreatment: "reduced" }],
    });
    expect(response.status).toBe(400);
    const invoices = await db.select().from(schema.invoices)
      .where(eq(schema.invoices.tenantId, tenant.tenantId));
    expect(invoices).toHaveLength(0);
  });

  it("rejects an impossible calendar tax date without persistence", async () => {
    const tenant = await signupFinanceTenant("vat-invalid-date");
    const customer = await createContact(tenant, "Invalid Tax Date Customer");
    await expect(createDraftInvoice({
      tenantId: tenant.tenantId,
      contactId: customer.id,
      currency: "USD",
      taxDate: "2026-02-30",
      createdBy: tenant.userId,
      lines: [{ description: "Invalid date", quantity: "1", unitPrice: "10.00", taxTreatment: "standard" }],
    })).rejects.toThrow(/valid YYYY-MM-DD calendar date/);
    const invoices = await db.select().from(schema.invoices)
      .where(eq(schema.invoices.tenantId, tenant.tenantId));
    expect(invoices).toHaveLength(0);
  });
});
