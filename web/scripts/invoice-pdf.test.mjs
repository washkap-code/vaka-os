import assert from "node:assert/strict";
import test from "node:test";
import { fetchInvoicePdf, invoicePdfFilename, InvalidInvoicePdfError } from "../src/invoices/invoice-pdf.ts";

const pdfBytes = new TextEncoder().encode("%PDF-1.4\nvalid-test-document");

test("accepts only a successful PDF response with a PDF signature", async () => {
  const blob = await fetchInvoicePdf("invoice-one", "token", async (_input, init) => {
    assert.equal(init?.headers?.Authorization, "Bearer token");
    return new Response(pdfBytes, { headers: { "Content-Type": "application/pdf" } });
  });
  assert.equal(blob.type, "application/pdf");
  assert.equal(await blob.text(), "%PDF-1.4\nvalid-test-document");
});

test("rejects successful HTML and malformed PDF payloads", async () => {
  await assert.rejects(
    fetchInvoicePdf("invoice-one", null, async () => new Response("<html>error</html>", { headers: { "Content-Type": "text/html" } })),
    InvalidInvoicePdfError,
  );
  await assert.rejects(
    fetchInvoicePdf("invoice-one", null, async () => new Response("not-pdf", { headers: { "Content-Type": "application/pdf" } })),
    /incomplete or invalid/,
  );
});

test("preserves safe invoice numbers and sanitises unsafe filename characters", () => {
  assert.equal(invoicePdfFilename("INV-00001", "fallback"), "invoice-INV-00001.pdf");
  assert.equal(invoicePdfFilename("INV/unsafe value", "fallback"), "invoice-INV-unsafe-value.pdf");
});
