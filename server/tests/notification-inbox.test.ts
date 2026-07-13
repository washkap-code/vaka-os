import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { login } from "../src/auth.js";
import { db, schema } from "../src/lib.js";
import { NOTIFICATION_SERVICE, buildPlatformKernel } from "../src/platform-runtime.js";
import { signupFinanceTenant } from "./finance/helpers.js";

const app = createApp();

async function createMember(tenantId: string, label: string) {
  const [tenant] = await db.select({ subdomain: schema.tenants.subdomain })
    .from(schema.tenants).where(eq(schema.tenants.id, tenantId));
  const [role] = await db.insert(schema.roles).values({
    tenantId,
    name: `Notification member ${label}`,
    permissions: ["reports.read"],
    isSystem: false,
  }).returning();
  const email = `notification-${label}-${Date.now()}@test.vaka`;
  const password = "Notification-Test-123!";
  const [user] = await db.insert(schema.users).values({
    tenantId,
    email,
    fullName: `Notification ${label}`,
    passwordHash: await bcrypt.hash(password, 4),
    roleId: role.id,
  }).returning();
  const session = await login(email, password, tenant.subdomain);
  return { userId: user.id, auth: { Authorization: `Bearer ${session.token}` } };
}

describe("P6-002 notification inbox", () => {
  it("returns only the current user's tenant-scoped in-app records with a minimized response", async () => {
    const tenantA = await signupFinanceTenant("notification-inbox-a");
    const tenantB = await signupFinanceTenant("notification-inbox-b");
    const memberA = await createMember(tenantA.tenantId, "member-a");
    const service = buildPlatformKernel().container.get(NOTIFICATION_SERVICE);
    const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    await Promise.all([
      service.send({
        id: `${runId}-owner-a`, tenantId: tenantA.tenantId, actorUserId: tenantA.userId,
        recipient: tenantA.userId, channel: "IN_APP", template: "security.notice", locale: "en-ZW",
        variables: { event: "Owner event" },
      }),
      service.send({
        id: `${runId}-member-a`, tenantId: tenantA.tenantId, actorUserId: tenantA.userId,
        recipient: memberA.userId, channel: "IN_APP", template: "security.notice", locale: "en-ZW",
        variables: { event: "Member event" },
      }),
      service.send({
        id: `${runId}-owner-b`, tenantId: tenantB.tenantId, actorUserId: tenantB.userId,
        recipient: tenantB.userId, channel: "IN_APP", template: "security.notice", locale: "en-ZW",
        variables: { event: "Other tenant event" },
      }),
      service.send({
        id: `${runId}-external-a`, tenantId: tenantA.tenantId, actorUserId: tenantA.userId,
        recipient: tenantA.userId, channel: "SMS", template: "security.notice", locale: "en-ZW",
        variables: { event: "External event" },
      }),
    ]);

    const ownerResponse = await request(app).get("/api/v1/notifications").set(tenantA.auth);
    expect(ownerResponse.status).toBe(200);
    expect(ownerResponse.headers["cache-control"]).toBe("private, no-store");
    expect(ownerResponse.body.notifications).toHaveLength(1);
    expect(ownerResponse.body.notifications[0]).toMatchObject({
      id: `${runId}-owner-a`, template: "security.notice", locale: "en-ZW",
      variables: { event: "Owner event" }, status: "accepted",
    });
    expect(Object.keys(ownerResponse.body.notifications[0]).sort()).toEqual([
      "createdAt", "id", "locale", "status", "template", "variables",
    ]);

    const memberResponse = await request(app).get("/api/v1/notifications").set(memberA.auth);
    expect(memberResponse.status).toBe(200);
    expect(memberResponse.body.notifications.map((item: { id: string }) => item.id)).toEqual([`${runId}-member-a`]);
    expect(JSON.stringify(memberResponse.body)).not.toContain(`${runId}-owner-a`);
    expect(JSON.stringify(ownerResponse.body)).not.toContain(`${runId}-owner-b`);
    expect(JSON.stringify(ownerResponse.body)).not.toContain(`${runId}-external-a`);
  });

  it("bounds list size at the API boundary", async () => {
    const tenant = await signupFinanceTenant("notification-inbox-limit");
    expect((await request(app).get("/api/v1/notifications").query({ limit: 0 }).set(tenant.auth)).status).toBe(400);
    expect((await request(app).get("/api/v1/notifications").query({ limit: 51 }).set(tenant.auth)).status).toBe(400);
    expect((await request(app).get("/api/v1/notifications").query({ limit: 10 }).set(tenant.auth)).status).toBe(200);
  });
});
