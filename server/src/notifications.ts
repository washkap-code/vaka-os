import { and, desc, eq } from "drizzle-orm";
import { emailProviderConfig, type EmailProviderConfig } from "./config.js";
import { db, schema } from "./lib.js";
import type {
  EmailTransport, EmailTransportMessage, NotificationDedupeLookup,
  NotificationDelivery, NotificationWriter,
} from "./platform/notifications/index.js";

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
  opts: { limit?: number } = {},
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
    .where(eq(schema.notifications.tenantId, tenantId))
    .orderBy(desc(schema.notifications.createdAt))
    .limit(limit);
}

export function createHttpEmailTransport(
  config: EmailProviderConfig | null = emailProviderConfig(),
): EmailTransport {
  return async (message: EmailTransportMessage) => {
    if (!config) throw new Error("Email delivery is not configured");
    const response = await fetch(config.url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.token}`,
        "content-type": "application/json",
        "idempotency-key": message.dedupeKey ?? message.id,
      },
      body: JSON.stringify({
        from: config.from,
        to: message.recipient,
        template: message.template,
        locale: message.locale,
        variables: message.variables,
      }),
    });
    if (!response.ok) throw new Error(`Email provider rejected delivery with status ${response.status}`);
    const payload: unknown = await response.json().catch(() => ({}));
    const providerMessageId = typeof payload === "object" && payload !== null && "id" in payload
      && typeof (payload as { id?: unknown }).id === "string"
      ? (payload as { id: string }).id
      : undefined;
    return { providerMessageId };
  };
}
