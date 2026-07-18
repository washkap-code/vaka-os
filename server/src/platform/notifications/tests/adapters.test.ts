import { describe, expect, it, vi } from "vitest";
import { emailGateway } from "../adapters/email-gateway.js";
import { inAppGateway } from "../adapters/in-app-gateway.js";
import { noopGateway } from "../adapters/noop-gateway.js";
import type { NotificationRequest, NotificationWriter } from "../index.js";

const request = (channel: NotificationRequest["channel"]): NotificationRequest => ({
  id: `notice-${channel}`,
  tenantId: "tenant-1",
  actorUserId: "user-1",
  recipient: "owner@example.com",
  channel,
  template: "security.notice",
  locale: "en-ZW",
  variables: { event: "New sign-in" },
  dedupeKey: `security-${channel}`,
});

const writer = (): NotificationWriter => async (notification, result) => ({
  requestId: notification.id,
  channel: notification.channel,
  status: result.status,
  transmitted: result.transmitted,
  providerMessageId: result.providerMessageId,
  acceptedAt: new Date("2026-07-13T00:00:00Z"),
});

describe("notification channel adapters", () => {
  it("sends email through the injected transport and persists provider evidence", async () => {
    const send = vi.fn().mockResolvedValue({ providerMessageId: "provider-1" });
    const persist = vi.fn(writer());
    await expect(emailGateway(send, persist).deliver(request("EMAIL"))).resolves.toMatchObject({
      status: "sent", transmitted: true, providerMessageId: "provider-1",
    });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      recipient: "owner@example.com", template: "security.notice", locale: "en-ZW",
    }));
    expect(persist).toHaveBeenCalledWith(expect.objectContaining({ channel: "EMAIL" }), {
      status: "sent", transmitted: true, providerMessageId: "provider-1",
    });
  });

  it("retries at most three times, then persists one failed outcome", async () => {
    const send = vi.fn().mockRejectedValue(Object.assign(new Error("provider unavailable"), { code: "ETIMEDOUT" }));
    const persist = vi.fn(writer());
    const log = vi.fn();
    const sleep = vi.fn().mockResolvedValue(undefined);
    const gateway = emailGateway(send, persist, { log, sleep });
    await expect(gateway.deliver(request("EMAIL"))).rejects.toThrow("provider unavailable");
    expect(send).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenNthCalledWith(1, 100);
    expect(sleep).toHaveBeenNthCalledWith(2, 200);
    expect(log.mock.calls.map(([event]) => event)).toEqual([
      "email.queued", "email.retried", "email.retried", "email.failed",
    ]);
    expect(persist).toHaveBeenLastCalledWith(expect.objectContaining({ channel: "EMAIL" }), {
      status: "failed", transmitted: false,
    });
  });

  it("records a sent outcome when a bounded retry succeeds", async () => {
    const send = vi.fn()
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValueOnce({ providerMessageId: "provider-recovered" });
    const persist = vi.fn(writer());
    const gateway = emailGateway(send, persist, {
      log: vi.fn(), sleep: vi.fn().mockResolvedValue(undefined),
    });
    await expect(gateway.deliver(request("EMAIL"))).resolves.toMatchObject({
      status: "sent", providerMessageId: "provider-recovered",
    });
    expect(send).toHaveBeenCalledTimes(2);
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("persists in-app and placeholder intent without claiming external transmission", async () => {
    const persist = vi.fn(writer());
    await expect(inAppGateway(persist).deliver(request("IN_APP")))
      .resolves.toMatchObject({ status: "accepted", transmitted: false });
    await expect(noopGateway("SMS", persist).deliver(request("SMS")))
      .resolves.toMatchObject({ status: "accepted", transmitted: false });
    await expect(noopGateway("PUSH", persist).deliver(request("PUSH")))
      .resolves.toMatchObject({ status: "accepted", transmitted: false });
    await expect(noopGateway("WHATSAPP", persist).deliver(request("WHATSAPP")))
      .resolves.toMatchObject({ status: "accepted", transmitted: false });
  });
});
