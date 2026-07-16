import { and, desc, eq, gte, isNull } from "drizzle-orm";
import { db, schema } from "./lib.js";
import type {
  NotificationDedupeLookup, NotificationChannel, NotificationDelivery, NotificationWriter,
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
  try {
    const [row] = await db.insert(schema.notifications).values({
      id: request.id,
      tenantId: request.tenantId,
      recipient: request.recipient,
      channel: request.channel,
      template: request.template,
      locale: request.locale,
      variables: persistedVariables,
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
    status: schema.notifications.status,
    transmitted: schema.notifications.transmitted,
    providerMessageId: schema.notifications.providerMessageId,
    dedupeKey: schema.notifications.dedupeKey,
    createdAt: schema.notifications.createdAt,
  }).from(schema.notifications)
    .where(and(
      eq(schema.notifications.tenantId, tenantId),
      opts.recipient ? eq(schema.notifications.recipient, opts.recipient) : undefined,
      opts.channel ? eq(schema.notifications.channel, opts.channel) : undefined,
    ))
    .orderBy(desc(schema.notifications.createdAt))
    .limit(limit);
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
