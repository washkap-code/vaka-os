import { describe, expect, it } from "vitest";
import { audit, type DB } from "../../../lib.js";
import { InvalidAuditEventError } from "../errors.js";
import { AuditService } from "../service.js";
import { createAuditSink, toAuditLogRow, type AuditLogRow } from "../adapters/audit-sink.js";

/** Captures the row the legacy audit() helper would insert, without a database. */
async function legacyAuditRow(
  tenantId: string, userId: string | null, action: string,
  entityType: string, entityId?: string, metadata?: unknown,
): Promise<unknown> {
  let captured: unknown;
  const fakeTx = {
    insert: () => ({ values: (row: unknown) => { captured = row; } }),
  } as unknown as DB;
  await audit(fakeTx, tenantId, userId, action, entityType, entityId, metadata);
  return captured;
}

describe("audit adapter parity with legacy audit()", () => {
  it("produces field-for-field identical rows for a fully populated event", async () => {
    const legacy = await legacyAuditRow(
      "tenant-1", "user-1", "invoice.issued", "invoice", "inv-9", { total: 100 },
    );
    const adapted = toAuditLogRow({
      tenantId: "tenant-1", actorUserId: "user-1", action: "invoice.issued",
      entityType: "invoice", entityId: "inv-9", metadata: { total: 100 },
    });
    expect(adapted).toEqual(legacy);
  });

  it("matches legacy null-handling for optional fields", async () => {
    const legacy = await legacyAuditRow("tenant-1", null, "tenant.created", "tenant");
    const adapted = toAuditLogRow({
      tenantId: "tenant-1", actorUserId: null, action: "tenant.created", entityType: "tenant",
    });
    expect(adapted).toEqual(legacy);
  });
});

describe("createAuditSink", () => {
  it("appends the mapped row through the injected writer", async () => {
    const rows: AuditLogRow[] = [];
    const sink = createAuditSink((row) => { rows.push(row); });
    await sink.append({
      tenantId: "tenant-1", actorUserId: "user-1", action: "stock.adjusted",
      entityType: "stock_movement", entityId: "mv-1", metadata: { qty: 5 },
    });
    expect(rows).toEqual([{
      tenantId: "tenant-1", userId: "user-1", action: "stock.adjusted",
      entityType: "stock_movement", entityId: "mv-1", metadata: { qty: 5 },
    }]);
  });
});

describe("AuditService tenant isolation (fail closed)", () => {
  it("rejects events without a tenant before they reach the sink", async () => {
    const rows: AuditLogRow[] = [];
    const service = new AuditService(createAuditSink((row) => { rows.push(row); }));
    await expect(service.record({
      tenantId: "  ", actorUserId: "user-1", action: "invoice.issued", entityType: "invoice",
    })).rejects.toBeInstanceOf(InvalidAuditEventError);
    expect(rows).toHaveLength(0);
  });

  it("preserves the tenant on every recorded event", async () => {
    const rows: AuditLogRow[] = [];
    const service = new AuditService(createAuditSink((row) => { rows.push(row); }));
    await service.record({
      tenantId: "tenant-a", actorUserId: null, action: "security.session_created", entityType: "session",
    });
    await service.record({
      tenantId: "tenant-b", actorUserId: null, action: "security.session_created", entityType: "session",
    });
    expect(rows.map((r) => r.tenantId)).toEqual(["tenant-a", "tenant-b"]);
  });
});
