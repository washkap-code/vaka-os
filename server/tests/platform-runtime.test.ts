import { describe, expect, it } from "vitest";
import { AUDIT_SERVICE, DOCUMENT_SERVICE, EVENT_BUS, IDENTITY_FACTORY, METADATA_SERVICE, NOTIFICATION_SERVICE, SEARCH_SERVICE, buildPlatformKernel } from "../src/platform-runtime.js";
import { DuplicateServiceError } from "../src/platform/container/errors.js";
import type { AuditLogRow } from "../src/platform/audit/adapters/audit-sink.js";
import type { SearchApplicationAdapter } from "../src/search.js";

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

  it("composes isolated event buses and reports subscriber failures", async () => {
    const failures: string[] = [];
    const one = buildPlatformKernel({
      auditWriter: () => {},
      eventSubscriberError: (error, type) => failures.push(`${type}:${(error as Error).message}`),
      customerTimelineProjector: {
        projectActivity: async () => {}, projectInvoice: async () => {}, projectPayment: async () => {}, reconcileCustomer: async () => {},
      },
    }).container.get(EVENT_BUS);
    const two = buildPlatformKernel({ auditWriter: () => {} }).container.get(EVENT_BUS);
    const siblingDeliveries: string[] = [];
    one.subscribe("invoice.issued", () => { throw new Error("consumer unavailable"); });
    one.subscribe("invoice.issued", () => { siblingDeliveries.push("delivered"); });
    two.subscribe("invoice.issued", () => { siblingDeliveries.push("wrong bus"); });
    await one.publish({
      id: "invoice.issued:inv-1", type: "invoice.issued", occurredAt: new Date(),
      tenantId: "tenant-1", actorUserId: "user-1", payload: { invoiceId: "inv-1" },
    });
    expect(failures).toEqual(["invoice.issued:consumer unavailable"]);
    expect(siblingDeliveries).toEqual(["delivered"]);
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

  it("resolves search through the injected kernel adapter", async () => {
    const calls: string[] = [];
    const adapter: SearchApplicationAdapter = {
      search: async <TDocument>(query: { text: string }, scope: { tenantId: string }) => {
        calls.push(`${scope.tenantId}:${query.text}`);
        return { results: [] as TDocument[] };
      },
      reconcileTenant: async () => {},
      reindexCustomer: async () => {},
      reindexSupplier: async () => {},
      reindexInvoice: async () => {},
      reindexProduct: async () => {},
    };
    const service = buildPlatformKernel({ auditWriter: () => {}, searchAdapter: adapter })
      .container.get(SEARCH_SERVICE);
    await expect(service.search({ text: "  customer  " }, {
      tenantId: "tenant-1",
      actorUserId: "user-1",
      permissions: ["crm.read"],
    })).resolves.toEqual({ results: [] });
    expect(calls).toEqual(["tenant-1:customer"]);
  });

  it("resolves the canonical metadata registry behind the kernel contract", async () => {
    const metadata = buildPlatformKernel({ auditWriter: () => {} }).container.get(METADATA_SERVICE);
    await expect(metadata.object("invoice", "tenant-1")).resolves.toMatchObject({
      key: "invoice",
      canonicalName: "Invoice",
      readPermission: "accounting.read",
    });
  });

  it("resolves documents through an injected tenant-aware store", async () => {
    const calls: string[] = [];
    const descriptor = {
      id: "capture:doc-1", tenantId: "tenant-1", kind: "capture", fileName: "receipt.png",
      mediaType: "image/png", byteSize: 3, createdAt: new Date("2026-07-13T00:00:00Z"),
    };
    const service = buildPlatformKernel({
      auditWriter: () => {},
      documentStore: {
        put: async (payload, context) => {
          calls.push(`put:${context.tenantId}:${payload.descriptor.id}`);
          return payload.descriptor;
        },
        get: async (id, context) => {
          calls.push(`get:${context.tenantId}:${id}`);
          return { descriptor, bytes: new Uint8Array([1, 2, 3]) };
        },
      },
    }).container.get(DOCUMENT_SERVICE);
    await expect(service.get(descriptor.id, {
      tenantId: "tenant-1", actorUserId: "user-1",
    })).resolves.toMatchObject({ descriptor });
    await expect(service.put({ descriptor, bytes: new Uint8Array([1, 2, 3]) }, {
      tenantId: "tenant-1", actorUserId: "user-1",
    })).resolves.toEqual(descriptor);
    expect(calls).toEqual([
      "get:tenant-1:capture:doc-1",
      "put:tenant-1:capture:doc-1",
    ]);
  });
});
