import type { EventHandler, EventSubscription, PlatformEvent } from "./types.js";

export interface EventBusContract {
  publish<TPayload>(event: PlatformEvent<TPayload>): Promise<void>;
  subscribe<TPayload>(type: string, handler: EventHandler<TPayload>): EventSubscription;
}
