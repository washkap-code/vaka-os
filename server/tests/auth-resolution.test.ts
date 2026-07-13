import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { login, signupTenant } from "../src/auth.js";
import { CURRENT_PLANS, STANDARD_TRIAL_DAYS } from "../src/commercial.js";
import { db, schema } from "../src/lib.js";

const unique = () => `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;

describe("authentication account resolution", () => {
  it("selects the one account whose password matches when an email exists in multiple workspaces", async () => {
    const suffix = unique();
    const email = `shared-${suffix}@test.zw`;
    const firstPassword = "First-Workspace-123!";
    const secondPassword = "Second-Workspace-123!";
    const first = await signupTenant({
      companyName: "First Shared Login Workspace",
      subdomain: `first${suffix}`.slice(0, 31),
      baseCurrency: "USD",
      ownerEmail: email,
      ownerPassword: firstPassword,
      ownerName: "First Owner",
    });
    const second = await signupTenant({
      companyName: "Second Shared Login Workspace",
      subdomain: `second${suffix}`.slice(0, 31),
      baseCurrency: "USD",
      ownerEmail: email,
      ownerPassword: secondPassword,
      ownerName: "Second Owner",
    });

    expect((await login(email, firstPassword)).user.tenantId).toBe(first.tenant.id);
    expect((await login(email, secondPassword)).user.tenantId).toBe(second.tenant.id);
  });

  it("requires a subdomain instead of choosing arbitrarily when credentials match multiple workspaces", async () => {
    const suffix = unique();
    const email = `ambiguous-${suffix}@test.zw`;
    const password = "Shared-Workspace-123!";
    const first = await signupTenant({
      companyName: "Ambiguous First Workspace",
      subdomain: `ambfirst${suffix}`.slice(0, 31),
      baseCurrency: "USD",
      ownerEmail: email,
      ownerPassword: password,
      ownerName: "First Owner",
    });
    await signupTenant({
      companyName: "Ambiguous Second Workspace",
      subdomain: `ambsecond${suffix}`.slice(0, 31),
      baseCurrency: "USD",
      ownerEmail: email,
      ownerPassword: password,
      ownerName: "Second Owner",
    });

    await expect(login(email, password)).rejects.toMatchObject({
      status: 401,
      message: "Enter your company subdomain to select the correct workspace",
    });
    expect((await login(email, password, first.tenant.subdomain)).user.tenantId).toBe(first.tenant.id);
  });
});

describe("current commercial signup terms", () => {
  it("creates new workspaces with an exact 30-day trial", async () => {
    const suffix = unique();
    const before = Date.now();
    const { tenant } = await signupTenant({
      companyName: "Trial Duration Workspace",
      subdomain: `trial${suffix}`.slice(0, 31),
      baseCurrency: "USD",
      ownerEmail: `trial-${suffix}@test.zw`,
      ownerPassword: "Trial-Duration-123!",
      ownerName: "Trial Owner",
    });
    const after = Date.now();
    const expectedDuration = STANDARD_TRIAL_DAYS * 86_400_000;
    expect(tenant.trialEndsAt?.getTime()).toBeGreaterThanOrEqual(before + expectedDuration);
    expect(tenant.trialEndsAt?.getTime()).toBeLessThanOrEqual(after + expectedDuration);
  });

  it("keeps the seeded database catalogue aligned with the public package catalogue", async () => {
    for (const expected of CURRENT_PLANS) {
      const [plan] = await db.select().from(schema.plans).where(eq(schema.plans.name, expected.name));
      expect(plan).toMatchObject({
        name: expected.name,
        userLimit: expected.userLimit,
        priceAmount: expected.priceAmount,
      });
      expect(plan.features).toMatchObject(expected.features);
    }
  });
});
