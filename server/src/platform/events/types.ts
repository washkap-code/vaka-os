import type { DomainEventPayloads, EventType } from "./registry.js";

export interface PlatformEvent<TPayload = DomainEventPayloads[EventType]> {
  id: string;
  type: EventType;
  occurredAt: Date;
  tenantId: string | null;
  actorUserId?: string | null;
  payload: TPayload;
}

export type EventHandler<TPayload = unknown> = (event: PlatformEvent<TPayload>) => Promise<void> | void;
export interface EventSubscription { unsubscribe(): void; }

export type PlatformEventStatus = "pending" | "processing" | "retrying" | "processed" | "failed";

export interface StoredPlatformEvent extends PlatformEvent {
  objectType: string | null;
  objectId: string | null;
  status: PlatformEventStatus;
  retryCount: number;
  processedAt: Date | null;
}
