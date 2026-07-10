import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db, schema } from "../../src/lib.js";
import { createDraftInvoice, issueInvoice } from "../../src/invoicing.js";
import { createContact, signupFinanceTenant } from "./helpers.js";

describe("finance kernel - invoice document snapshots", () => {
  it("captures immutable issuer, customer and invoice render inputs when issued", async () => {
    const tenant = await signupFinanceTenant("invoice-document");
    await db.update(schema.tenants).set({
      companyName: "Snapshot Trading (Private) Limited",
      physicalAddress: "12 Samora Machel Avenue, Harare",
      registrationNumber: "REG-100",
      vatNumber: "VAT-200",
      logoUrl: "https://assets.example.test/vaka-logo.png",
    }).where(eq(schema.tenants.id, tenant.tenantId));
    const customer = await createContact(tenant, "Snapshot Customer", {
      address: "Bulawayo, Zimbabwe",
      taxNumber: "BP-300",
    });
    const draft = await createDraftInvoice({
      tenantId: tenant.tenantId,
      contactId: customer.id,
      currency: "USD",
      dueDate: new Date("2026-08-01T00:00:00.000Z"),
      notes: "Payment due within 14 days.",
      createdBy: tenant.userId,
      lines: [{ description: "Business advisory", quantity: "2", unitPrice: "100.00", taxRate: "15" }],
    });
    const issued = await issueInvoice({ tenantId: tenant.tenantId, invoiceId: draft.id, createdBy: tenant.userId });
    const [snapshot] = await db.select().from(schema.invoiceDocumentSnapshots).where(and(
      eq(schema.invoiceDocumentSnapshots.invoiceId, issued.id),
      eq(schema.invoiceDocumentSnapshots.tenantId, tenant.tenantId),
    ));
    expect(snapshot.templateVersion).toBe("invoice-document-v1");
    expect(snapshot.document).toMatchObject({
      issuer: {
        companyName: "Snapshot Trading (Private) Limited",
        physicalAddress: "12 Samora Machel Avenue, Harare",
        logoUrl: "https://assets.example.test/vaka-logo.png",
      },
      customer: { name: "Snapshot Customer", address: "Bulawayo, Zimbabwe" },
      invoice: {
        id: issued.id,
        number: issued.number,
        status: "ISSUED",
        currency: "USD",
        total: "230.00",
      },
      lines: [expect.objectContaining({ description: "Business advisory", quantity: "2.000", lineTotal: "200.00" })],
    });

    await db.update(schema.tenants).set({ companyName: "Changed Later" })
      .where(eq(schema.tenants.id, tenant.tenantId));
    const [preserved] = await db.select().from(schema.invoiceDocumentSnapshots)
      .where(eq(schema.invoiceDocumentSnapshots.id, snapshot.id));
    expect((preserved.document as { issuer: { companyName: string } }).issuer.companyName)
      .toBe("Snapshot Trading (Private) Limited");
  });
});
