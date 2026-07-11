import { describe, expect, it, vi } from "vitest";
import { DocumentService } from "../service.js";

describe("DocumentService", () => {
  it("keeps document access behind an injected tenant-aware store", async () => {
    const descriptor = { id: "doc-1", tenantId: "tenant-1", fileName: "receipt.png", mediaType: "image/png", byteSize: 3, createdAt: new Date() };
    const get = vi.fn().mockResolvedValue({ descriptor, bytes: new Uint8Array([1, 2, 3]) });
    const service = new DocumentService({ put: vi.fn().mockResolvedValue(descriptor), get });
    await expect(service.get("doc-1", { tenantId: "tenant-1", actorUserId: "user-1" })).resolves.toMatchObject({ descriptor });
    expect(get).toHaveBeenCalledWith("doc-1", { tenantId: "tenant-1", actorUserId: "user-1" });
  });
});
