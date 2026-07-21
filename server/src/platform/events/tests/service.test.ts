import { describe, expect, it } from "vitest";
import { InMemoryEventBus } from "../service.js";
import { DOMAIN_EVENTS } from "../registry.js";

describe("InMemoryEventBus", () => {
  it("publishes to subscribed handlers and supports unsubscribe", async () => {
    const bus = new InMemoryEventBus();
    const received: string[] = [];
    const subscription = bus.subscribe<{ customerId: string }>(DOMAIN_EVENTS.CUSTOMER_CREATED, (event) => {
      received.push(event.payload.customerId);
    });
    const event = { id: "event-1", type: DOMAIN_EVENTS.CUSTOMER_CREATED, tenantId: "tenant-1", occurredAt: new Date(), payload: { customerId: "one" } };
    await bus.publish(event);
    subscription.unsubscribe();
    await bus.publish({ ...event, id: "event-2", payload: { customerId: "two" } });
    expect(received).toEqual(["one"]);
  });

  it("isolates a failing subscriber and continues sibling delivery", async () => {
    const errors: string[] = [];
    const bus = new InMemoryEventBus((error) => errors.push((error as Error).message));
    const received: string[] = [];
    bus.subscribe(DOMAIN_EVENTS.CUSTOMER_CREATED, () => { throw new Error("subscriber failed"); });
    bus.subscribe<{ customerId: string }>(DOMAIN_EVENTS.CUSTOMER_CREATED, (event) => { received.push(event.payload.customerId); });
    await expect(bus.publish({
      id: "event-isolation", type: DOMAIN_EVENTS.CUSTOMER_CREATED, tenantId: "tenant-1",
      occurredAt: new Date(), payload: { customerId: "delivered" },
    })).resolves.toBeUndefined();
    expect(errors).toEqual(["subscriber failed"]);
    expect(received).toEqual(["delivered"]);
  });

  it("keeps delivery non-fatal when failure reporting also throws", async () => {
    const bus = new InMemoryEventBus(() => { throw new Error("reporter failed"); });
    bus.subscribe(DOMAIN_EVENTS.CUSTOMER_CREATED, () => { throw new Error("subscriber failed"); });
    await expect(bus.publish({
      id: "event-reporter-isolation", type: DOMAIN_EVENTS.CUSTOMER_CREATED, tenantId: "tenant-1",
      occurredAt: new Date(), payload: { customerId: "customer-1" },
    })).resolves.toBeUndefined();
  });
});
