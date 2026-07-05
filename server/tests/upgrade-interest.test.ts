import { describe, expect, it } from "vitest";
import request from "supertest";
import { and, eq } from "drizzle-orm";
import { createApp } from "../src/app.js";
import { db, schema } from "../src/lib.js";

const app = createApp();
const uniq = Date.now().toString(36);

describe("tenant upgrade interest", () => {
  it("records an upgrade request without changing the subscription", async () => {
    const signup = await request(app).post("/api/v1/auth/signup").send({
      companyName: "Upgrade Test",
      subdomain: `upgrade${uniq}`,
      baseCurrency: "USD",
      ownerEmail: `upgrade-${uniq}@test.zw`,
      ownerPassword: "Upgrade-Password-123!",
      ownerName: "Upgrade Owner",
      planName: "Starter",
    });
    expect(signup.status).toBe(200);
    const auth = { Authorization: `Bearer ${signup.body.token}` };

    const requestUpgrade = await request(app).post("/api/v1/billing/upgrade-interest")
      .set(auth).send({ requestedPlan: "Growth" });
    expect(requestUpgrade.status).toBe(200);
    expect(requestUpgrade.body).toEqual({
      recorded: true,
      currentPlan: "Starter",
      requestedPlan: "Growth",
    });

    const subscription = await request(app).get("/api/v1/billing/subscription").set(auth);
    expect(subscription.body.plan.name).toBe("Starter");

    const events = await db.select().from(schema.auditLogs).where(and(
      eq(schema.auditLogs.tenantId, signup.body.tenant.id),
      eq(schema.auditLogs.action, "billing.upgrade_interest_recorded"),
    ));
    expect(events).toHaveLength(1);
  });

  it("rejects the current package as an upgrade", async () => {
    const login = await request(app).post("/api/v1/auth/login").send({
      email: `upgrade-${uniq}@test.zw`,
      password: "Upgrade-Password-123!",
      subdomain: `upgrade${uniq}`,
    });
    const response = await request(app).post("/api/v1/billing/upgrade-interest")
      .set({ Authorization: `Bearer ${login.body.token}` })
      .send({ requestedPlan: "Starter" });
    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Select a plan above your current package");
  });
});
