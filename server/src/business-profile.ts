// PN-003 directory enquiries remain here while P10-001 moves profile and
// directory ownership into server/src/modules/network.
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { audit, badRequest, conflict, db, notFound, schema } from "./lib.js";
import { autoAuditContactRoles } from "./universal-audit.js";

const ENQUIRIES_PER_DAY = 10;

export const enquirySchema = z.object({
  message: z.string().trim().min(5).max(2000),
  replyEmail: z.string().trim().email().max(200).optional(),
});

export async function sendEnquiry(opts: {
  senderTenantId: string;
  senderUserId: string;
  profileId: string;
  message: string;
  replyEmail?: string;
}) {
  const [target] = await db.select().from(schema.businessProfiles)
    .where(eq(schema.businessProfiles.id, opts.profileId));
  if (!target || target.status !== "published" || target.visibility !== "public" || !target.publishedSnapshot) {
    throw notFound("Business profile not found");
  }
  if (target.tenantId === opts.senderTenantId) {
    throw badRequest("You cannot send an enquiry to your own business");
  }
  const snapshot = target.publishedSnapshot as { acceptEnquiries?: boolean };
  if (snapshot.acceptEnquiries !== true) {
    throw conflict("This business does not accept enquiries through the directory");
  }
  const [{ todayCount }] = await db.select({
    todayCount: sql<number>`count(*)::int`,
  }).from(schema.directoryEnquiries).where(and(
    eq(schema.directoryEnquiries.fromTenantId, opts.senderTenantId),
    sql`${schema.directoryEnquiries.createdAt} > now() - interval '1 day'`,
  ));
  if (todayCount >= ENQUIRIES_PER_DAY) {
    throw conflict("Daily directory enquiry limit reached — try again tomorrow");
  }
  const [sender] = await db.select({ companyName: schema.tenants.companyName })
    .from(schema.tenants).where(eq(schema.tenants.id, opts.senderTenantId));
  if (!sender) throw notFound("Company not found");
  return db.transaction(async (tx) => {
    const [enquiry] = await tx.insert(schema.directoryEnquiries).values({
      tenantId: target.tenantId,
      profileId: target.id,
      fromTenantId: opts.senderTenantId,
      fromUserId: opts.senderUserId,
      senderBusiness: sender.companyName,
      replyEmail: opts.replyEmail ?? null,
      message: opts.message,
    }).returning();
    await audit(tx, opts.senderTenantId, opts.senderUserId,
      "directory.enquiry_sent", "directory_enquiry", enquiry.id, { profileId: target.id });
    await audit(tx, target.tenantId, null,
      "directory.enquiry_received", "directory_enquiry", enquiry.id, {
        senderBusiness: sender.companyName,
      });
    return { id: enquiry.id, status: enquiry.status, createdAt: enquiry.createdAt };
  });
}

export async function listEnquiries(tenantId: string) {
  return db.select().from(schema.directoryEnquiries)
    .where(eq(schema.directoryEnquiries.tenantId, tenantId))
    .orderBy(desc(schema.directoryEnquiries.createdAt)).limit(200);
}

export async function resolveEnquiry(opts: {
  tenantId: string;
  userId: string;
  enquiryId: string;
  action: "convert" | "dismiss";
}) {
  return db.transaction(async (tx) => {
    const [enquiry] = await tx.select().from(schema.directoryEnquiries).where(and(
      eq(schema.directoryEnquiries.id, opts.enquiryId),
      eq(schema.directoryEnquiries.tenantId, opts.tenantId),
    )).for("update");
    if (!enquiry) throw notFound("Enquiry not found");
    if (enquiry.status !== "NEW") throw conflict("Enquiry has already been handled");
    let contactId: string | null = null;
    if (opts.action === "convert") {
      const [contact] = await tx.insert(schema.contacts).values({
        tenantId: opts.tenantId,
        ownerUserId: opts.userId,
        type: "COMPANY",
        name: enquiry.senderBusiness,
        email: enquiry.replyEmail,
        isCustomer: true,
        isVendor: false,
        tags: ["directory-lead"],
      }).returning();
      contactId = contact.id;
      await autoAuditContactRoles(tx, {
        tenantId: opts.tenantId,
        actorId: opts.userId,
        action: "created",
        objectId: contact.id,
        before: null,
        after: contact,
      });
    }
    const [updated] = await tx.update(schema.directoryEnquiries).set({
      status: opts.action === "convert" ? "CONVERTED" : "DISMISSED",
      contactId,
      updatedAt: new Date(),
    }).where(eq(schema.directoryEnquiries.id, enquiry.id)).returning();
    await audit(tx, opts.tenantId, opts.userId,
      opts.action === "convert" ? "directory.enquiry_converted" : "directory.enquiry_dismissed",
      "directory_enquiry", enquiry.id, { contactId });
    return updated;
  });
}
