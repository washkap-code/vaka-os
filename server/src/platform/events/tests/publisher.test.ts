import { afterEach, describe, expect, it, vi } from "vitest";
import { EVENT_BUS, platformKernel } from "../../../platform-runtime.js";
import { runWithPostCommitEvents } from "../adapters/publisher.js";
import { DOMAIN_EVENTS } from "../registry.js";

describe("post-commit domain event publisher", () => {
  afterEach(() => { vi.restoreAllMocks(); });
  it("publishes queued facts after successful work resolves", async () => {
    const received: Array<{ id: string; invoiceId: string }> = [];
    const bus = platformKernel().container.get(EVENT_BUS);
    const subscription = bus.subscribe<{ invoiceId: string }>(DOMAIN_EVENTS.INVOICE_VOIDED, (event) => {
      received.push({ id: event.id, invoiceId: event.payload.invoiceId });
    });
    await expect(runWithPostCommitEvents(async (queue) => {
      queue({ id: "invoice.voided:invoice-1", type: DOMAIN_EVENTS.INVOICE_VOIDED, tenantId: "tenant-1", actorUserId: "user-1",
        payload: { invoiceId: "invoice-1", reason: "test" } });
      return "committed";
    })).resolves.toBe("committed");
    subscription.unsubscribe();
    expect(received).toEqual([{ id: "invoice.voided:invoice-1", invoiceId: "invoice-1" }]);
  });

  it("publishes nothing when the committing work rejects", async () => {
    const received: string[] = [];
    const bus = platformKernel().container.get(EVENT_BUS);
    const subscription = bus.subscribe(DOMAIN_EVENTS.INVOICE_VOIDED, () => { received.push("unexpected"); });
    await expect(runWithPostCommitEvents(async (queue) => {
      queue({ type: DOMAIN_EVENTS.INVOICE_VOIDED, tenantId: "tenant-1", actorUserId: "user-1",
        payload: { invoiceId: "invoice-rollback", reason: "test" } });
      throw new Error("rollback");
    })).rejects.toThrow("rollback");
    subscription.unsubscribe();
    expect(received).toEqual([]);
  });

  it("returns committed work when a post-commit projection is unavailable", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = await runWithPostCommitEvents(async (queue) => {
      queue({ type: DOMAIN_EVENTS.INVOICE_VOIDED, tenantId: "tenant-1", actorUserId: "user-1",
        payload: { invoiceId: "invoice-committed", reason: "test" } });
      return "committed";
    }, async () => { throw new Error("optional projection unavailable"); });

    expect(result).toBe("committed");
    expect(logged).toHaveBeenCalledWith("[event.post_commit_publish_failed]", expect.objectContaining({
      eventType: DOMAIN_EVENTS.INVOICE_VOIDED,
      error: "optional projection unavailable",
    }));
  });
});
