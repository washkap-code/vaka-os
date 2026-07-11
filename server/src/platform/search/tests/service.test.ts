import { describe, expect, it, vi } from "vitest";
import { SearchService } from "../service.js";

describe("SearchService", () => {
  it("normalises bounded queries while preserving tenant scope", async () => {
    const search = vi.fn().mockResolvedValue({ results: [] });
    const service = new SearchService({ search });
    await service.search({ text: "  invoice ", limit: 500 }, { tenantId: "tenant-1", actorUserId: "user-1" });
    expect(search).toHaveBeenCalledWith({ text: "invoice", limit: 100 }, { tenantId: "tenant-1", actorUserId: "user-1" });
  });
});
