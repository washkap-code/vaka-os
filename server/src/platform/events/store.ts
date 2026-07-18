import { isDeepStrictEqual } from "node:util";
import type { DomainEventPayloads, EventType } from "./registry.js";
import { eventObjectReference } from "./registry.js";
import type { EventStoreContract } from "./interfaces.js";
import type { PlatformEvent, PlatformEventStatus, StoredPlatformEvent } from "./types.js";

/** Test/local adapter. Production uses the PostgreSQL adapter from the composition root. */
export class InMemoryEventStore implements EventStoreContract {
  private readonly events = new Map<string, StoredPlatformEvent>();
  private readonly processed = new Set<string>();

  async persist<K extends EventType>(
    event: PlatformEvent<DomainEventPayloads[K]> & { type: K },
  ): Promise<void> {
    const existing = this.events.get(event.id);
    if (existing) {
      if (existing.type !== event.type || existing.tenantId !== event.tenantId
        || !isDeepStrictEqual(existing.payload, event.payload)) {
        throw new Error("Event id is already registered to a different fact");
      }
      return;
    }
    const reference = eventObjectReference(event.type, event.payload);
    this.events.set(event.id, {
      ...event,
      ...reference,
      status: "pending",
      retryCount: 0,
      processedAt: null,
    } as StoredPlatformEvent);
  }

  async setStatus(
    eventId: string,
    status: PlatformEventStatus,
    retryCount: number,
    processedAt: Date | null = null,
  ): Promise<void> {
    const event = this.events.get(eventId);
    if (!event) throw new Error("Unknown persisted event");
    this.events.set(eventId, { ...event, status, retryCount, processedAt });
  }

  async hasProcessed(handlerName: string, eventId: string): Promise<boolean> {
    return this.processed.has(`${handlerName}\u0000${eventId}`);
  }

  async markProcessed(handlerName: string, eventId: string, _processedAt: Date): Promise<void> {
    this.processed.add(`${handlerName}\u0000${eventId}`);
  }

  get(eventId: string): StoredPlatformEvent | undefined {
    return this.events.get(eventId);
  }
}
