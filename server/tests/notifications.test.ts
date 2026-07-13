import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { listNotifications } from "../src/notifications.js";
import { NOTIFICATION_SERVICE, buildPlatformKernel } from "../src/platform-runtime.js";
import { db, schema } from "../src/lib.js";
import { signupFinanceTenant } from "./finance/helpers.js";

describe("P1-004 notification persistence", () => {
  const runId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  it("persists tenant-isolated in-app and placeholder records with tenant-scoped dedupe", async () => {
    const tenantA = await signupFinanceTenant("notifications-a");
    const tenantB = await signupFinanceTenant("notifications-b");
    const service = buildPlatformKernel().container.get(NOTIFICATION_SERVICE);

    const firstA = await service.send({
      id: `${runId}-notice-a-1`,
      tenantId: tenantA.tenantId,
      actorUserId: tenantA.userId,
      recipient: tenantA.userId,
      channel: "IN_APP",
      template: "security.notice",
      locale: "en-ZW",
      variables: { event: "New sign-in" },
      dedupeKey: "security-notice-1",
    });
    const duplicateA = await service.send({
      id: `${runId}-notice-a-2`,
      tenantId: tenantA.tenantId,
      actorUserId: tenantA.userId,
      recipient: tenantA.userId,
      channel: "IN_APP",
      template: "security.notice",
      locale: "en-ZW",
      variables: { event: "New sign-in" },
      dedupeKey: "security-notice-1",
    });
    const firstB = await service.send({
      id: `${runId}-notice-b-1`,
      tenantId: tenantB.tenantId,
      actorUserId: tenantB.userId,
      recipient: tenantB.userId,
      channel: "SMS",
      template: "security.notice",
      locale: "en-ZW",
      variables: { event: "New sign-in" },
      dedupeKey: "security-notice-1",
    });

    expect(firstA).toMatchObject({ requestId: `${runId}-notice-a-1`, channel: "IN_APP", transmitted: false });
    expect(duplicateA).toMatchObject({ requestId: `${runId}-notice-a-1`, deduplicated: true });
    expect(firstB).toMatchObject({ requestId: `${runId}-notice-b-1`, channel: "SMS", transmitted: false });

    const rowsA = await listNotifications(tenantA.tenantId);
    const rowsB = await listNotifications(tenantB.tenantId);
    expect(rowsA).toHaveLength(1);
    expect(rowsA[0]).toMatchObject({ id: `${runId}-notice-a-1`, channel: "IN_APP", status: "accepted", transmitted: false });
    expect(rowsB).toHaveLength(1);
    expect(rowsB[0]).toMatchObject({ id: `${runId}-notice-b-1`, channel: "SMS", status: "accepted", transmitted: false });
    expect(JSON.stringify(rowsA)).not.toContain(`${runId}-notice-b-1`);

    const auditsA = await db.select().from(schema.auditLogs)
      .where(eq(schema.auditLogs.tenantId, tenantA.tenantId));
    expect(auditsA.some((row) => row.action === "notification.accepted" && row.entityId === `${runId}-notice-a-1`)).toBe(true);
  });

  it("rejects a cross-tenant request-id collision without mutating the original row", async () => {
    const tenantA = await signupFinanceTenant("notification-id-a");
    const tenantB = await signupFinanceTenant("notification-id-b");
    const service = buildPlatformKernel().container.get(NOTIFICATION_SERVICE);
    const id = `${runId}-shared-request-id`;
    await service.send({
      id, tenantId: tenantA.tenantId, actorUserId: tenantA.userId, recipient: tenantA.userId,
      channel: "IN_APP", template: "security.notice", locale: "en-ZW", variables: { owner: "A" },
    });
    await expect(service.send({
      id, tenantId: tenantB.tenantId, actorUserId: tenantB.userId, recipient: tenantB.userId,
      channel: "IN_APP", template: "security.notice", locale: "en-ZW", variables: { owner: "B" },
    })).rejects.toThrow(/another tenant/);
    const [preserved] = await db.select().from(schema.notifications)
      .where(eq(schema.notifications.id, id));
    expect(preserved).toMatchObject({ tenantId: tenantA.tenantId, variables: { owner: "A" } });
  });

  it("fails closed before persistence when tenant scope is missing", async () => {
    const service = buildPlatformKernel().container.get(NOTIFICATION_SERVICE);
    await expect(service.send({
      id: `${runId}-notice-missing-tenant`,
      tenantId: " ",
      actorUserId: null,
      recipient: "owner@example.com",
      channel: "IN_APP",
      template: "security.notice",
      locale: "en-ZW",
      variables: {},
    })).rejects.toThrow(/tenantId/);
    const rows = await db.select().from(schema.notifications)
      .where(eq(schema.notifications.id, `${runId}-notice-missing-tenant`));
    expect(rows).toHaveLength(0);
  });
});
