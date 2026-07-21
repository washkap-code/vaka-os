import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { db, schema } from "./lib.js";
import type {
  NotificationDedupeLookup, NotificationChannel, NotificationDelivery,
  NotificationPreferenceLookup, NotificationRequest, NotificationWriter,
} from "./platform/notifications/index.js";

/** Platform identities have no tenant FK; their email attempts are structured-logged. */
export const PLATFORM_NOTIFICATION_SCOPE = "platform";

function deliveryFromRow(row: typeof schema.notifications.$inferSelect): NotificationDelivery {
  return {
    requestId: row.id,
    channel: row.channel as NotificationDelivery["channel"],
    status: row.status as NotificationDelivery["status"],
    transmitted: row.transmitted,
    providerMessageId: row.providerMessageId ?? undefined,
    priority: row.priority as NotificationDelivery["priority"],
    acceptedAt: row.createdAt,
  };
}

export const findNotificationDuplicate: NotificationDedupeLookup = async (tenantId, dedupeKey) => {
  if (tenantId === PLATFORM_NOTIFICATION_SCOPE) return null;
  const [row] = await db.select().from(schema.notifications).where(and(
    eq(schema.notifications.tenantId, tenantId),
    eq(schema.notifications.dedupeKey, dedupeKey),
  ));
  return row ? deliveryFromRow(row) : null;
};

function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5; depth += 1) {
    if (typeof current !== "object" || current === null) return false;
    if ("code" in current && (current as { code?: unknown }).code === "23505") return true;
    current = "cause" in current ? (current as { cause?: unknown }).cause : null;
  }
  return false;
}

export const persistNotification: NotificationWriter = async (request, result) => {
  if (request.tenantId === PLATFORM_NOTIFICATION_SCOPE) {
    return {
      requestId: request.id,
      channel: request.channel,
      status: result.status,
      transmitted: result.transmitted,
      providerMessageId: result.providerMessageId,
      acceptedAt: new Date(),
    };
  }
  const sensitiveKeys = new Set(request.sensitiveVariableKeys ?? []);
  const persistedVariables = Object.fromEntries(Object.entries(request.variables).map(([key, value]) =>
    [key, sensitiveKeys.has(key) ? "[REDACTED]" : value]));
  const addressedUserId = request.userId
    ?? (request.channel === "IN_APP" || request.channel === "PUSH" ? request.recipient : null);
  try {
    const [row] = await db.insert(schema.notifications).values({
      id: request.id,
      tenantId: request.tenantId,
      userId: addressedUserId,
      recipient: request.recipient,
      channel: request.channel,
      template: request.template,
      locale: request.locale,
      variables: persistedVariables,
      priority: request.priority ?? "normal",
      title: request.title?.trim() || null,
      body: request.body?.trim() || null,
      link: request.link?.trim() || null,
      objectType: request.objectRef?.objectType ?? null,
      objectId: request.objectRef?.objectId ?? null,
      status: result.status,
      transmitted: result.transmitted,
      providerMessageId: result.providerMessageId ?? null,
      dedupeKey: request.dedupeKey ?? null,
    }).returning();
    return deliveryFromRow(row);
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const [sameId] = await db.select().from(schema.notifications)
      .where(eq(schema.notifications.id, request.id));
    if (sameId) {
      if (sameId.tenantId !== request.tenantId) {
        throw new Error("Notification request id is already owned by another tenant");
      }
      const [updated] = await db.update(schema.notifications).set({
        status: result.status,
        transmitted: result.transmitted,
        providerMessageId: result.providerMessageId ?? null,
      }).where(and(
        eq(schema.notifications.id, request.id),
        eq(schema.notifications.tenantId, request.tenantId),
      )).returning();
      return deliveryFromRow(updated);
    }
    if (request.dedupeKey) {
      const duplicate = await findNotificationDuplicate(request.tenantId, request.dedupeKey);
      if (duplicate) return { ...duplicate, deduplicated: true };
    }
    throw error;
  }
};

export async function listNotifications(
  tenantId: string,
  opts: { limit?: number; recipient?: string; channel?: NotificationChannel } = {},
) {
  const limit = Math.max(1, Math.min(opts.limit ?? 50, 200));
  return db.select({
    id: schema.notifications.id,
    channel: schema.notifications.channel,
    template: schema.notifications.template,
    locale: schema.notifications.locale,
    variables: schema.notifications.variables,
    userId: schema.notifications.userId,
    priority: schema.notifications.priority,
    title: schema.notifications.title,
    body: schema.notifications.body,
    link: schema.notifications.link,
    objectType: schema.notifications.objectType,
    objectId: schema.notifications.objectId,
    status: schema.notifications.status,
    transmitted: schema.notifications.transmitted,
    providerMessageId: schema.notifications.providerMessageId,
    dedupeKey: schema.notifications.dedupeKey,
    createdAt: schema.notifications.createdAt,
    readAt: schema.notifications.readAt,
  }).from(schema.notifications)
    .where(and(
      eq(schema.notifications.tenantId, tenantId),
      opts.recipient ? eq(schema.notifications.recipient, opts.recipient) : undefined,
      opts.channel ? eq(schema.notifications.channel, opts.channel) : undefined,
    ))
    .orderBy(desc(schema.notifications.createdAt))
    .limit(limit);
}

function notificationCategory(request: NotificationRequest): string {
  return request.category?.trim() || request.template.split(".")[0]?.trim() || "general";
}

/** Missing preference rows are deliberately enabled by default. */
export const notificationPreferenceEnabled: NotificationPreferenceLookup = async (request) => {
  if (request.tenantId === PLATFORM_NOTIFICATION_SCOPE) return true;
  let userId = request.userId;
  if (!userId && (request.channel === "IN_APP" || request.channel === "PUSH")) {
    userId = request.recipient;
  }
  if (!userId && request.channel === "EMAIL") {
    const [user] = await db.select({ id: schema.users.id }).from(schema.users).where(and(
      eq(schema.users.tenantId, request.tenantId),
      eq(schema.users.email, request.recipient.toLowerCase().trim()),
    ));
    userId = user?.id;
  }
  if (!userId) return true;
  const [preference] = await db.select({ enabled: schema.notificationPreferences.enabled })
    .from(schema.notificationPreferences).where(and(
      eq(schema.notificationPreferences.tenantId, request.tenantId),
      eq(schema.notificationPreferences.userId, userId),
      eq(schema.notificationPreferences.category, notificationCategory(request)),
      eq(schema.notificationPreferences.channel, request.channel),
    ));
  return preference?.enabled ?? true;
};

export interface NotificationInboxPage {
  notifications: Array<{
    id: string;
    template: string;
    locale: string;
    variables: unknown;
    priority: string;
    title: string | null;
    body: string | null;
    link: string | null;
    objectType: string | null;
    objectId: string | null;
    status: string;
    createdAt: Date;
    readAt: Date | null;
  }>;
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export async function listNotificationInbox(
  tenantId: string,
  userId: string,
  options: { page?: number; pageSize?: number; unread?: boolean } = {},
): Promise<NotificationInboxPage> {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.max(1, Math.min(options.pageSize ?? 20, 50));
  const where = and(
    eq(schema.notifications.tenantId, tenantId),
    eq(schema.notifications.userId, userId),
    eq(schema.notifications.channel, "IN_APP"),
    options.unread ? isNull(schema.notifications.readAt) : undefined,
  );
  const [notifications, totalRows] = await Promise.all([
    db.select({
      id: schema.notifications.id,
      template: schema.notifications.template,
      locale: schema.notifications.locale,
      variables: schema.notifications.variables,
      priority: schema.notifications.priority,
      title: schema.notifications.title,
      body: schema.notifications.body,
      link: schema.notifications.link,
      objectType: schema.notifications.objectType,
      objectId: schema.notifications.objectId,
      status: schema.notifications.status,
      createdAt: schema.notifications.createdAt,
      readAt: schema.notifications.readAt,
    }).from(schema.notifications).where(where)
      .orderBy(desc(schema.notifications.createdAt), desc(schema.notifications.id))
      .limit(pageSize).offset((page - 1) * pageSize),
    db.select({ total: sql<number>`count(*)::int` }).from(schema.notifications).where(where),
  ]);
  const total = totalRows[0]?.total ?? 0;
  return { notifications, total, page, pageSize, hasMore: page * pageSize < total };
}

export async function markNotificationRead(tenantId: string, userId: string, notificationId: string) {
  const owned = and(
    eq(schema.notifications.id, notificationId),
    eq(schema.notifications.tenantId, tenantId),
    eq(schema.notifications.userId, userId),
    eq(schema.notifications.channel, "IN_APP"),
  );
  const [updated] = await db.update(schema.notifications).set({ readAt: new Date() })
    .where(and(owned, isNull(schema.notifications.readAt)))
    .returning({ id: schema.notifications.id, readAt: schema.notifications.readAt });
  if (updated) return updated;
  const [existing] = await db.select({ id: schema.notifications.id, readAt: schema.notifications.readAt })
    .from(schema.notifications).where(owned);
  return existing ?? null;
}

export async function markAllNotificationsRead(tenantId: string, userId: string): Promise<number> {
  const updated = await db.update(schema.notifications).set({ readAt: new Date() }).where(and(
    eq(schema.notifications.tenantId, tenantId),
    eq(schema.notifications.userId, userId),
    eq(schema.notifications.channel, "IN_APP"),
    isNull(schema.notifications.readAt),
  )).returning({ id: schema.notifications.id });
  return updated.length;
}

export interface FailedEmailDelivery {
  messageId: string;
  tenantId: string | null;
  recipient: string;
  template: string;
  correlationId: string;
  failedAt: Date;
  source: "notification" | "password_reset";
}

/** Platform-operator read model for the UTC calendar day. */
export async function listFailedEmailDeliveriesToday(
  now: Date = new Date(),
): Promise<FailedEmailDelivery[]> {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const tenantFailures = await db.select({
    messageId: schema.notifications.id,
    tenantId: schema.notifications.tenantId,
    recipient: schema.notifications.recipient,
    template: schema.notifications.template,
    failedAt: schema.notifications.createdAt,
  }).from(schema.notifications).where(and(
    eq(schema.notifications.channel, "EMAIL"),
    eq(schema.notifications.status, "failed"),
    gte(schema.notifications.createdAt, start),
  )).orderBy(desc(schema.notifications.createdAt));

  // Platform users have no tenant_id and therefore cannot use the tenant-owned
  // notifications table. Password-reset status is their durable failure record.
  const platformResetFailures = await db.select({
    messageId: schema.passwordResetRequests.id,
    recipient: schema.users.email,
    failedAt: schema.passwordResetRequests.createdAt,
  }).from(schema.passwordResetRequests)
    .innerJoin(schema.users, eq(schema.users.id, schema.passwordResetRequests.userId))
    .where(and(
      isNull(schema.passwordResetRequests.tenantId),
      eq(schema.passwordResetRequests.deliveryStatus, "FAILED"),
      gte(schema.passwordResetRequests.createdAt, start),
    )).orderBy(desc(schema.passwordResetRequests.createdAt));

  return [
    ...tenantFailures.map((row) => ({
      ...row,
      correlationId: row.messageId,
      source: "notification" as const,
    })),
    ...platformResetFailures.map((row) => ({
      ...row,
      tenantId: null,
      template: "security.password_reset.v1",
      correlationId: row.messageId,
      source: "password_reset" as const,
    })),
  ].sort((left, right) => right.failedAt.getTime() - left.failedAt.getTime());
}
