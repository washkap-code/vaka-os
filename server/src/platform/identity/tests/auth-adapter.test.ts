import { describe, expect, it } from "vitest";
import { IdentityContextMissingError, TenantContextMissingError } from "../errors.js";
import { identityContextFromAuth, identityServiceForAuth } from "../adapters/auth-context.js";

const tenantAuth = {
  userId: "user-1",
  tenantId: "tenant-1",
  isPlatformAdmin: false,
  sessionId: "session-1",
  permissions: ["crm.read", "accounting.post"],
  // Extra legacy fields must be tolerated (structural typing):
  isTenantOwner: true,
  mustChangePassword: false,
  accessLevel: "full" as const,
};

describe("identityContextFromAuth", () => {
  it("maps every identity field from the legacy auth snapshot", () => {
    const context = identityContextFromAuth(tenantAuth);
    expect(context).toEqual({
      userId: "user-1",
      tenantId: "tenant-1",
      sessionId: "session-1",
      isPlatformAdmin: false,
      permissions: ["crm.read", "accounting.post"],
    });
  });

  it("returns null for missing auth (unauthenticated request)", () => {
    expect(identityContextFromAuth(null)).toBeNull();
    expect(identityContextFromAuth(undefined)).toBeNull();
  });

  it("copies permissions so later mutation of the auth object cannot leak", () => {
    const auth = { ...tenantAuth, permissions: ["crm.read"] };
    const context = identityContextFromAuth(auth)!;
    (auth.permissions as string[]).push("accounting.post");
    expect(context.permissions).toEqual(["crm.read"]);
  });
});

describe("identityServiceForAuth — tenant isolation", () => {
  it("scopes each service to its own tenant", () => {
    const a = identityServiceForAuth({ ...tenantAuth, tenantId: "tenant-a" });
    const b = identityServiceForAuth({ ...tenantAuth, tenantId: "tenant-b", permissions: ["inventory.read"] });
    expect(a.requireTenant()).toBe("tenant-a");
    expect(b.requireTenant()).toBe("tenant-b");
    expect(a.hasPermission("inventory.read")).toBe(false);
    expect(b.hasPermission("crm.read")).toBe(false);
  });

  it("fails closed for unauthenticated requests", () => {
    const service = identityServiceForAuth(null);
    expect(service.context()).toBeNull();
    expect(() => service.requireTenant()).toThrow(IdentityContextMissingError);
    expect(service.hasPermission("crm.read")).toBe(false);
  });

  it("does not grant tenant scope to platform administrators implicitly", () => {
    const service = identityServiceForAuth({
      userId: "admin-1", tenantId: null, isPlatformAdmin: true,
      sessionId: "session-9", permissions: [],
    });
    expect(() => service.requireTenant()).toThrow(TenantContextMissingError);
    expect(service.hasPermission("accounting.post")).toBe(false);
  });

  it("captures the snapshot once — later auth mutation does not change identity", () => {
    const auth = { ...tenantAuth };
    const service = identityServiceForAuth(auth);
    auth.tenantId = "tenant-hijacked";
    expect(service.requireTenant()).toBe("tenant-1");
  });
});
