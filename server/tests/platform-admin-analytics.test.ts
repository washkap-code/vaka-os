import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { loginPlatformAdminFixture, platformAdminTestPassword } from "./platform-admin-test-auth.js";
import { db, schema } from "../src/lib.js";

const app = createApp();
const password = platformAdminTestPassword;

describe("platform admin analytics", () => {
  it.skipIf(!password)("returns aggregate operating metrics without tenant detail leakage", async () => {
    const { auth: adminAuth } = await loginPlatformAdminFixture(app);
    const analytics = await request(app).get("/api/v1/platform/analytics").set(adminAuth);
    expect(analytics.status).toBe(200);
    expect(analytics.body.summary).toHaveProperty("total_tenants");
    expect(analytics.body).toHaveProperty("planMix");
    expect(analytics.body).toHaveProperty("tenantGrowth");
    expect(analytics.body).toHaveProperty("billing");
    expect(analytics.body).toHaveProperty("activity");
    expect(JSON.stringify(analytics.body)).not.toContain("passwordHash");

    const controlCenter = await request(app).get("/api/v1/platform/control-center").set(adminAuth);
    expect(controlCenter.status).toBe(200);
    expect(controlCenter.body.architecture.status).toBe("ACTIVE");
    expect(controlCenter.body.runtime.database.status).toBe("operational");
    expect(controlCenter.body).toHaveProperty("signals");
    expect(controlCenter.body).toHaveProperty("catalogue");
    expect(JSON.stringify(controlCenter.body)).not.toContain("passwordHash");

    const tenant = await request(app).post("/api/v1/auth/signup").send({
      companyName: "Analytics Boundary Test",
      subdomain: `analytics${Date.now().toString(36)}`.slice(0, 31),
      baseCurrency: "USD",
      ownerEmail: `analytics-${Date.now()}@test.zw`,
      ownerPassword: "Analytics-Test-123!",
      ownerName: "Analytics Owner",
      planName: "Starter",
    });
    expect(tenant.status).toBe(200);
    const denied = await request(app).get("/api/v1/platform/analytics")
      .set({ Authorization: `Bearer ${tenant.body.token}` });
    expect(denied.status).toBe(403);
    const controlCenterDenied = await request(app).get("/api/v1/platform/control-center")
      .set({ Authorization: `Bearer ${tenant.body.token}` });
    expect(controlCenterDenied.status).toBe(403);

    const messageId = `operator-email-failure-${Date.now()}`;
    await db.insert(schema.notifications).values({
      id: messageId,
      tenantId: tenant.body.tenant.id,
      recipient: `failed-${Date.now()}@test.vaka`,
      channel: "EMAIL",
      template: "security.user_invitation.v1",
      locale: "en-ZW",
      variables: {},
      status: "failed",
      transmitted: false,
    });
    const failures = await request(app)
      .get("/api/v1/platform/operations/email-failures/today")
      .set(adminAuth);
    expect(failures.status).toBe(200);
    expect(failures.body.timezone).toBe("UTC");
    expect(failures.body.failures).toEqual(expect.arrayContaining([
      expect.objectContaining({ messageId, source: "notification" }),
    ]));
    const failuresDenied = await request(app)
      .get("/api/v1/platform/operations/email-failures/today")
      .set({ Authorization: `Bearer ${tenant.body.token}` });
    expect(failuresDenied.status).toBe(403);
  });
});
