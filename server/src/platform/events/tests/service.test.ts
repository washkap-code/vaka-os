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
});
