import { describe, expect, it } from "vitest";
import { InvalidPlatformTypeError } from "../errors.js";
import { PlatformTypesService } from "../service.js";

describe("PlatformTypesService", () => {
  it("normalises required values and preserves matching tenant scope", () => {
    const service = new PlatformTypesService();
    const record = { tenantId: "tenant-1", id: "record-1" };
    expect(service.requireNonEmpty("  ready ", "status")).toBe("ready");
    expect(service.requireTenantScope(record, "tenant-1")).toBe(record);
  });

  it("fails closed for empty or mismatched scope", () => {
    const service = new PlatformTypesService();
    expect(() => service.requireNonEmpty(" ", "name")).toThrow(InvalidPlatformTypeError);
    expect(() => service.requireTenantScope({ tenantId: "tenant-1" }, "tenant-2")).toThrow(InvalidPlatformTypeError);
  });
});
