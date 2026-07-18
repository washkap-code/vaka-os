import { InvalidPlatformEventError } from "./errors.js";
import type {
  EventBusContract, EventStoreContract, EventSubscriptionOptions,
} from "./interfaces.js";
import { EVENT_TYPES, type DomainEventPayloads, type EventType } from "./registry.js";
import { InMemoryEventStore } from "./store.js";
import type { EventHandler, EventSubscription, PlatformEvent } from "./types.js";

interface RegisteredHandler {
  name: string;
  durable: boolean;
  handler: EventHandler<unknown>;
}

export interface ReliableEventBusOptions {
  onSubscriberError?: (error: unknown, event: PlatformEvent, handlerName: string, retryCount: number) => void;
  retryBackoffMs?: readonly [number, number, number];
  sleep?: (milliseconds: number) => Promise<void>;
}

const defaultSleep = (milliseconds: number) => new Promise<void>((resolve) => {
  const timer = setTimeout(resolve, milliseconds);
  timer.unref?.();
});

/** Persist-first bus with isolated delivery, three scheduled retries and durable idempotency. */
export class ReliableEventBus implements EventBusContract {
  private readonly handlers = new Map<EventType, Map<string, RegisteredHandler>>();
  private readonly pendingRetries = new Set<Promise<void>>();
  private anonymousHandlerSequence = 0;
  private readonly onSubscriberError: NonNullable<ReliableEventBusOptions["onSubscriberError"]>;
  private readonly retryBackoffMs: readonly [number, number, number];
  private readonly sleep: (milliseconds: number) => Promise<void>;

  constructor(
    private readonly store: EventStoreContract,
    options: ReliableEventBusOptions = {},
  ) {
    this.onSubscriberError = options.onSubscriberError ?? (() => {});
    this.retryBackoffMs = options.retryBackoffMs ?? [50, 100, 200];
    this.sleep = options.sleep ?? defaultSleep;
  }

  async publish<K extends EventType>(
    event: PlatformEvent<DomainEventPayloads[K]> & { type: K },
  ): Promise<void> {
    if (!event.id.trim() || !EVENT_TYPES.includes(event.type)) {
      throw new InvalidPlatformEventError("A registered event type and event id are required");
    }
    await this.store.persist(event);
    await this.store.setStatus(event.id, "processing", 0);

    const handlers = [...(this.handlers.get(event.type)?.values() ?? [])];
    const failed: RegisteredHandler[] = [];
    for (const registration of handlers) {
      if (registration.durable && await this.store.hasProcessed(registration.name, event.id)) continue;
      try {
        await registration.handler(event);
        if (registration.durable) {
          await this.store.markProcessed(registration.name, event.id, new Date());
        }
      } catch (error) {
        this.reportFailure(error, event, registration.name, 0);
        failed.push(registration);
      }
    }

    if (!failed.length) {
      await this.store.setStatus(event.id, "processed", 0, new Date());
      return;
    }

    await this.store.setStatus(event.id, "retrying", 0);
    const retryTask = this.retryFailedHandlers(event, failed)
      .catch((error) => this.reportFailure(error, event, "event-bus.retry-scheduler", 3))
      .finally(() => this.pendingRetries.delete(retryTask));
    this.pendingRetries.add(retryTask);
  }

  subscribe<TPayload>(
    type: EventType,
    handler: EventHandler<TPayload>,
    options: EventSubscriptionOptions = {},
  ): EventSubscription {
    if (!EVENT_TYPES.includes(type)) throw new InvalidPlatformEventError("Event type is not registered");
    const durable = Boolean(options.handlerName?.trim());
    const name = options.handlerName?.trim()
      || `anonymous:${type}:${++this.anonymousHandlerSequence}`;
    const handlers = this.handlers.get(type) ?? new Map<string, RegisteredHandler>();
    if (handlers.has(name)) throw new InvalidPlatformEventError(`Handler ${name} is already subscribed to ${type}`);
    handlers.set(name, { name, durable, handler: handler as EventHandler<unknown> });
    this.handlers.set(type, handlers);
    return { unsubscribe: () => handlers.delete(name) };
  }

  hasProcessed(handlerName: string, eventId: string): Promise<boolean> {
    const normalized = handlerName.trim();
    if (!normalized || !eventId.trim()) throw new InvalidPlatformEventError("Handler name and event id are required");
    return this.store.hasProcessed(normalized, eventId);
  }

  /** Test/controlled-shutdown seam for waiting until scheduled retries settle. */
  async waitForIdle(): Promise<void> {
    await Promise.all([...this.pendingRetries]);
  }

  private async retryFailedHandlers(event: PlatformEvent, handlers: RegisteredHandler[]): Promise<void> {
    const results = await Promise.all(handlers.map(async (registration) => {
      for (let index = 0; index < this.retryBackoffMs.length; index += 1) {
        const retryCount = index + 1;
        await this.sleep(this.retryBackoffMs[index]);
        await this.store.setStatus(event.id, "retrying", retryCount);
        if (registration.durable && await this.store.hasProcessed(registration.name, event.id)) {
          return { processed: true, retryCount };
        }
        try {
          await registration.handler(event);
          if (registration.durable) {
            await this.store.markProcessed(registration.name, event.id, new Date());
          }
          return { processed: true, retryCount };
        } catch (error) {
          this.reportFailure(error, event, registration.name, retryCount);
        }
      }
      return { processed: false, retryCount: this.retryBackoffMs.length };
    }));
    const failed = results.some((result) => !result.processed);
    const retryCount = Math.max(...results.map((result) => result.retryCount));
    await this.store.setStatus(event.id, failed ? "failed" : "processed", retryCount, failed ? null : new Date());
  }

  private reportFailure(
    error: unknown,
    event: PlatformEvent,
    handlerName: string,
    retryCount: number,
  ): void {
    try { this.onSubscriberError(error, event, handlerName, retryCount); } catch { /* reporting is non-fatal */ }
  }
}

/** Compatibility adapter for isolated unit tests; persistence remains in memory. */
export class InMemoryEventBus extends ReliableEventBus {
  readonly memoryStore: InMemoryEventStore;

  constructor(
    onSubscriberError: (error: unknown, event: PlatformEvent) => void = () => {},
    options: Omit<ReliableEventBusOptions, "onSubscriberError"> = {},
  ) {
    const store = new InMemoryEventStore();
    super(store, {
      ...options,
      onSubscriberError: (error, event) => onSubscriberError(error, event),
    });
    this.memoryStore = store;
  }
}
