import { beforeEach, describe, expect, it, vi } from "vitest";

const { inserted } = vi.hoisted(() => ({ inserted: [] as unknown[] }));

// The facade resolves the process-wide kernel, which binds to the app db.
// We stub the db insert so no database is required and we can assert the row.
vi.mock("../src/lib.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib.js")>();
  return {
    ...actual,
    db: {
      insert: () => ({ values: (row: unknown) => { inserted.push(row); return Promise.resolve(); } }),
    },
  };
});

import { recordAudit } from "../src/platform/audit-facade.js";

describe("recordAudit facade (P1-003)", () => {
  beforeEach(() => { inserted.length = 0; });

  it("records through the kernel and writes the legacy audit_logs row shape", async () => {
    await recordAudit({
      tenantId: "tenant-1", actorUserId: "user-1",
      action: "invoice.issued", entityType: "invoice", entityId: "inv-1",
      metadata: { total: 100 },
    });
    expect(inserted).toEqual([{
      tenantId: "tenant-1", userId: "user-1", action: "invoice.issued",
      entityType: "invoice", entityId: "inv-1", metadata: { total: 100 },
    }]);
  });

  it("fails closed on an event missing a tenant (nothing written)", async () => {
    await expect(recordAudit({
      tenantId: "  ", actorUserId: "user-1", action: "invoice.issued", entityType: "invoice",
    })).rejects.toBeTruthy();
    expect(inserted).toHaveLength(0);
  });
});
