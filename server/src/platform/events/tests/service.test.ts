import { describe, expect, it } from "vitest";
import { InMemoryEventBus } from "../service.js";

describe("InMemoryEventBus", () => {
  it("publishes to subscribed handlers and supports unsubscribe", async () => {
    const bus = new InMemoryEventBus();
    const received: string[] = [];
    const subscription = bus.subscribe<{ value: string }>("test.created", (event) => {
      received.push(event.payload.value);
    });
    const event = { id: "event-1", type: "test.created", tenantId: "tenant-1", occurredAt: new Date(), payload: { value: "one" } };
    await bus.publish(event);
    subscription.unsubscribe();
    await bus.publish({ ...event, id: "event-2", payload: { value: "two" } });
    expect(received).toEqual(["one"]);
  });

  it("isolates a failing subscriber and continues sibling delivery", async () => {
    const errors: string[] = [];
    const bus = new InMemoryEventBus((error) => errors.push((error as Error).message));
    const received: string[] = [];
    bus.subscribe("test.created", () => { throw new Error("subscriber failed"); });
    bus.subscribe<{ value: string }>("test.created", (event) => { received.push(event.payload.value); });
    await expect(bus.publish({
      id: "event-isolation", type: "test.created", tenantId: "tenant-1",
      occurredAt: new Date(), payload: { value: "delivered" },
    })).resolves.toBeUndefined();
    expect(errors).toEqual(["subscriber failed"]);
    expect(received).toEqual(["delivered"]);
  });

  it("keeps delivery non-fatal when failure reporting also throws", async () => {
    const bus = new InMemoryEventBus(() => { throw new Error("reporter failed"); });
    bus.subscribe("test.created", () => { throw new Error("subscriber failed"); });
    await expect(bus.publish({
      id: "event-reporter-isolation", type: "test.created", tenantId: "tenant-1",
      occurredAt: new Date(), payload: {},
    })).resolves.toBeUndefined();
  });
});
