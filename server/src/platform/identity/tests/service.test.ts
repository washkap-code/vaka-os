import { describe, expect, it } from "vitest";
import { IdentityContextMissingError, TenantContextMissingError } from "../errors.js";
import { IdentityService } from "../service.js";

describe("IdentityService", () => {
  it("exposes permissions and tenant scope without knowing the auth adapter", () => {
    const service = new IdentityService(() => ({
      userId: "user-1", tenantId: "tenant-1", sessionId: "session-1",
      isPlatformAdmin: false, permissions: ["crm.read"],
    }));
    expect(service.requireTenant()).toBe("tenant-1");
    expect(service.hasPermission("crm.read")).toBe(true);
    expect(service.hasPermission("accounting.post")).toBe(false);
  });

  it("fails closed when identity or tenant context is absent", () => {
    expect(() => new IdentityService(() => null).requireTenant()).toThrow(IdentityContextMissingError);
    expect(() => new IdentityService(() => ({
      userId: null, tenantId: null, sessionId: null, isPlatformAdmin: true, permissions: [],
    })).requireTenant()).toThrow(TenantContextMissingError);
  });
});
