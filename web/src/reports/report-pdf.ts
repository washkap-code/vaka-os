export class InvalidReportPdfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidReportPdfError";
  }
}

type FetchReportPdf = typeof fetch;

export async function fetchReportPdf(
  path: string,
  token: string | null,
  fetcher: FetchReportPdf = fetch,
): Promise<Blob> {
  const route = path.split("?", 1)[0];
  if (!route.startsWith("/reports/") || !route.endsWith(".pdf") || path.includes("..")) {
    throw new InvalidReportPdfError("The report document path is invalid.");
  }
  const response = await fetcher(`/api/v1${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!response.ok) {
    const error = contentType.includes("application/json")
      ? await response.json().catch(() => ({})) as { message?: string }
      : {};
    throw new InvalidReportPdfError(error.message ?? "Report PDF generation failed.");
  }
  if (!contentType.includes("application/pdf")) {
    throw new InvalidReportPdfError("The report response was not a PDF.");
  }
  const bytes = await response.arrayBuffer();
  const signature = new TextDecoder("ascii").decode(bytes.slice(0, 5));
  if (signature !== "%PDF-") {
    throw new InvalidReportPdfError("The report document was incomplete or invalid.");
  }
  return new Blob([bytes], { type: "application/pdf" });
}

export function reportPdfFilename(kind: "vat" | "management-accounts", from: string, to: string): string {
  const safeDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "selected-period";
  return `${kind}-technical-preview-${safeDate(from)}-${safeDate(to)}.pdf`;
}
