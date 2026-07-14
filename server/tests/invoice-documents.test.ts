import { describe, expect, it } from "vitest";
import { renderInvoicePdf, type InvoiceSnapshotDocument } from "../src/invoice-documents.js";

function sampleDocument(lineCount = 1): InvoiceSnapshotDocument {
  return {
    issuer: {
      companyName: "VAKA Example Trading (Private) Limited",
      logoUrl: null,
      brandPrimaryColor: "#14243A",
      brandSecondaryColor: "#A17812",
      physicalAddress: "18 Enterprise Avenue\nHarare\nZimbabwe",
      registrationNumber: "1234/2024",
      taxNumber: "BP-100200",
      vatNumber: "VAT-300400",
      paymentTerms: "Payment is due within 14 days. Quote the invoice number with your transfer.",
      bankDetails: {
        bankName: "Example Bank Zimbabwe",
        accountName: "VAKA Example Trading",
        accountNumber: "0102030405",
        branch: "Harare Corporate",
        swiftCode: "EXAMZWHX",
        currency: "USD",
      },
    },
    customer: {
      name: "Customer Holdings Limited",
      address: "44 Customer Road\nBulawayo\nZimbabwe",
      registrationNumber: "5678/2020",
      taxNumber: "BP-555000",
    },
    invoice: {
      number: "INV-00042",
      issueDate: "2026-07-14T00:00:00.000Z",
      dueDate: "2026-07-28T00:00:00.000Z",
      currency: "USD",
      taxJurisdiction: "ZW",
      taxDate: "2026-07-14",
      taxTreatment: "standard",
      subtotal: String(lineCount * 100) + ".00",
      taxTotal: String(lineCount * 15) + ".00",
      total: String(lineCount * 115) + ".00",
      notes: "Thank you for your business. Services supplied under the agreed engagement.",
    },
    lines: Array.from({ length: lineCount }, (_, index) => ({
      description: `Professional service package ${index + 1} with a deliberately descriptive line label for wrapping`,
      quantity: "1.000",
      unitPrice: "100.00",
      taxRate: "15.00",
      taxTreatment: "standard",
      taxAmount: "15.00",
      lineTotal: "100.00",
    })),
  };
}

describe("enterprise invoice PDF renderer", () => {
  it("renders a professional A4 invoice with parties, remittance, terms and attribution", () => {
    const pdf = renderInvoicePdf(sampleDocument());
    const source = pdf.toString("latin1");
    expect(pdf.subarray(0, 8).toString("latin1")).toBe("%PDF-1.4");
    expect(source).toContain("/MediaBox [0 0 595 842]");
    expect(source).toContain("INVOICE");
    expect(source).toContain("BILL TO");
    expect(source).toContain("Example Bank Zimbabwe");
    expect(source).toContain("Payment is due within 14 days");
    expect(source).toContain("Powered by VAKA OS  |  www.vakaos.com");
    expect(source).toContain("Page 1 of 1");
  });

  it("paginates long invoices, repeats document context and numbers every page", () => {
    const source = renderInvoicePdf(sampleDocument(40)).toString("latin1");
    const pageCount = Number(/\/Type \/Pages \/Kids \[[^\]]+\] \/Count (\d+)/.exec(source)?.[1]);
    expect(pageCount).toBeGreaterThan(1);
    expect(source).toContain("Line items continued");
    expect(source).toContain(`Page ${pageCount} of ${pageCount}`);
    expect(source.match(/Powered by VAKA OS  \|  www\.vakaos\.com/g)).toHaveLength(pageCount);
  });

  it("renders safely when optional company document settings are absent", () => {
    const document = sampleDocument();
    document.issuer.physicalAddress = null;
    document.issuer.registrationNumber = null;
    document.issuer.taxNumber = null;
    document.issuer.vatNumber = null;
    document.issuer.paymentTerms = null;
    document.issuer.bankDetails = null;
    document.customer.address = null;
    const source = renderInvoicePdf(document).toString("latin1");
    expect(source).toContain("Payment reference: INV-00042");
    expect(source).toContain("Payment due by 28 Jul 2026");
    expect(source).not.toContain("undefined");
    expect(source).not.toContain("null");
  });
});
