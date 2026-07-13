import { describe, expect, it, vi } from "vitest";
import { DocumentService } from "../service.js";

describe("DocumentService", () => {
  it("keeps document access behind an injected tenant-aware store", async () => {
    const descriptor = { id: "capture:doc-1", tenantId: "tenant-1", kind: "capture", fileName: "receipt.png", mediaType: "image/png", byteSize: 3, createdAt: new Date() };
    const get = vi.fn().mockResolvedValue({ descriptor, bytes: new Uint8Array([1, 2, 3]) });
    const service = new DocumentService({ put: vi.fn().mockResolvedValue(descriptor), get });
    await expect(service.get("capture:doc-1", { tenantId: "tenant-1", actorUserId: "user-1" })).resolves.toMatchObject({ descriptor });
    expect(get).toHaveBeenCalledWith("capture:doc-1", { tenantId: "tenant-1", actorUserId: "user-1" });
  });

  it("fails closed before a mismatched or malformed write reaches the store", async () => {
    const put = vi.fn();
    const service = new DocumentService({ put, get: vi.fn() });
    const descriptor = {
      id: "capture:doc-1", tenantId: "tenant-1", kind: "capture", fileName: "receipt.png",
      mediaType: "image/png", byteSize: 4, createdAt: new Date(),
    };
    await expect(service.put({ descriptor, bytes: new Uint8Array([1, 2, 3]) }, {
      tenantId: "tenant-1", actorUserId: "user-1",
    })).rejects.toThrow("byteSize does not match");
    await expect(service.put({ descriptor: { ...descriptor, byteSize: 3 }, bytes: new Uint8Array([1, 2, 3]) }, {
      tenantId: "tenant-2", actorUserId: "user-1",
    })).rejects.toThrow("tenant scope does not match");
    expect(put).not.toHaveBeenCalled();
  });
});
