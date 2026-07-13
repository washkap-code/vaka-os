import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db, schema } from "../../src/lib.js";
import { createDraftInvoice, issueInvoice } from "../../src/invoicing.js";
import { createContact, signupFinanceTenant } from "./helpers.js";
import request from "supertest";
import { createApp } from "../../src/app.js";

const app = createApp();

describe("finance kernel - invoice document snapshots", () => {
  it("captures immutable issuer, customer and invoice render inputs when issued", async () => {
    const tenant = await signupFinanceTenant("invoice-document");
    const logo = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
    await db.update(schema.tenants).set({
      companyName: "Snapshot Trading (Private) Limited",
      physicalAddress: "12 Samora Machel Avenue, Harare",
      registrationNumber: "REG-100",
      vatNumber: "VAT-200",
      logoUrl: logo,
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
    expect(snapshot.templateVersion).toBe("invoice-document-v2");
    expect(snapshot.document).toMatchObject({
      issuer: {
        companyName: "Snapshot Trading (Private) Limited",
        physicalAddress: "12 Samora Machel Avenue, Harare",
        logoUrl: logo,
      },
      customer: { name: "Snapshot Customer", address: "Bulawayo, Zimbabwe" },
      invoice: {
        id: issued.id,
        number: issued.number,
        status: "ISSUED",
        currency: "USD",
        taxJurisdiction: "ZW",
        taxTreatment: "standard",
        total: "230.00",
      },
      lines: [expect.objectContaining({
        description: "Business advisory",
        quantity: "2.000",
        taxTreatment: "standard",
        taxAmount: "30.00",
        lineTotal: "200.00",
      })],
    });

    await db.update(schema.tenants).set({ companyName: "Changed Later" })
      .where(eq(schema.tenants.id, tenant.tenantId));
    const [preserved] = await db.select().from(schema.invoiceDocumentSnapshots)
      .where(eq(schema.invoiceDocumentSnapshots.id, snapshot.id));
    expect((preserved.document as { issuer: { companyName: string } }).issuer.companyName)
      .toBe("Snapshot Trading (Private) Limited");

    const pdf = await request(app).get(`/api/v1/invoices/${issued.id}/pdf`).set(tenant.auth);
    expect(pdf.status).toBe(200);
    expect(pdf.headers["content-type"]).toContain("application/pdf");
    expect(pdf.headers["cache-control"]).toBe("private, no-store");
    expect(pdf.headers["x-content-type-options"]).toBe("nosniff");
    expect(Number(pdf.headers["content-length"])).toBe(pdf.body.byteLength);
    expect(pdf.body.subarray(0, 8).toString()).toBe("%PDF-1.4");
    expect(pdf.body.toString("latin1")).toContain("/Subtype /Image");
    expect(pdf.body.toString("latin1")).toContain("/Im1 Do");
    expect(pdf.body.toString("latin1")).toContain("VAT treatment: standard");
    expect(pdf.body.toString("latin1")).toContain("VAT: standard at 15.00% = USD 30.00");
    expect(pdf.body.toString("latin1")).toContain("Powered by VAKA OS  |  www.vakaos.com");

    const share = await request(app).post(`/api/v1/invoices/${issued.id}/share-links`).set(tenant.auth)
      .send({ expiresInDays: 7 });
    expect(share.status).toBe(200);
    expect(share.body.publicPath).toMatch(/^\/api\/v1\/public\/invoices\/[A-Za-z0-9_-]{43}\/pdf$/);
    const links = await request(app).get(`/api/v1/invoices/${issued.id}/share-links`).set(tenant.auth);
    expect(links.status).toBe(200);
    expect(links.body).toHaveLength(1);
    expect(links.body[0]).toMatchObject({ id: share.body.id, revokedAt: null, viewedAt: null });
    expect(links.body[0]).not.toHaveProperty("tokenHash");
    const publicPdf = await request(app).get(share.body.publicPath);
    expect(publicPdf.status).toBe(200);
    expect(publicPdf.body.subarray(0, 8).toString()).toBe("%PDF-1.4");
    expect(publicPdf.body.toString("latin1")).toContain("Powered by VAKA OS  |  www.vakaos.com");
    const revoked = await request(app).delete(`/api/v1/invoices/${issued.id}/share-links/${share.body.id}`).set(tenant.auth);
    expect(revoked.status).toBe(200);
    const unavailable = await request(app).get(share.body.publicPath);
    expect(unavailable.status).toBe(404);

    const other = await signupFinanceTenant("invoice-document-other");
    const denied = await request(app).get(`/api/v1/invoices/${issued.id}/pdf`).set(other.auth);
    expect(denied.status).toBe(404);
    const linksDenied = await request(app).get(`/api/v1/invoices/${issued.id}/share-links`).set(other.auth);
    expect(linksDenied.status).toBe(404);
  });
});
