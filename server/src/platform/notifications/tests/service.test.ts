import { describe, expect, it, vi } from "vitest";
import { NotificationService } from "../service.js";

describe("NotificationService", () => {
  it("delegates a validated, locale-aware request to the provider", async () => {
    const deliver = vi.fn().mockResolvedValue({ requestId: "n-1", acceptedAt: new Date() });
    const request = {
      id: "n-1", tenantId: "tenant-1", actorUserId: "user-1", recipient: "owner@example.com", channel: "EMAIL" as const,
      template: "invoice.issued", locale: "en-ZW", variables: { invoiceNumber: "INV-1" },
    };
    const service = new NotificationService({
      EMAIL: { deliver }, IN_APP: { deliver }, SMS: { deliver }, WHATSAPP: { deliver },
    });
    await expect(service.send(request)).resolves.toMatchObject({ requestId: "n-1" });
    expect(deliver).toHaveBeenCalledWith(request);
  });

  it("suppresses a duplicate within the tenant before invoking a gateway", async () => {
    const deliver = vi.fn();
    const service = new NotificationService(
      { EMAIL: { deliver }, IN_APP: { deliver }, SMS: { deliver }, WHATSAPP: { deliver } },
      async () => ({ requestId: "original", status: "sent", acceptedAt: new Date("2026-07-13T00:00:00Z") }),
    );
    await expect(service.send({
      id: "retry", tenantId: "tenant-1", actorUserId: "user-1", recipient: "owner@example.com",
      channel: "EMAIL", template: "security.notice", locale: "en-ZW", variables: {}, dedupeKey: "security-1",
    })).resolves.toMatchObject({ requestId: "original", deduplicated: true });
    expect(deliver).not.toHaveBeenCalled();
  });
});
