import assert from "node:assert/strict";
import test from "node:test";
import { fetchReportPdf, InvalidReportPdfError, reportPdfFilename } from "../src/reports/report-pdf.ts";

const pdfBytes = new TextEncoder().encode("%PDF-1.4\nvalidated-finance-report");

test("accepts only an authenticated successful PDF with a PDF signature", async () => {
  const blob = await fetchReportPdf("/reports/vat.pdf?from=2026-01-01&to=2026-01-31", "token", async (input, init) => {
    assert.equal(input, "/api/v1/reports/vat.pdf?from=2026-01-01&to=2026-01-31");
    assert.equal(init?.headers?.Authorization, "Bearer token");
    return new Response(pdfBytes, { headers: { "Content-Type": "application/pdf; charset=binary" } });
  });
  assert.equal(blob.type, "application/pdf");
  assert.equal(await blob.text(), "%PDF-1.4\nvalidated-finance-report");
});

test("rejects unsafe paths, HTML and malformed PDF payloads", async () => {
  await assert.rejects(fetchReportPdf("/invoices/one.pdf", null), InvalidReportPdfError);
  await assert.rejects(fetchReportPdf("/reports/../secret.pdf", null), InvalidReportPdfError);
  await assert.rejects(
    fetchReportPdf("/reports/vat.pdf", null, async () => new Response("<html>error</html>", { headers: { "Content-Type": "text/html" } })),
    /not a PDF/,
  );
  await assert.rejects(
    fetchReportPdf("/reports/vat.pdf", null, async () => new Response("not-pdf", { headers: { "Content-Type": "application/pdf" } })),
    /incomplete or invalid/,
  );
});

test("uses deterministic bounded report filenames", () => {
  assert.equal(reportPdfFilename("vat", "2026-01-01", "2026-01-31"), "vat-technical-preview-2026-01-01-2026-01-31.pdf");
  assert.equal(reportPdfFilename("management-accounts", "unsafe", "date"), "management-accounts-technical-preview-selected-period-selected-period.pdf");
});
