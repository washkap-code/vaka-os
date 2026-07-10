import { describe, expect, it } from "vitest";
import request from "supertest";
import { and, eq } from "drizzle-orm";
import { createApp } from "../src/app.js";
import { db, schema } from "../src/lib.js";

const app = createApp();
const uniq = Date.now().toString(36);

async function createSettingsTenant(suffix = "") {
  const response = await request(app).post("/api/v1/auth/signup").send({
    companyName: "Original Company",
    subdomain: `settings${uniq}${suffix}`,
    baseCurrency: "USD",
    ownerEmail: `settings-${uniq}${suffix}@test.zw`,
    ownerPassword: "Settings-Password-123!",
    ownerName: "Original Owner",
    planName: "Business",
  });
  expect(response.status).toBe(200);
  return response.body;
}

describe("profile and company settings", () => {
  it("updates profile and company identity with audit evidence", async () => {
    const account = await createSettingsTenant();
    const auth = { Authorization: `Bearer ${account.token}` };

    const profile = await request(app).patch("/api/v1/profile").set(auth)
      .send({ fullName: "Updated Owner" });
    expect(profile.status).toBe(200);
    expect(profile.body.fullName).toBe("Updated Owner");

    const branding = await request(app).patch("/api/v1/settings/branding").set(auth).send({
      companyName: "Updated Company",
      logoUrl: "https://assets.example.com/company-logo.png",
      brandPrimaryColor: "#112233",
      brandSecondaryColor: "#D4A72C",
      registrationNumber: "REG-123",
      taxNumber: "BP-456",
      vatNumber: "VAT-789",
      physicalAddress: "Harare, Zimbabwe",
    });
    expect(branding.status).toBe(200);

    const me = await request(app).get("/api/v1/me").set(auth);
    expect(me.body.user.fullName).toBe("Updated Owner");
    expect(me.body.tenant).toMatchObject({
      companyName: "Updated Company",
      logoUrl: "https://assets.example.com/company-logo.png",
      brandPrimaryColor: "#112233",
      registrationNumber: "REG-123",
      physicalAddress: "Harare, Zimbabwe",
    });

    const events = await db.select().from(schema.auditLogs).where(and(
      eq(schema.auditLogs.tenantId, account.tenant.id),
      eq(schema.auditLogs.action, "settings.branding_updated"),
    ));
    expect(events).toHaveLength(1);
  });

  it("rejects unsafe or malformed branding values", async () => {
    const login = await request(app).post("/api/v1/auth/login").send({
      email: `settings-${uniq}@test.zw`,
      password: "Settings-Password-123!",
      subdomain: `settings${uniq}`,
    });
    const auth = { Authorization: `Bearer ${login.body.token}` };
    const response = await request(app).patch("/api/v1/settings/branding").set(auth).send({
      logoUrl: "javascript:alert(1)",
      brandPrimaryColor: "not-a-colour",
    });
    expect(response.status).toBe(400);
  });

  it("accepts a tenant-scoped PNG logo upload with signature and size validation", async () => {
    const account = await createSettingsTenant("upload");
    const auth = { Authorization: `Bearer ${account.token}` };
    const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
    const upload = await request(app).post("/api/v1/settings/logo").set(auth).send({ dataUrl: png });
    expect(upload.status).toBe(200);
    expect(upload.body).toMatchObject({ logoUrl: png, mediaType: "image/png", bytes: expect.any(Number) });
    const me = await request(app).get("/api/v1/me").set(auth);
    expect(me.body.tenant.logoUrl).toBe(png);
    const events = await db.select().from(schema.auditLogs).where(and(
      eq(schema.auditLogs.tenantId, account.tenant.id),
      eq(schema.auditLogs.action, "settings.logo_uploaded"),
    ));
    expect(events).toHaveLength(1);
  });
});
