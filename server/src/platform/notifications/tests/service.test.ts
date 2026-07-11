import { describe, expect, it, vi } from "vitest";
import { NotificationService } from "../service.js";

describe("NotificationService", () => {
  it("delegates a validated, locale-aware request to the provider", async () => {
    const deliver = vi.fn().mockResolvedValue({ requestId: "n-1", acceptedAt: new Date() });
    const request = {
      id: "n-1", tenantId: "tenant-1", recipient: "owner@example.com", channel: "EMAIL" as const,
      template: "invoice.issued", locale: "en-ZW", variables: { invoiceNumber: "INV-1" },
    };
    await expect(new NotificationService({ deliver }).send(request)).resolves.toMatchObject({ requestId: "n-1" });
    expect(deliver).toHaveBeenCalledWith(request);
  });
});
