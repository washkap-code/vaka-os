import { describe, expect, it } from "vitest";
import { AUDIT_SERVICE, IDENTITY_FACTORY, NOTIFICATION_SERVICE, buildPlatformKernel } from "../src/platform-runtime.js";
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

  it("resolves the notification service with injected delivery, persistence and audit adapters", async () => {
    const persisted: string[] = [];
    const audited: string[] = [];
    const kernel = buildPlatformKernel({
      auditWriter: () => {},
      emailTransport: async () => ({ providerMessageId: "provider-1" }),
      notificationWriter: async (request, result) => {
        persisted.push(`${request.tenantId}:${request.channel}:${result.status}`);
        return {
          requestId: request.id,
          channel: request.channel,
          status: result.status,
          transmitted: result.transmitted,
          providerMessageId: result.providerMessageId,
          acceptedAt: new Date("2026-07-13T00:00:00Z"),
        };
      },
      notificationDedupeLookup: async () => null,
      notificationAuditRecorder: async (_request, delivery) => { audited.push(delivery.requestId); },
    });
    const service = kernel.container.get(NOTIFICATION_SERVICE);
    await expect(service.send({
      id: "notice-1",
      tenantId: "tenant-1",
      actorUserId: "user-1",
      recipient: "owner@example.com",
      channel: "EMAIL",
      template: "security.notice",
      locale: "en-ZW",
      variables: { event: "New sign-in" },
    })).resolves.toMatchObject({ requestId: "notice-1", transmitted: true });
    expect(persisted).toEqual(["tenant-1:EMAIL:sent"]);
    expect(audited).toEqual(["notice-1"]);
  });
});
