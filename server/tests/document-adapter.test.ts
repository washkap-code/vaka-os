import { describe, expect, it } from "vitest";
import {
  DOCUMENT_KINDS, PostgresDocumentStore, captureDocumentId, rawDocumentId,
} from "../src/documents.js";

describe("application document adapter boundaries", () => {
  it("fails closed on unknown or malformed kind-qualified identifiers", async () => {
    const store = new PostgresDocumentStore();
    const context = { tenantId: "tenant-1", actorUserId: "user-1" };
    await expect(store.get("unknown:00000000-0000-4000-8000-000000000001", context)).resolves.toBeNull();
    await expect(store.get("capture:not-a-uuid", context)).resolves.toBeNull();
    expect(() => rawDocumentId("invoice-pdf:00000000-0000-4000-8000-000000000001", DOCUMENT_KINDS.CAPTURE))
      .toThrow("identifier is malformed");
  });

  it("does not allow invoice documents or anonymous actors through the capture write path", async () => {
    const store = new PostgresDocumentStore();
    const descriptor = {
      id: captureDocumentId("00000000-0000-4000-8000-000000000001"),
      tenantId: "tenant-1",
      kind: DOCUMENT_KINDS.CAPTURE,
      classification: "RECEIPT",
      fileName: "receipt.png",
      mediaType: "image/png",
      byteSize: 3,
      createdAt: new Date(),
    };
    await expect(store.put({ descriptor, bytes: new Uint8Array([1, 2, 3]) }, {
      tenantId: "tenant-1", actorUserId: null,
    })).rejects.toThrow("authenticated actor");
    await expect(store.put({
      descriptor: { ...descriptor, id: "invoice-pdf:00000000-0000-4000-8000-000000000001" },
      bytes: new Uint8Array([1, 2, 3]),
    }, { tenantId: "tenant-1", actorUserId: "user-1" })).rejects.toThrow("Only capture documents");
    await expect(store.put({ descriptor, bytes: new Uint8Array([1, 2, 3]) }, {
      tenantId: "tenant-1", actorUserId: "user-1",
    })).rejects.toThrow("Capture content is invalid");
  });
});
