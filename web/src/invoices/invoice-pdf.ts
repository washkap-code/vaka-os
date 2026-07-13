export class InvalidInvoicePdfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidInvoicePdfError";
  }
}

type FetchInvoicePdf = typeof fetch;

export async function fetchInvoicePdf(
  invoiceId: string,
  token: string | null,
  fetcher: FetchInvoicePdf = fetch,
): Promise<Blob> {
  const response = await fetcher(`/api/v1/invoices/${encodeURIComponent(invoiceId)}/pdf`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!response.ok) {
    const error = contentType.includes("application/json")
      ? await response.json().catch(() => ({})) as { message?: string }
      : {};
    throw new InvalidInvoicePdfError(error.message ?? "Invoice PDF download failed.");
  }
  if (!contentType.includes("application/pdf")) {
    throw new InvalidInvoicePdfError("The invoice document response was not a PDF.");
  }
  const bytes = await response.arrayBuffer();
  const signature = new TextDecoder("ascii").decode(bytes.slice(0, 5));
  if (signature !== "%PDF-") {
    throw new InvalidInvoicePdfError("The invoice document was incomplete or invalid.");
  }
  return new Blob([bytes], { type: "application/pdf" });
}

export function invoicePdfFilename(number: string | null, fallbackId: string): string {
  const identifier = (number ?? fallbackId).replace(/[^A-Za-z0-9._-]/g, "-");
  return `invoice-${identifier}.pdf`;
}
