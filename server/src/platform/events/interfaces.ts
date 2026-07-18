import type { DomainEventPayloads, EventType } from "./registry.js";
import type {
  EventHandler, EventSubscription, PlatformEvent, PlatformEventStatus,
} from "./types.js";

export interface EventSubscriptionOptions {
  /** Stable across deploys; enables durable handler idempotency. */
  handlerName?: string;
}

export interface EventStoreContract {
  persist<K extends EventType>(event: PlatformEvent<DomainEventPayloads[K]> & { type: K }): Promise<void>;
  setStatus(eventId: string, status: PlatformEventStatus, retryCount: number, processedAt?: Date | null): Promise<void>;
  hasProcessed(handlerName: string, eventId: string): Promise<boolean>;
  markProcessed(handlerName: string, eventId: string, processedAt: Date): Promise<void>;
}

export interface EventBusContract {
  publish<K extends EventType>(event: PlatformEvent<DomainEventPayloads[K]> & { type: K }): Promise<void>;
  subscribe<TPayload>(
    type: EventType,
    handler: EventHandler<TPayload>,
    options?: EventSubscriptionOptions,
  ): EventSubscription;
  hasProcessed(handlerName: string, eventId: string): Promise<boolean>;
}
