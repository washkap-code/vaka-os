import { describe, expect, it, vi } from "vitest";
import { IdentityService } from "../../../src/platform/identity/service.js";
import { MetadataRegistry } from "../../../src/platform/metadata/registry.js";
import { ContextAssemblyService } from "../../../src/platform/ai/context.js";
import {
  AIContextBoundaryError, AIObjectNotFoundError, AIObjectUnavailableError,
  AIPermissionDeniedError,
} from "../../../src/platform/ai/errors.js";

const USER = "11111111-1111-4111-8111-111111111111";
const TENANT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TENANT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OBJECT = "22222222-2222-4222-8222-222222222222";

function identity(tenantId: string, permissions: readonly string[]) {
  return new IdentityService(() => ({
    userId: USER,
    tenantId,
    sessionId: "session-1",
    isPlatformAdmin: false,
    permissions,
  }));
}

describe("AI context assembly boundaries", () => {
  it("returns only MetadataRegistry aiReadable fields and registers evidence", async () => {
    const readObject = vi.fn(async (tenantId: string) => {
      expect(tenantId).toBe(TENANT_A);
      return {
        name: "Mbare Retail",
        type: "COMPANY",
        city: "Harare",
        email: "restricted@example.com",
        taxNumber: "restricted-tax-number",
        unknownSecret: "never-exposed",
      };
    });
    const service = new ContextAssemblyService(
      identity(TENANT_A, ["crm.read"]),
      new MetadataRegistry(),
      { readObject },
    );

    const result = await service.buildContext(USER, TENANT_A, [{
      objectType: "customer",
      objectId: OBJECT,
    }]);

    expect(result.records).toEqual([{
      objectType: "Customer",
      objectId: OBJECT,
      fields: { name: "Mbare Retail", type: "COMPANY", city: "Harare" },
    }]);
    expect(result.evidence).toEqual([{
      objectType: "Customer",
      objectId: OBJECT,
      fieldNames: ["type", "name", "city"],
      snippet: JSON.stringify({ type: "COMPANY", name: "Mbare Retail", city: "Harare" }),
    }]);
    expect(JSON.stringify(result)).not.toContain("restricted@example.com");
    expect(JSON.stringify(result)).not.toContain("restricted-tax-number");
  });

  it("fails permission checks before any object query", async () => {
    const readObject = vi.fn();
    const service = new ContextAssemblyService(
      identity(TENANT_A, ["crm.read"]),
      new MetadataRegistry(),
      { readObject },
    );
    await expect(service.buildContext(USER, TENANT_A, [{
      objectType: "Invoice", objectId: OBJECT,
    }])).rejects.toThrow(AIPermissionDeniedError);
    expect(readObject).not.toHaveBeenCalled();
  });

  it("rejects cross-tenant identity substitution before any object query", async () => {
    const readObject = vi.fn();
    const service = new ContextAssemblyService(
      identity(TENANT_A, ["inventory.read"]),
      new MetadataRegistry(),
      { readObject },
    );
    await expect(service.buildContext(USER, TENANT_B, [{
      objectType: "Product", objectId: OBJECT,
    }])).rejects.toThrow(AIContextBoundaryError);
    expect(readObject).not.toHaveBeenCalled();
  });

  it("fails closed for AI-hidden and unknown objects", async () => {
    const readObject = vi.fn();
    const service = new ContextAssemblyService(
      identity(TENANT_A, ["payroll.read", "users.manage"]),
      new MetadataRegistry(),
      { readObject },
    );
    await expect(service.buildContext(USER, TENANT_A, [{
      objectType: "Employee", objectId: OBJECT,
    }])).rejects.toThrow(AIObjectUnavailableError);
    await expect(service.buildContext(USER, TENANT_A, [{
      objectType: "BankAccount", objectId: OBJECT,
    }])).rejects.toThrow(AIObjectUnavailableError);
    expect(readObject).not.toHaveBeenCalled();
  });

  it("returns a typed not-found error for a tenant-scoped miss", async () => {
    const service = new ContextAssemblyService(
      identity(TENANT_A, ["inventory.read"]),
      new MetadataRegistry(),
      { readObject: async () => null },
    );
    await expect(service.buildContext(USER, TENANT_A, [{
      objectType: "Product", objectId: OBJECT,
    }])).rejects.toThrow(AIObjectNotFoundError);
  });
});
