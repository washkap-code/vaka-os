import { db, notFound, schema } from "./lib.js";
import { and, eq } from "drizzle-orm";

type SnapshotDocument = {
  issuer: { companyName: string; physicalAddress: string | null; registrationNumber: string | null; taxNumber: string | null; vatNumber: string | null };
  customer: { name: string; address: string | null; taxNumber: string | null };
  invoice: { number: string | null; issueDate: string; dueDate: string | null; currency: string; subtotal: string; taxTotal: string; total: string; notes: string | null };
  lines: Array<{ description: string; quantity: string; unitPrice: string; taxRate: string; lineTotal: string }>;
};

function escapePdfText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)").replace(/[\r\n]/g, " ");
}

function makePdf(document: SnapshotDocument): Buffer {
  const lines: string[] = [];
  const add = (text: string, size = 10) => {
    const y = 760 - lines.length * 18;
    lines.push(`BT /F1 ${size} Tf 40 ${y} Td (${escapePdfText(text)}) Tj ET`);
  };
  add(document.issuer.companyName, 18);
  add("VAKA invoice", 11);
  add(`Invoice: ${document.invoice.number ?? "Issued invoice"}`);
  add(`Issued: ${document.invoice.issueDate.slice(0, 10)}    Due: ${document.invoice.dueDate?.slice(0, 10) ?? "—"}`);
  add(`Customer: ${document.customer.name}`);
  if (document.customer.address) add(document.customer.address);
  add(" ");
  add("Description                         Qty       Unit price       Total", 9);
  for (const line of document.lines) {
    add(`${line.description}    ${line.quantity}    ${document.invoice.currency} ${line.unitPrice}    ${document.invoice.currency} ${line.lineTotal}`, 9);
  }
  add(" ");
  add(`Subtotal: ${document.invoice.currency} ${document.invoice.subtotal}`);
  add(`Tax: ${document.invoice.currency} ${document.invoice.taxTotal}`);
  add(`Total: ${document.invoice.currency} ${document.invoice.total}`, 13);
  if (document.invoice.notes) add(`Notes: ${document.invoice.notes}`);
  add("Generated from the issued VAKA invoice record.", 8);

  const content = lines.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n${content}\nendstream`,
  ];
  let output = "%PDF-1.4\n%\xFF\xFF\xFF\xFF\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(output, "utf8"));
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(output, "utf8");
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index++) output += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(output, "utf8");
}

export async function getInvoicePdf(tenantId: string, invoiceId: string) {
  const [snapshot] = await db.select().from(schema.invoiceDocumentSnapshots).where(and(
    eq(schema.invoiceDocumentSnapshots.tenantId, tenantId),
    eq(schema.invoiceDocumentSnapshots.invoiceId, invoiceId),
  ));
  if (!snapshot) throw notFound("Issued invoice document is not available");
  return {
    invoiceId,
    templateVersion: snapshot.templateVersion,
    pdf: makePdf(snapshot.document as SnapshotDocument),
  };
}
