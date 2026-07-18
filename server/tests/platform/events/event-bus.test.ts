import { describe, expect, it } from "vitest";
import type { EventStoreContract } from "../../../src/platform/events/interfaces.js";
import { DOMAIN_EVENTS } from "../../../src/platform/events/registry.js";
import { ReliableEventBus } from "../../../src/platform/events/service.js";
import { InMemoryEventStore } from "../../../src/platform/events/store.js";
import type { PlatformEventStatus } from "../../../src/platform/events/types.js";

describe("P1-005 reliable event bus", () => {
  it("persists an event before dispatching it", async () => {
    const order: string[] = [];
    const memory = new InMemoryEventStore();
    const store: EventStoreContract = {
      persist: async (event) => { order.push("persist"); await memory.persist(event); },
      setStatus: async (...args) => memory.setStatus(...args),
      hasProcessed: async (...args) => memory.hasProcessed(...args),
      markProcessed: async (...args) => memory.markProcessed(...args),
    };
    const bus = new ReliableEventBus(store);
    bus.subscribe(DOMAIN_EVENTS.CUSTOMER_CREATED, () => { order.push("handler"); },
      { handlerName: "test.customer-projection" });

    await bus.publish({
      id: "customer.created:customer-1",
      type: DOMAIN_EVENTS.CUSTOMER_CREATED,
      tenantId: "tenant-1",
      actorUserId: "user-1",
      occurredAt: new Date(),
      payload: { customerId: "customer-1" },
    });

    expect(order).toEqual(["persist", "handler"]);
    expect(memory.get("customer.created:customer-1")?.status).toBe("processed");
  });

  it("isolates a throwing subscriber, retries three times, and marks failure", async () => {
    const memory = new InMemoryEventStore();
    const failures: number[] = [];
    let throwingAttempts = 0;
    let siblingAttempts = 0;
    const bus = new ReliableEventBus(memory, {
      retryBackoffMs: [1, 2, 3],
      sleep: async () => {},
      onSubscriberError: (_error, _event, handlerName, retryCount) => {
        if (handlerName === "test.throwing") failures.push(retryCount);
      },
    });
    bus.subscribe(DOMAIN_EVENTS.PRODUCT_CREATED, () => {
      throwingAttempts += 1;
      throw new Error("projection unavailable");
    }, { handlerName: "test.throwing" });
    bus.subscribe(DOMAIN_EVENTS.PRODUCT_CREATED, () => { siblingAttempts += 1; },
      { handlerName: "test.sibling" });

    await expect(bus.publish({
      id: "product.created:product-1",
      type: DOMAIN_EVENTS.PRODUCT_CREATED,
      tenantId: "tenant-1",
      actorUserId: "user-1",
      occurredAt: new Date(),
      payload: { productId: "product-1" },
    })).resolves.toBeUndefined();
    expect(siblingAttempts).toBe(1);
    await bus.waitForIdle();

    expect(throwingAttempts).toBe(4);
    expect(failures).toEqual([0, 1, 2, 3]);
    expect(memory.get("product.created:product-1")).toMatchObject({
      status: "failed" satisfies PlatformEventStatus,
      retryCount: 3,
      processedAt: null,
    });
  });

  it("records named handler idempotency and skips a duplicate event", async () => {
    const memory = new InMemoryEventStore();
    const bus = new ReliableEventBus(memory);
    let calls = 0;
    bus.subscribe(DOMAIN_EVENTS.EMPLOYEE_CREATED, () => { calls += 1; },
      { handlerName: "test.employee-index" });
    const event = {
      id: "employee.created:employee-1",
      type: DOMAIN_EVENTS.EMPLOYEE_CREATED,
      tenantId: "tenant-1",
      actorUserId: "user-1",
      occurredAt: new Date(),
      payload: { employeeId: "employee-1" },
    } as const;

    await bus.publish(event);
    await bus.publish(event);

    expect(calls).toBe(1);
    await expect(bus.hasProcessed("test.employee-index", event.id)).resolves.toBe(true);
  });

  it("rejects reuse of an event id for a different fact shape", async () => {
    const bus = new ReliableEventBus(new InMemoryEventStore());
    const base = {
      id: "customer.created:collision",
      type: DOMAIN_EVENTS.CUSTOMER_CREATED,
      tenantId: "tenant-1",
      actorUserId: "user-1",
      occurredAt: new Date(),
    } as const;
    await bus.publish({ ...base, payload: { customerId: "customer-1" } });
    await expect(bus.publish({ ...base, payload: { customerId: "customer-2" } }))
      .rejects.toThrow("different fact");
  });

  it("rejects unregistered event types at compile time", () => {
    const bus = new ReliableEventBus(new InMemoryEventStore());
    if (false) {
      // @ts-expect-error unknown events are excluded from EventType
      void bus.publish({ id: "unknown", type: "unknown.event", tenantId: null, occurredAt: new Date(), payload: {} });
    }
    expect(bus).toBeDefined();
  });
});
