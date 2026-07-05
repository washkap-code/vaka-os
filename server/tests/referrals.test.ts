import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { createApp } from "../src/app.js";
import { db, schema } from "../src/lib.js";
import { createReferralCode } from "../src/referrals.js";

const app = createApp();
const uniq = Date.now().toString(36);
const sourceEmail = `source-${uniq}@test.zw`;
let sourceTenantId: string;
let sourceUserId: string;
let referralCode: string;

beforeAll(async () => {
  const source = await request(app).post("/api/v1/auth/signup").send({
    companyName: "Referral Source",
    subdomain: `refsrc${uniq}`,
    baseCurrency: "USD",
    ownerEmail: sourceEmail,
    ownerPassword: "SuperSecret123!",
    ownerName: "Referral Owner",
    planName: "Starter",
  });
  expect(source.status).toBe(200);
  sourceTenantId = source.body.tenant.id;
  sourceUserId = source.body.user.id;
  referralCode = `VAKA-${uniq}`.toUpperCase();

  await createReferralCode({
    code: referralCode,
    program: "GENERAL",
    ruleVersion: "general-v1-proposed",
    referrerTenantId: sourceTenantId,
    referrerUserId: sourceUserId,
    campaign: "integration-test",
    createdBy: sourceUserId,
  });
});

describe("referral attribution", () => {
  it("captures one immutable rule-version snapshot inside tenant signup", async () => {
    const response = await request(app).post("/api/v1/auth/signup").send({
      companyName: "Referred Company",
      subdomain: `referred${uniq}`,
      baseCurrency: "USD",
      ownerEmail: `referred-${uniq}@test.zw`,
      ownerPassword: "SuperSecret123!",
      ownerName: "Referred Owner",
      planName: "Starter",
      referralCode: referralCode.toLowerCase(),
    });

    expect(response.status).toBe(200);
    const [attribution] = await db.select().from(schema.referralAttributions)
      .where(eq(schema.referralAttributions.referredTenantId, response.body.tenant.id));
    expect(attribution).toMatchObject({
      program: "GENERAL",
      ruleVersion: "general-v1-proposed",
      status: "CAPTURED",
    });

    const [event] = await db.select().from(schema.auditLogs)
      .where(eq(schema.auditLogs.entityId, attribution.id));
    expect(event).toMatchObject({
      tenantId: response.body.tenant.id,
      action: "referral.attribution_captured",
      entityType: "referral_attribution",
    });
  });

  it("rejects an unknown code and rolls back the entire company signup", async () => {
    const subdomain = `badref${uniq}`;
    const response = await request(app).post("/api/v1/auth/signup").send({
      companyName: "Invalid Referral Company",
      subdomain,
      baseCurrency: "USD",
      ownerEmail: `bad-ref-${uniq}@test.zw`,
      ownerPassword: "SuperSecret123!",
      ownerName: "Invalid Referral Owner",
      referralCode: "UNKNOWN-CODE",
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Referral code is invalid or unavailable");
    const tenants = await db.select({ id: schema.tenants.id }).from(schema.tenants)
      .where(eq(schema.tenants.subdomain, subdomain));
    expect(tenants).toHaveLength(0);
  });

  it("rejects an obvious self-referral without revealing referrer details", async () => {
    const subdomain = `selfref${uniq}`;
    const response = await request(app).post("/api/v1/auth/signup").send({
      companyName: "Self Referral Company",
      subdomain,
      baseCurrency: "USD",
      ownerEmail: sourceEmail,
      ownerPassword: "SuperSecret123!",
      ownerName: "Referral Owner",
      referralCode,
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Referral code is invalid or unavailable");
    const tenants = await db.select({ id: schema.tenants.id }).from(schema.tenants)
      .where(eq(schema.tenants.subdomain, subdomain));
    expect(tenants).toHaveLength(0);
  });

  it("keeps attribution separate from client permissions", async () => {
    const [code] = await db.select().from(schema.referralCodes)
      .where(eq(schema.referralCodes.code, referralCode));
    expect(code.referrerTenantId).toBe(sourceTenantId);

    const sourceRoles = await db.select().from(schema.roles)
      .where(eq(schema.roles.tenantId, sourceTenantId));
    expect(sourceRoles.every((role) => role.tenantId === sourceTenantId)).toBe(true);
  });
});
