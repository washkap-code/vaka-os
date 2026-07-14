import { describe, expect, it } from "vitest";
import request from "supertest";
import { and, eq } from "drizzle-orm";
import { createApp } from "../src/app.js";
import { db, schema } from "../src/lib.js";

const app = createApp();
const uniq = Date.now().toString(36);

async function createSettingsTenant(suffix = "", planName = "Business") {
  const response = await request(app).post("/api/v1/auth/signup").send({
    companyName: "Original Company",
    subdomain: `settings${uniq}${suffix}`,
    baseCurrency: "USD",
    ownerEmail: `settings-${uniq}${suffix}@test.zw`,
    ownerPassword: "Settings-Password-123!",
    ownerName: "Original Owner",
    planName,
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
      invoicePaymentTerms: "Payment due within 14 days.",
      invoiceBankName: "Commercial Bank of Zimbabwe",
      invoiceBankAccountName: "Updated Company",
      invoiceBankAccountNumber: "0011223344",
      invoiceBankBranch: "Harare Main",
      invoiceBankSwiftCode: "CBZAZWHX",
      invoiceBankCurrency: "USD",
      showVatNumberOnInvoices: true,
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
      invoicePaymentTerms: "Payment due within 14 days.",
      invoiceBankName: "Commercial Bank of Zimbabwe",
      invoiceBankAccountNumber: "0011223344",
      invoiceBankCurrency: "USD",
      showVatNumberOnInvoices: true,
    });

    const events = await db.select().from(schema.auditLogs).where(and(
      eq(schema.auditLogs.tenantId, account.tenant.id),
      eq(schema.auditLogs.action, "settings.branding_updated"),
    ));
    expect(events).toHaveLength(1);
    expect(events[0].metadata).toMatchObject({
      documentPaymentDetailsChanged: true,
      changedFields: expect.arrayContaining(["invoicePaymentTerms", "invoiceBankAccountNumber"]),
    });
    expect(JSON.stringify(events[0].metadata)).not.toContain("0011223344");
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

    const bankCurrency = await request(app).patch("/api/v1/settings/branding").set(auth).send({
      invoiceBankCurrency: "EUR",
    });
    expect(bankCurrency.status).toBe(400);
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

  it("publishes an allowlisted holding page and audits tenant-controlled sign-out policy", async () => {
    const account = await createSettingsTenant("holding");
    const auth = { Authorization: `Bearer ${account.token}` };
    const configured = await request(app).patch("/api/v1/settings/holding-page").set(auth).send({
      signOutDestination: "HOLDING_PAGE",
      idleSignOutEnabled: true,
      idleSignOutMinutes: 5,
      holdingPageHeading: "Welcome to the company workspace",
      holdingPageMessage: "Sign in to continue securely.",
      holdingOfferTitle: "July customer offer",
      holdingOfferBody: "Ask our team about this month's service package.",
      holdingOfferCtaLabel: "View offer",
      holdingOfferCtaUrl: "https://example.com/offer",
    });
    expect(configured.status).toBe(200);

    const publicPage = await request(app)
      .get(`/api/v1/public/workspaces/${account.tenant.subdomain}/holding`);
    expect(publicPage.status).toBe(200);
    expect(publicPage.body).toMatchObject({
      companyName: "Original Company",
      subdomain: account.tenant.subdomain,
      heading: "Welcome to the company workspace",
      offer: { title: "July customer offer", ctaUrl: "https://example.com/offer" },
    });
    expect(publicPage.body).not.toHaveProperty("id");
    expect(publicPage.body).not.toHaveProperty("status");
    expect(publicPage.body).not.toHaveProperty("trialEndsAt");

    const me = await request(app).get("/api/v1/me").set(auth);
    expect(me.body.tenant).toMatchObject({
      signOutDestination: "HOLDING_PAGE", idleSignOutEnabled: true, idleSignOutMinutes: 5,
    });
    const events = await db.select().from(schema.auditLogs).where(and(
      eq(schema.auditLogs.tenantId, account.tenant.id),
      eq(schema.auditLogs.action, "settings.holding_page_updated"),
    ));
    expect(events).toHaveLength(1);
    expect(events[0].metadata).toMatchObject({ offerConfigured: true, offerLinkConfigured: true });
    expect(JSON.stringify(events[0].metadata)).not.toContain("July customer offer");

    const unsafe = await request(app).patch("/api/v1/settings/holding-page").set(auth).send({
      signOutDestination: "HOLDING_PAGE", idleSignOutEnabled: true, idleSignOutMinutes: 4,
      holdingPageHeading: "", holdingPageMessage: "", holdingOfferTitle: "", holdingOfferBody: "",
      holdingOfferCtaLabel: "Click", holdingOfferCtaUrl: "http://example.com/offer",
    });
    expect(unsafe.status).toBe(400);
  });

  it("keeps lower-tier campaigns platform-controlled and sign-out tenant-bound", async () => {
    const account = await createSettingsTenant("starter", "Starter");
    const auth = { Authorization: `Bearer ${account.token}` };
    const me = await request(app).get("/api/v1/me").set(auth);
    expect(me.status).toBe(200);
    expect(me.body.tenant).toMatchObject({
      planName: "Starter",
      holdingPageAdvertisingEntitled: false,
      signOutDestination: "HOLDING_PAGE",
    });

    const forbiddenCampaign = await request(app).patch("/api/v1/settings/holding-page").set(auth).send({
      signOutDestination: "HOLDING_PAGE",
      idleSignOutEnabled: false,
      idleSignOutMinutes: 5,
      holdingPageHeading: "Welcome back",
      holdingPageMessage: "Sign in to continue.",
      holdingOfferTitle: "Tenant campaign",
      holdingOfferBody: "This must not publish.",
      holdingOfferCtaLabel: "Open",
      holdingOfferCtaUrl: "https://tenant.example/offer",
    });
    expect(forbiddenCampaign.status).toBe(403);

    const clearedCampaign = await request(app).patch("/api/v1/settings/holding-page").set(auth).send({
      signOutDestination: "HOLDING_PAGE",
      idleSignOutEnabled: false,
      idleSignOutMinutes: 5,
      holdingPageHeading: "Welcome back",
      holdingPageMessage: "Sign in to continue.",
      holdingOfferTitle: "",
      holdingOfferBody: "",
      holdingOfferCtaLabel: "",
      holdingOfferCtaUrl: "",
    });
    expect(clearedCampaign.status).toBe(200);

    const saved = await request(app).patch("/api/v1/settings/holding-page").set(auth).send({
      signOutDestination: "HOLDING_PAGE",
      idleSignOutEnabled: false,
      idleSignOutMinutes: 5,
      holdingPageHeading: "Welcome back",
      holdingPageMessage: "Sign in to continue.",
    });
    expect(saved.status).toBe(200);

    await db.update(schema.tenants).set({
      holdingOfferTitle: "Retained tenant draft",
      holdingOfferBody: "Must stay hidden on Starter.",
    }).where(eq(schema.tenants.id, account.tenant.id));
    await db.insert(schema.platformHoldingAdvertSettings).values({
      key: "LOWER_TIER_DEFAULT",
      enabled: true,
      title: "VAKA platform campaign",
      body: "Available to growing businesses.",
      ctaLabel: "Learn more",
      ctaUrl: "https://www.vakaos.com/offer",
    }).onConflictDoUpdate({
      target: schema.platformHoldingAdvertSettings.key,
      set: {
        enabled: true,
        title: "VAKA platform campaign",
        body: "Available to growing businesses.",
        ctaLabel: "Learn more",
        ctaUrl: "https://www.vakaos.com/offer",
      },
    });
    try {
      const publicPage = await request(app)
        .get(`/api/v1/public/workspaces/${account.tenant.subdomain}/holding`);
      expect(publicPage.status).toBe(200);
      expect(publicPage.body.offer).toMatchObject({
        title: "VAKA platform campaign",
        ctaUrl: "https://www.vakaos.com/offer",
      });
      expect(JSON.stringify(publicPage.body)).not.toContain("Retained tenant draft");
    } finally {
      await db.update(schema.platformHoldingAdvertSettings).set({ enabled: false })
        .where(eq(schema.platformHoldingAdvertSettings.key, "LOWER_TIER_DEFAULT"));
    }
  });
});
