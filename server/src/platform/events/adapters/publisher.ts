import { randomUUID } from "node:crypto";
import { EVENT_BUS, platformKernel } from "../../../platform-runtime.js";
import type { DomainEventInput, DomainEventType } from "../registry.js";
import type { PlatformEvent } from "../types.js";
import { logEvent } from "../../../observability.js";

export type QueueDomainEvent = <K extends DomainEventType>(event: DomainEventInput<K>) => void;
export type PublishDomainEvent = <K extends DomainEventType>(event: DomainEventInput<K>) => Promise<void>;
export type QueuePlatformEvent = (event: PlatformEvent) => void;
export type PublishPlatformEvent = (event: PlatformEvent) => Promise<void>;

export async function emitDomainEvent<K extends DomainEventType>(event: DomainEventInput<K>): Promise<void> {
  await platformKernel().container.get(EVENT_BUS).publish({
    ...event,
    id: event.id ?? randomUUID(),
    occurredAt: new Date(),
  });
}

export async function emitPlatformEvent(event: PlatformEvent): Promise<void> {
  await platformKernel().container.get(EVENT_BUS).publish(event);
}

/** Publishes queued facts only after `work` resolves (i.e. after its DB commit). */
export async function runWithPostCommitEvents<T>(
  work: (queue: QueueDomainEvent, queuePlatform: QueuePlatformEvent) => Promise<T>,
  publish: PublishDomainEvent = emitDomainEvent,
  publishPlatform: PublishPlatformEvent = emitPlatformEvent,
): Promise<T> {
  const pending: Array<
    { kind: "domain"; event: DomainEventInput }
    | { kind: "platform"; event: PlatformEvent }
  > = [];
  const result = await work(
    (event) => { pending.push({ kind: "domain", event: event as DomainEventInput }); },
    (event) => { pending.push({ kind: "platform", event }); },
  );
  for (const pendingEvent of pending) {
    try {
      if (pendingEvent.kind === "domain") await publish(pendingEvent.event);
      else await publishPlatform(pendingEvent.event);
    } catch (error) {
      // The database work has already committed. Report projection/delivery failure
      // without returning a false failure that encourages a duplicate business write.
      logEvent("event.post_commit_publish_failed", {
        eventType: pendingEvent.event.type,
        eventId: pendingEvent.event.id ?? null,
        errorType: error instanceof Error ? error.name : "UnknownError",
      }, "error");
    }
  }
  return result;
}
