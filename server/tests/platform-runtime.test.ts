import { describe, expect, it } from "vitest";
import { AUDIT_SERVICE, IDENTITY_FACTORY, buildPlatformKernel } from "../src/platform-runtime.js";
import { DuplicateServiceError } from "../src/platform/container/errors.js";
import type { AuditLogRow } from "../src/platform/audit/adapters/audit-sink.js";

describe("platform runtime composition (P1-002)", () => {
  it("resolves the audit service and records through the bound writer", async () => {
    const rows: AuditLogRow[] = [];
    const kernel = buildPlatformKernel({ auditWriter: (row) => { rows.push(row); } });
    const auditService = kernel.container.get(AUDIT_SERVICE);
    await auditService.record({
      tenantId: "tenant-1", actorUserId: "user-1",
      action: "invoice.issued", entityType: "invoice", entityId: "inv-1",
    });
    expect(rows).toEqual([{
      tenantId: "tenant-1", userId: "user-1", action: "invoice.issued",
      entityType: "invoice", entityId: "inv-1", metadata: null,
    }]);
  });

  it("resolves the identity factory and produces tenant-isolated services", () => {
    const kernel = buildPlatformKernel({ auditWriter: () => {} });
    const factory = kernel.container.get(IDENTITY_FACTORY);
    const a = factory.for({
      userId: "u1", tenantId: "tenant-a", isPlatformAdmin: false,
      sessionId: "s1", permissions: ["crm.read"],
    });
    const b = factory.for(null);
    expect(a.requireTenant()).toBe("tenant-a");
    expect(b.context()).toBeNull();
    expect(b.hasPermission("crm.read")).toBe(false);
  });

  it("each kernel build is isolated and duplicate registration fails closed", () => {
    const one = buildPlatformKernel({ auditWriter: () => {} });
    const two = buildPlatformKernel({ auditWriter: () => {} });
    expect(one).not.toBe(two);
    expect(() => one.container.registerValue(AUDIT_SERVICE, {} as never))
      .toThrow(DuplicateServiceError);
  });
});
