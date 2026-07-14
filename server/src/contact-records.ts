import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { audit, badRequest, conflict, db, forbidden, notFound, schema } from "./lib.js";
import { queuePartyRoleEvents } from "./party-events.js";
import { runWithPostCommitEvents } from "./platform/events/index.js";

const MAX_BULK_RECORDS = 100;

export type ContactBulkAction =
  | { action: "ADD_TAG"; tag: string }
  | { action: "REMOVE_TAG"; tag: string }
  | { action: "MARK_CUSTOMER" }
  | { action: "MARK_VENDOR" };

function exactIds(ids: string[]): string[] {
  const unique = [...new Set(ids)];
  if (!unique.length) throw badRequest("Select at least one contact");
  if (unique.length !== ids.length) throw badRequest("Contact selection contains duplicates");
  if (unique.length > MAX_BULK_RECORDS) throw badRequest(`Select no more than ${MAX_BULK_RECORDS} contacts`);
  return unique;
}

function normalizedTag(value: string): string {
  const tag = value.trim().replace(/\s+/g, " ");
  if (tag.length < 1 || tag.length > 50) throw badRequest("Tag must be between 1 and 50 characters");
  return tag;
}

async function activeContactsForUpdate(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  tenantId: string,
  ids: string[],
) {
  const rows = await tx.select().from(schema.contacts).where(and(
    eq(schema.contacts.tenantId, tenantId),
    inArray(schema.contacts.id, ids),
    isNull(schema.contacts.deletedAt),
  )).for("update");
  if (rows.length !== ids.length) throw notFound("One or more contacts were not found");
  return rows;
}

export async function bulkUpdateContacts(opts: {
  tenantId: string;
  actorUserId: string;
  ids: string[];
  operation: ContactBulkAction;
}) {
  const ids = exactIds(opts.ids);
  return runWithPostCommitEvents((queue) => db.transaction(async (tx) => {
    const contacts = await activeContactsForUpdate(tx, opts.tenantId, ids);
    const tag = "tag" in opts.operation ? normalizedTag(opts.operation.tag) : null;
    for (const contact of contacts) {
      if (opts.operation.action === "ADD_TAG") {
        const tags = [...new Set([...contact.tags, tag!])];
        await tx.update(schema.contacts).set({ tags }).where(eq(schema.contacts.id, contact.id));
      } else if (opts.operation.action === "REMOVE_TAG") {
        await tx.update(schema.contacts).set({ tags: contact.tags.filter((value) => value !== tag) })
          .where(eq(schema.contacts.id, contact.id));
      } else if (opts.operation.action === "MARK_CUSTOMER") {
        await tx.update(schema.contacts).set({ isCustomer: true }).where(eq(schema.contacts.id, contact.id));
      } else {
        await tx.update(schema.contacts).set({ isVendor: true }).where(eq(schema.contacts.id, contact.id));
      }
      queuePartyRoleEvents(queue, {
        tenantId: opts.tenantId,
        actorUserId: opts.actorUserId,
        contactId: contact.id,
        change: "bulk-updated",
        before: contact,
        after: {
          isCustomer: contact.isCustomer || opts.operation.action === "MARK_CUSTOMER",
          isVendor: contact.isVendor || opts.operation.action === "MARK_VENDOR",
        },
      });
    }
    await audit(tx, opts.tenantId, opts.actorUserId, "contact.bulk_updated", "contact_batch", undefined, {
      action: opts.operation.action,
      count: contacts.length,
      ...(tag ? { tag } : {}),
    });
    return { updated: contacts.length };
  }));
}

async function softRemoveContacts(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  opts: { tenantId: string; actorUserId: string; ids: string[]; reason: string; requestId?: string },
) {
  const contacts = await activeContactsForUpdate(tx, opts.tenantId, opts.ids);
  const removedAt = new Date();
  await tx.update(schema.contacts).set({ deletedAt: removedAt, deletedBy: opts.actorUserId }).where(and(
    eq(schema.contacts.tenantId, opts.tenantId),
    inArray(schema.contacts.id, opts.ids),
    isNull(schema.contacts.deletedAt),
  ));
  for (const contact of contacts) {
    await audit(tx, opts.tenantId, opts.actorUserId, "contact.removed", "contact", contact.id, {
      reason: opts.reason,
      ...(opts.requestId ? { deletionRequestId: opts.requestId } : {}),
    });
  }
  return contacts;
}

export async function deleteOrRequestContacts(opts: {
  tenantId: string;
  actorUserId: string;
  isTenantOwner: boolean;
  ids: string[];
  reason: string;
}) {
  const ids = exactIds(opts.ids);
  const reason = opts.reason.trim();
  if (reason.length < 3 || reason.length > 500) throw badRequest("Reason must be between 3 and 500 characters");
  return runWithPostCommitEvents((queue) => db.transaction(async (tx) => {
    const contacts = await activeContactsForUpdate(tx, opts.tenantId, ids);
    if (opts.isTenantOwner) {
      await softRemoveContacts(tx, { ...opts, ids, reason });
      const pendingRequests = await tx.select().from(schema.recordDeletionRequests).where(and(
        eq(schema.recordDeletionRequests.tenantId, opts.tenantId),
        eq(schema.recordDeletionRequests.entityType, "contact"),
        inArray(schema.recordDeletionRequests.entityId, ids),
        eq(schema.recordDeletionRequests.status, "PENDING"),
      )).for("update");
      await tx.update(schema.recordDeletionRequests).set({
        status: "APPROVED", decidedBy: opts.actorUserId, decisionReason: reason, decidedAt: new Date(),
      }).where(and(
        eq(schema.recordDeletionRequests.tenantId, opts.tenantId),
        eq(schema.recordDeletionRequests.entityType, "contact"),
        inArray(schema.recordDeletionRequests.entityId, ids),
        eq(schema.recordDeletionRequests.status, "PENDING"),
      ));
      for (const request of pendingRequests) {
        await audit(tx, opts.tenantId, opts.actorUserId, "contact.deletion_approved", "deletion_request", request.id, {
          contactId: request.entityId,
        });
      }
      for (const contact of contacts) queuePartyRoleEvents(queue, {
        tenantId: opts.tenantId, actorUserId: opts.actorUserId, contactId: contact.id,
        change: "removed", before: contact, after: null,
      });
      return { outcome: "REMOVED" as const, count: contacts.length };
    }

    const existing = await tx.select({ entityId: schema.recordDeletionRequests.entityId })
      .from(schema.recordDeletionRequests).where(and(
        eq(schema.recordDeletionRequests.tenantId, opts.tenantId),
        eq(schema.recordDeletionRequests.entityType, "contact"),
        inArray(schema.recordDeletionRequests.entityId, ids),
        eq(schema.recordDeletionRequests.status, "PENDING"),
      ));
    if (existing.length) throw conflict("A deletion request is already pending for one or more selected contacts");
    const requests = await tx.insert(schema.recordDeletionRequests).values(contacts.map((contact) => ({
      tenantId: opts.tenantId,
      entityType: "contact",
      entityId: contact.id,
      requestedBy: opts.actorUserId,
      reason,
    }))).returning();
    for (const request of requests) {
      await audit(tx, opts.tenantId, opts.actorUserId, "contact.deletion_requested", "deletion_request", request.id, {
        contactId: request.entityId,
      });
    }
    return { outcome: "REQUESTED" as const, count: requests.length };
  }));
}

export async function listContactDeletionRequests(opts: {
  tenantId: string;
  actorUserId: string;
  isTenantOwner: boolean;
}) {
  const visibility = opts.isTenantOwner
    ? eq(schema.recordDeletionRequests.status, "PENDING")
    : eq(schema.recordDeletionRequests.requestedBy, opts.actorUserId);
  return db.select({
    id: schema.recordDeletionRequests.id,
    entityId: schema.recordDeletionRequests.entityId,
    contactName: schema.contacts.name,
    requestedBy: schema.recordDeletionRequests.requestedBy,
    requesterName: schema.users.fullName,
    reason: schema.recordDeletionRequests.reason,
    status: schema.recordDeletionRequests.status,
    decisionReason: schema.recordDeletionRequests.decisionReason,
    createdAt: schema.recordDeletionRequests.createdAt,
    decidedAt: schema.recordDeletionRequests.decidedAt,
  }).from(schema.recordDeletionRequests)
    .innerJoin(schema.contacts, and(
      eq(schema.contacts.id, schema.recordDeletionRequests.entityId),
      eq(schema.contacts.tenantId, opts.tenantId),
    ))
    .innerJoin(schema.users, eq(schema.users.id, schema.recordDeletionRequests.requestedBy))
    .where(and(
      eq(schema.recordDeletionRequests.tenantId, opts.tenantId),
      eq(schema.recordDeletionRequests.entityType, "contact"),
      visibility,
    )).orderBy(desc(schema.recordDeletionRequests.createdAt)).limit(200);
}

export async function decideContactDeletionRequest(opts: {
  tenantId: string;
  actorUserId: string;
  isTenantOwner: boolean;
  requestId: string;
  decision: "APPROVE" | "REJECT";
  reason: string;
}) {
  if (!opts.isTenantOwner) throw forbidden("Principal account owner approval required");
  const reason = opts.reason.trim();
  if (reason.length < 3 || reason.length > 500) throw badRequest("Decision reason must be between 3 and 500 characters");
  return runWithPostCommitEvents((queue) => db.transaction(async (tx) => {
    const [request] = await tx.select().from(schema.recordDeletionRequests).where(and(
      eq(schema.recordDeletionRequests.id, opts.requestId),
      eq(schema.recordDeletionRequests.tenantId, opts.tenantId),
      eq(schema.recordDeletionRequests.entityType, "contact"),
    )).for("update");
    if (!request) throw notFound("Deletion request not found");
    if (request.status !== "PENDING") throw conflict("Deletion request has already been decided");

    if (opts.decision === "APPROVE") {
      await softRemoveContacts(tx, {
        tenantId: opts.tenantId,
        actorUserId: opts.actorUserId,
        ids: [request.entityId],
        reason,
        requestId: request.id,
      });
      const [removed] = await tx.select().from(schema.contacts).where(and(
        eq(schema.contacts.id, request.entityId), eq(schema.contacts.tenantId, opts.tenantId),
      ));
      queuePartyRoleEvents(queue, {
        tenantId: opts.tenantId, actorUserId: opts.actorUserId, contactId: request.entityId,
        change: "removed", before: removed ?? null, after: null,
      });
    }
    const status = opts.decision === "APPROVE" ? "APPROVED" : "REJECTED";
    await tx.update(schema.recordDeletionRequests).set({
      status,
      decidedBy: opts.actorUserId,
      decisionReason: reason,
      decidedAt: new Date(),
    }).where(eq(schema.recordDeletionRequests.id, request.id));
    await audit(tx, opts.tenantId, opts.actorUserId, `contact.deletion_${status.toLowerCase()}`, "deletion_request", request.id, {
      contactId: request.entityId,
    });
    return { id: request.id, status };
  }));
}
