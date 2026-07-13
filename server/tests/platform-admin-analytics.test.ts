import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

const app = createApp();
const password = process.env.PLATFORM_ADMIN_PASSWORD;

describe("platform admin analytics", () => {
  it.skipIf(!password)("returns aggregate operating metrics without tenant detail leakage", async () => {
    const adminLogin = await request(app).post("/api/v1/auth/login").send({
      email: "washington@africaprocure.com", password,
    });
    expect(adminLogin.status).toBe(200);
    const adminAuth = { Authorization: `Bearer ${adminLogin.body.token}` };
    if (adminLogin.body.user.mustChangePassword) {
      const changed = await request(app).post("/api/v1/auth/change-password").set(adminAuth).send({
        currentPassword: password,
        newPassword: "CI-Only-Replacement-Password-2026",
      });
      expect(changed.status).toBe(200);
    }
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
  });
});
