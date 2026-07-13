import { InvalidPlatformEventError } from "./errors.js";
import type { EventBusContract } from "./interfaces.js";
import type { EventHandler, EventSubscription, PlatformEvent } from "./types.js";

export class InMemoryEventBus implements EventBusContract {
  private readonly handlers = new Map<string, Set<EventHandler<unknown>>>();

  constructor(private readonly onSubscriberError: (error: unknown, event: PlatformEvent) => void = () => {}) {}

  async publish<TPayload>(event: PlatformEvent<TPayload>): Promise<void> {
    if (!event.id.trim() || !event.type.trim()) throw new InvalidPlatformEventError("Event id and type are required");
    const handlers = [...(this.handlers.get(event.type) ?? [])];
    for (const handler of handlers) {
      try {
        await handler(event);
      } catch (error) {
        try { this.onSubscriberError(error, event); } catch { /* reporting must remain non-fatal */ }
      }
    }
  }

  subscribe<TPayload>(type: string, handler: EventHandler<TPayload>): EventSubscription {
    if (!type.trim()) throw new InvalidPlatformEventError("Event type is required");
    const handlers = this.handlers.get(type) ?? new Set<EventHandler<unknown>>();
    const typedHandler = handler as EventHandler<unknown>;
    handlers.add(typedHandler);
    this.handlers.set(type, handlers);
    return { unsubscribe: () => handlers.delete(typedHandler) };
  }
}
