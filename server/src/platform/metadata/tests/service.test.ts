import { describe, expect, it, vi } from "vitest";
import { MetadataService } from "../service.js";

describe("MetadataService", () => {
  it("keeps metadata tenant-scoped through its provider contract", async () => {
    const record = { tenantId: "tenant-1", entityType: "contact", entityId: "contact-1", values: { segment: "priority" } };
    const read = vi.fn().mockResolvedValue(record);
    const service = new MetadataService({ definitions: vi.fn(), read, write: vi.fn().mockResolvedValue(record) });
    await expect(service.read(record)).resolves.toEqual(record);
    expect(service.value(record, "segment")).toBe("priority");
    expect(read).toHaveBeenCalledWith(record);
  });
});
