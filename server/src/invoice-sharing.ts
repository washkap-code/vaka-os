import { and, eq, gt, isNull } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { audit, conflict, db, notFound, schema } from "./lib.js";
import { getInvoicePdf } from "./invoice-documents.js";

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createInvoiceShareLink(opts: {
  tenantId: string;
  invoiceId: string;
  actorUserId: string;
  expiresInDays: number;
}) {
  const expiresAt = new Date(Date.now() + opts.expiresInDays * 86_400_000);
  return db.transaction(async (tx) => {
    const [invoice] = await tx.select().from(schema.invoices).where(and(
      eq(schema.invoices.id, opts.invoiceId),
      eq(schema.invoices.tenantId, opts.tenantId),
    ));
    if (!invoice || !["ISSUED", "PARTIAL", "PAID"].includes(invoice.status)) {
      throw notFound("Issued invoice not found");
    }
    const [snapshot] = await tx.select({ id: schema.invoiceDocumentSnapshots.id })
      .from(schema.invoiceDocumentSnapshots).where(and(
        eq(schema.invoiceDocumentSnapshots.invoiceId, invoice.id),
        eq(schema.invoiceDocumentSnapshots.tenantId, opts.tenantId),
      ));
    if (!snapshot) throw conflict("Issued invoice document is not available");
    const token = randomBytes(32).toString("base64url");
    const [link] = await tx.insert(schema.invoiceShareLinks).values({
      tenantId: opts.tenantId,
      invoiceId: invoice.id,
      tokenHash: hashToken(token),
      expiresAt,
      createdBy: opts.actorUserId,
    }).returning();
    await audit(tx, opts.tenantId, opts.actorUserId, "invoice.share_link_created", "invoice", invoice.id, {
      shareLinkId: link.id,
      expiresAt: expiresAt.toISOString(),
    });
    return { id: link.id, expiresAt, publicPath: `/api/v1/public/invoices/${token}/pdf` };
  });
}

export async function revokeInvoiceShareLink(opts: { tenantId: string; invoiceId: string; shareLinkId: string; actorUserId: string }) {
  return db.transaction(async (tx) => {
    const [link] = await tx.update(schema.invoiceShareLinks).set({ revokedAt: new Date() }).where(and(
      eq(schema.invoiceShareLinks.id, opts.shareLinkId),
      eq(schema.invoiceShareLinks.invoiceId, opts.invoiceId),
      eq(schema.invoiceShareLinks.tenantId, opts.tenantId),
      isNull(schema.invoiceShareLinks.revokedAt),
    )).returning();
    if (!link) throw notFound("Invoice share link not found");
    await audit(tx, opts.tenantId, opts.actorUserId, "invoice.share_link_revoked", "invoice", opts.invoiceId, { shareLinkId: link.id });
    return { id: link.id, revokedAt: link.revokedAt };
  });
}

export async function openInvoiceShareLink(token: string) {
  const [link] = await db.select().from(schema.invoiceShareLinks).where(and(
    eq(schema.invoiceShareLinks.tokenHash, hashToken(token)),
    isNull(schema.invoiceShareLinks.revokedAt),
    gt(schema.invoiceShareLinks.expiresAt, new Date()),
  ));
  if (!link) throw notFound("Shared invoice is unavailable");
  const pdf = await getInvoicePdf(link.tenantId, link.invoiceId);
  await db.transaction(async (tx) => {
    await tx.update(schema.invoiceShareLinks).set({ viewedAt: new Date() })
      .where(eq(schema.invoiceShareLinks.id, link.id));
    await audit(tx, link.tenantId, null, "invoice.share_link_opened", "invoice", link.invoiceId, { shareLinkId: link.id });
  });
  return pdf;
}
