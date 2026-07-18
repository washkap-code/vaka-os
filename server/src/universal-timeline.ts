import { and, desc, eq, or, sql } from "drizzle-orm";
import {
  badRequest, db, forbidden, notFound, schema, type Permission,
} from "./lib.js";
import { CANONICAL_OBJECT_DEFINITIONS } from "./platform/metadata/definitions.js";
import type { ObjectDefinition } from "./platform/metadata/types.js";
import {
  UNIVERSAL_AUDIT_OBJECTS, type UniversalAuditObjectType,
} from "./universal-audit.js";

export interface UniversalTimelineQuery {
  page: number;
  pageSize: number;
}

export interface UniversalTimelineEntry {
  id: string;
  kind: "audit" | "event" | "workflow" | "notification" | "mail";
  action: string;
  actorId: string | null;
  occurredAt: Date;
  details: Record<string, unknown>;
}

const objectDefinitions = new Map<string, ObjectDefinition>(
  CANONICAL_OBJECT_DEFINITIONS.map((definition) => [definition.name.toLowerCase(), definition]),
);

const readPermissions: Record<UniversalAuditObjectType, Permission | null> = {
  Customer: "crm.read",
  Supplier: "inventory.read",
  Invoice: "accounting.read",
  Payment: "accounting.read",
  Product: "inventory.read",
  Employee: "payroll.read",
  Company: "settings.manage",
  User: "users.manage",
};

export function resolveUniversalObjectType(value: string): UniversalAuditObjectType {
  const objectType = UNIVERSAL_AUDIT_OBJECTS.find((candidate) =>
    candidate.toLowerCase() === value.trim().toLowerCase());
  if (!objectType) throw badRequest("Unknown canonical object type");
  return objectType;
}

export function assertUniversalTimelinePermission(
  objectType: UniversalAuditObjectType,
  permissions: readonly string[],
): void {
  const permission = readPermissions[objectType];
  if (permission && !permissions.includes(permission)) {
    throw forbidden(`Missing permission: ${permission}`);
  }
  // Financial object history is never returned under a broader operational
  // permission. accounting.read is the explicit detail boundary.
  if ((objectType === "Invoice" || objectType === "Payment")
    && !permissions.includes("accounting.read")) {
    throw forbidden("Missing permission: accounting.read");
  }
}

async function assertObjectExists(
  tenantId: string,
  objectType: UniversalAuditObjectType,
  objectId: string,
): Promise<void> {
  let exists: { id: string } | undefined;
  if (objectType === "Company") {
    [exists] = await db.select({ id: schema.tenants.id }).from(schema.tenants).where(and(
      eq(schema.tenants.id, tenantId), eq(schema.tenants.id, objectId),
    ));
  } else if (objectType === "Customer") {
    [exists] = await db.select({ id: schema.contacts.id }).from(schema.contacts).where(and(
      eq(schema.contacts.tenantId, tenantId), eq(schema.contacts.id, objectId),
      eq(schema.contacts.isCustomer, true),
    ));
  } else if (objectType === "Supplier") {
    [exists] = await db.select({ id: schema.contacts.id }).from(schema.contacts).where(and(
      eq(schema.contacts.tenantId, tenantId), eq(schema.contacts.id, objectId),
      eq(schema.contacts.isVendor, true),
    ));
  } else if (objectType === "Invoice") {
    [exists] = await db.select({ id: schema.invoices.id }).from(schema.invoices).where(and(
      eq(schema.invoices.tenantId, tenantId), eq(schema.invoices.id, objectId),
    ));
  } else if (objectType === "Payment") {
    [exists] = await db.select({ id: schema.payments.id }).from(schema.payments).where(and(
      eq(schema.payments.tenantId, tenantId), eq(schema.payments.id, objectId),
    ));
  } else if (objectType === "Product") {
    [exists] = await db.select({ id: schema.products.id }).from(schema.products).where(and(
      eq(schema.products.tenantId, tenantId), eq(schema.products.id, objectId),
    ));
  } else if (objectType === "Employee") {
    [exists] = await db.select({ id: schema.employees.id }).from(schema.employees).where(and(
      eq(schema.employees.tenantId, tenantId), eq(schema.employees.id, objectId),
    ));
  } else {
    [exists] = await db.select({ id: schema.users.id }).from(schema.users).where(and(
      eq(schema.users.tenantId, tenantId), eq(schema.users.id, objectId),
    ));
  }
  if (!exists) throw notFound(`${objectType} not found`);
}

function visibleAuditRecord(
  objectType: UniversalAuditObjectType,
  value: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!value) return null;
  const definition = objectDefinitions.get(objectType.toLowerCase());
  if (!definition) return null;
  const exposed = new Set(definition.fields.filter((field) => field.apiExposed).map((field) => field.name));
  return Object.fromEntries(Object.entries(value).filter(([key]) => exposed.has(key)));
}

const SAFE_EVENT_KEYS = new Set([
  "action", "amount", "change", "currency", "currentStep", "kind", "objectId",
  "objectType", "quantityDelta", "status", "step", "version",
]);

function safeEventPayload(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {};
  return Object.fromEntries(Object.entries(payload as Record<string, unknown>)
    .filter(([key, value]) =>
      (key === "id" || key.endsWith("Id") || SAFE_EVENT_KEYS.has(key))
      && (value === null || ["string", "number", "boolean"].includes(typeof value))));
}

export async function getUniversalTimeline(
  tenantId: string,
  objectType: UniversalAuditObjectType,
  objectId: string,
  query: UniversalTimelineQuery,
  viewer?: { userId: string; permissions: readonly string[] },
): Promise<{
  object: { type: UniversalAuditObjectType; id: string };
  entries: UniversalTimelineEntry[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
  order: "desc";
}> {
  await assertObjectExists(tenantId, objectType, objectId);
  const offset = (query.page - 1) * query.pageSize;
  const sourceLimit = offset + query.pageSize;

  const auditWhere = and(
    eq(schema.auditLog.tenantId, tenantId),
    eq(schema.auditLog.objectType, objectType),
    eq(schema.auditLog.objectId, objectId),
  );
  const eventWhere = and(
    eq(schema.platformEvents.tenantId, tenantId),
    eq(schema.platformEvents.objectType, objectType),
    eq(schema.platformEvents.objectId, objectId),
  );
  const workflowWhere = and(
    eq(schema.workflowInstances.tenantId, tenantId),
    eq(schema.workflowInstances.objectType, objectType),
    eq(schema.workflowInstances.objectId, objectId),
  );
  const notificationWhere = and(
    eq(schema.notifications.tenantId, tenantId),
    eq(schema.notifications.objectType, objectType),
    eq(schema.notifications.objectId, objectId),
  );
  const mailVisible = Boolean(viewer && (
    viewer.permissions.includes("mail.read") || viewer.permissions.includes("mail.manage")
  ));
  const mailWhere = mailVisible ? and(
    eq(schema.mailMessages.tenantId, tenantId),
    sql`EXISTS (
      SELECT 1 FROM mail_object_links link
       WHERE link.tenant_id = ${tenantId}
         AND link.object_type = ${objectType}
         AND link.object_id = ${objectId}
         AND (link.message_id = ${schema.mailMessages.id} OR link.thread_id = ${schema.mailMessages.threadId})
    )`,
    viewer!.permissions.includes("mail.manage") ? undefined : or(
      eq(schema.mailAccounts.ownerUserId, viewer!.userId), eq(schema.mailAccounts.type, "shared"),
    ),
  ) : undefined;

  const [
    audits, events, actions, notifications,
    auditCount, eventCount, actionCount, notificationCount, mailMessages, mailCount,
  ] = await Promise.all([
    db.select({
      id: schema.auditLog.id,
      actorId: schema.auditLog.actorId,
      actorType: schema.auditLog.actorType,
      action: schema.auditLog.action,
      before: schema.auditLog.beforeJson,
      after: schema.auditLog.afterJson,
      source: schema.auditLog.source,
      occurredAt: schema.auditLog.occurredAt,
    }).from(schema.auditLog).where(auditWhere)
      .orderBy(desc(schema.auditLog.occurredAt), desc(schema.auditLog.id)).limit(sourceLimit),
    db.select({
      id: schema.platformEvents.id,
      actorId: schema.platformEvents.actorId,
      action: schema.platformEvents.eventType,
      payload: schema.platformEvents.payloadJson,
      status: schema.platformEvents.status,
      occurredAt: schema.platformEvents.occurredAt,
    }).from(schema.platformEvents).where(eventWhere)
      .orderBy(desc(schema.platformEvents.occurredAt), desc(schema.platformEvents.id)).limit(sourceLimit),
    db.select({
      id: schema.workflowActions.id,
      actorId: schema.workflowActions.actorId,
      action: schema.workflowActions.action,
      step: schema.workflowActions.step,
      comment: schema.workflowActions.comment,
      occurredAt: schema.workflowActions.actedAt,
    }).from(schema.workflowActions)
      .innerJoin(schema.workflowInstances, eq(schema.workflowInstances.id, schema.workflowActions.instanceId))
      .where(workflowWhere)
      .orderBy(desc(schema.workflowActions.actedAt), desc(schema.workflowActions.id)).limit(sourceLimit),
    db.select({
      id: schema.notifications.id,
      action: schema.notifications.template,
      channel: schema.notifications.channel,
      priority: schema.notifications.priority,
      title: schema.notifications.title,
      status: schema.notifications.status,
      readAt: schema.notifications.readAt,
      occurredAt: schema.notifications.createdAt,
    }).from(schema.notifications).where(notificationWhere)
      .orderBy(desc(schema.notifications.createdAt), desc(schema.notifications.id)).limit(sourceLimit),
    db.select({ count: sql<number>`count(*)::int` }).from(schema.auditLog).where(auditWhere),
    db.select({ count: sql<number>`count(*)::int` }).from(schema.platformEvents).where(eventWhere),
    db.select({ count: sql<number>`count(*)::int` }).from(schema.workflowActions)
      .innerJoin(schema.workflowInstances, eq(schema.workflowInstances.id, schema.workflowActions.instanceId))
      .where(workflowWhere),
    db.select({ count: sql<number>`count(*)::int` }).from(schema.notifications).where(notificationWhere),
    mailVisible ? db.select({
      id: schema.mailMessages.id,
      threadId: schema.mailMessages.threadId,
      accountId: schema.mailMessages.accountId,
      subject: schema.mailMessages.subject,
      direction: schema.mailMessages.direction,
      isRead: schema.mailMessages.isRead,
      receivedAt: schema.mailMessages.receivedAt,
      sentAt: schema.mailMessages.sentAt,
      createdAt: schema.mailMessages.createdAt,
    }).from(schema.mailMessages)
      .innerJoin(schema.mailAccounts, and(
        eq(schema.mailAccounts.id, schema.mailMessages.accountId),
        eq(schema.mailAccounts.tenantId, schema.mailMessages.tenantId),
      )).where(mailWhere)
      .orderBy(desc(sql`COALESCE(${schema.mailMessages.receivedAt}, ${schema.mailMessages.sentAt}, ${schema.mailMessages.createdAt})`), desc(schema.mailMessages.id))
      .limit(sourceLimit) : Promise.resolve([]),
    mailVisible ? db.select({ count: sql<number>`count(*)::int` }).from(schema.mailMessages)
      .innerJoin(schema.mailAccounts, and(
        eq(schema.mailAccounts.id, schema.mailMessages.accountId),
        eq(schema.mailAccounts.tenantId, schema.mailMessages.tenantId),
      )).where(mailWhere) : Promise.resolve([{ count: 0 }]),
  ]);

  const merged: UniversalTimelineEntry[] = [
    ...audits.map((entry) => ({
      id: entry.id,
      kind: "audit" as const,
      action: entry.action,
      actorId: entry.actorId,
      occurredAt: entry.occurredAt,
      details: {
        actorType: entry.actorType,
        source: entry.source,
        before: visibleAuditRecord(objectType, entry.before),
        after: visibleAuditRecord(objectType, entry.after),
      },
    })),
    ...events.map((entry) => ({
      id: entry.id,
      kind: "event" as const,
      action: entry.action,
      actorId: entry.actorId,
      occurredAt: entry.occurredAt,
      details: { status: entry.status, payload: safeEventPayload(entry.payload) },
    })),
    ...actions.map((entry) => ({
      id: entry.id,
      kind: "workflow" as const,
      action: entry.action.toLowerCase(),
      actorId: entry.actorId,
      occurredAt: entry.occurredAt,
      details: { step: entry.step, comment: entry.comment },
    })),
    ...notifications.map((entry) => ({
      id: entry.id,
      kind: "notification" as const,
      action: entry.action,
      actorId: null,
      occurredAt: entry.occurredAt,
      details: {
        channel: entry.channel, priority: entry.priority, title: entry.title,
        status: entry.status, readAt: entry.readAt,
      },
    })),
    ...mailMessages.map((entry) => ({
      id: entry.id,
      kind: "mail" as const,
      action: entry.direction === "inbound" ? "mail.received" : "mail.sent",
      actorId: null,
      occurredAt: entry.receivedAt ?? entry.sentAt ?? entry.createdAt,
      details: {
        threadId: entry.threadId,
        accountId: entry.accountId,
        subject: entry.subject,
        direction: entry.direction,
        isRead: entry.isRead,
      },
    })),
  ].sort((left, right) => {
    const byTime = right.occurredAt.getTime() - left.occurredAt.getTime();
    return byTime || `${right.kind}:${right.id}`.localeCompare(`${left.kind}:${left.id}`);
  });

  const total = (auditCount[0]?.count ?? 0) + (eventCount[0]?.count ?? 0)
    + (actionCount[0]?.count ?? 0) + (notificationCount[0]?.count ?? 0)
    + (mailCount[0]?.count ?? 0);
  return {
    object: { type: objectType, id: objectId },
    entries: merged.slice(offset, offset + query.pageSize),
    page: query.page,
    pageSize: query.pageSize,
    total,
    hasMore: offset + query.pageSize < total,
    order: "desc",
  };
}
