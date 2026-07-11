import { describe, expect, it, vi } from "vitest";
import { AuditService } from "../service.js";

describe("AuditService", () => {
  it("normalises the timestamp and delegates structured evidence", async () => {
    const append = vi.fn();
    const service = new AuditService({ append });
    await service.record({ tenantId: "tenant-1", actorUserId: "user-1", action: "test.created", entityType: "test" });
    expect(append).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1", action: "test.created", occurredAt: expect.any(Date),
    }));
  });
});
