import { randomUUID } from "node:crypto";
import { EVENT_BUS, platformKernel } from "../../../platform-runtime.js";
import type { DomainEventInput, DomainEventType } from "../registry.js";

export type QueueDomainEvent = <K extends DomainEventType>(event: DomainEventInput<K>) => void;
export type PublishDomainEvent = <K extends DomainEventType>(event: DomainEventInput<K>) => Promise<void>;

export async function emitDomainEvent<K extends DomainEventType>(event: DomainEventInput<K>): Promise<void> {
  await platformKernel().container.get(EVENT_BUS).publish({
    ...event,
    id: event.id ?? randomUUID(),
    occurredAt: new Date(),
  });
}

/** Publishes queued facts only after `work` resolves (i.e. after its DB commit). */
export async function runWithPostCommitEvents<T>(
  work: (queue: QueueDomainEvent) => Promise<T>,
  publish: PublishDomainEvent = emitDomainEvent,
): Promise<T> {
  const pending: DomainEventInput[] = [];
  const result = await work((event) => { pending.push(event as DomainEventInput); });
  for (const event of pending) {
    try {
      await publish(event);
    } catch (error) {
      // The database work has already committed. Report projection/delivery failure
      // without returning a false failure that encourages a duplicate business write.
      console.error("[event.post_commit_publish_failed]", {
        eventType: event.type,
        eventId: event.id ?? null,
        error: error instanceof Error ? error.message : "Unknown event publication error",
      });
    }
  }
  return result;
}
