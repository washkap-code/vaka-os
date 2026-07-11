import { describe, expect, it, vi } from "vitest";
import { SharedService } from "../service.js";

describe("SharedService", () => {
  it("uses injected runtime dependencies", () => {
    const logger = { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const service = new SharedService(
      { now: () => new Date("2026-01-01T00:00:00.000Z") },
      { next: () => "fixed-id" },
      logger,
    );
    service.logInfo("ready", { module: "test" });
    expect(service.now().toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(service.nextId()).toBe("fixed-id");
    expect(logger.info).toHaveBeenCalledWith("ready", { module: "test" });
  });
});
