import { isDeepStrictEqual } from "node:util";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "./lib.js";
import type { EventStoreContract } from "./platform/events/interfaces.js";
import {
  eventObjectReference, type DomainEventPayloads, type EventType,
} from "./platform/events/registry.js";
import type { PlatformEvent, PlatformEventStatus } from "./platform/events/types.js";

export class PostgresEventStore implements EventStoreContract {
  async persist<K extends EventType>(
    event: PlatformEvent<DomainEventPayloads[K]> & { type: K },
  ): Promise<void> {
    const reference = eventObjectReference(event.type, event.payload);
    const inserted = await db.insert(schema.platformEvents).values({
      id: event.id,
      tenantId: event.tenantId,
      eventType: event.type,
      objectType: reference.objectType,
      objectId: reference.objectId,
      actorId: event.actorUserId ?? null,
      payloadJson: event.payload,
      occurredAt: event.occurredAt,
      status: "pending",
      retryCount: 0,
    }).onConflictDoNothing().returning({ id: schema.platformEvents.id });
    if (inserted.length) return;

    const [existing] = await db.select({
      eventType: schema.platformEvents.eventType,
      tenantId: schema.platformEvents.tenantId,
      payloadJson: schema.platformEvents.payloadJson,
    }).from(schema.platformEvents).where(eq(schema.platformEvents.id, event.id));
    if (!existing || existing.eventType !== event.type || existing.tenantId !== event.tenantId
      || !isDeepStrictEqual(existing.payloadJson, event.payload)) {
      throw new Error("Event id is already registered to a different fact");
    }
  }

  async setStatus(
    eventId: string,
    status: PlatformEventStatus,
    retryCount: number,
    processedAt: Date | null = null,
  ): Promise<void> {
    const updated = await db.update(schema.platformEvents).set({
      status,
      retryCount,
      processedAt,
    }).where(eq(schema.platformEvents.id, eventId)).returning({ id: schema.platformEvents.id });
    if (!updated.length) throw new Error("Cannot update an event that was not persisted");
  }

  async hasProcessed(handlerName: string, eventId: string): Promise<boolean> {
    const [row] = await db.select({ id: schema.processedEvents.id })
      .from(schema.processedEvents).where(and(
        eq(schema.processedEvents.handlerName, handlerName),
        eq(schema.processedEvents.eventId, eventId),
      ));
    return Boolean(row);
  }

  async markProcessed(handlerName: string, eventId: string, processedAt: Date): Promise<void> {
    await db.insert(schema.processedEvents).values({ handlerName, eventId, processedAt })
      .onConflictDoNothing();
  }
}

export interface PlatformEventPage {
  events: Array<{
    id: string;
    eventType: EventType;
    objectType: string | null;
    objectId: string | null;
    actorId: string | null;
    payload: unknown;
    occurredAt: Date;
    processedAt: Date | null;
    status: string;
    retryCount: number;
  }>;
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export async function listPlatformEvents(
  tenantId: string,
  options: { page?: number; pageSize?: number; status?: PlatformEventStatus; eventType?: EventType } = {},
): Promise<PlatformEventPage> {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.max(1, Math.min(options.pageSize ?? 20, 100));
  const where = and(
    eq(schema.platformEvents.tenantId, tenantId),
    options.status ? eq(schema.platformEvents.status, options.status) : undefined,
    options.eventType ? eq(schema.platformEvents.eventType, options.eventType) : undefined,
  );
  const [events, totals] = await Promise.all([
    db.select({
      id: schema.platformEvents.id,
      eventType: schema.platformEvents.eventType,
      objectType: schema.platformEvents.objectType,
      objectId: schema.platformEvents.objectId,
      actorId: schema.platformEvents.actorId,
      payload: schema.platformEvents.payloadJson,
      occurredAt: schema.platformEvents.occurredAt,
      processedAt: schema.platformEvents.processedAt,
      status: schema.platformEvents.status,
      retryCount: schema.platformEvents.retryCount,
    }).from(schema.platformEvents).where(where)
      .orderBy(desc(schema.platformEvents.occurredAt), desc(schema.platformEvents.id))
      .limit(pageSize).offset((page - 1) * pageSize),
    db.select({ total: sql<number>`count(*)::int` }).from(schema.platformEvents).where(where),
  ]);
  const total = totals[0]?.total ?? 0;
  return { events, total, page, pageSize, hasMore: page * pageSize < total };
}
