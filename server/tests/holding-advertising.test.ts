import { describe, expect, it } from "vitest";
import { canManageHoldingPageAdvertising, resolveHoldingPageAdvert } from "../src/holding-advertising.js";

const tenantAdvert = {
  title: "Tenant campaign", body: "Tenant message", ctaLabel: "Open", ctaUrl: "https://tenant.example/offer",
};
const platformAdvert = {
  enabled: true, title: "VAKA campaign", body: "Platform message", ctaLabel: "Learn more", ctaUrl: "https://www.vakaos.com/offer",
};

describe("holding-page advertising entitlements", () => {
  it("grants tenant campaign control only through the explicit plan feature", () => {
    expect(canManageHoldingPageAdvertising({ holdingPageAdvertising: true })).toBe(true);
    expect(canManageHoldingPageAdvertising({ holdingPageAdvertising: false })).toBe(false);
    expect(canManageHoldingPageAdvertising({})).toBe(false);
    expect(canManageHoldingPageAdvertising(null)).toBe(false);
  });

  it("publishes the tenant campaign for entitled plans", () => {
    expect(resolveHoldingPageAdvert({
      planFeatures: { holdingPageAdvertising: true }, tenantAdvert, platformAdvert,
    })).toEqual({ advert: tenantAdvert, source: "TENANT", tenantManaged: true });
  });

  it("publishes only the governed platform campaign for lower tiers", () => {
    expect(resolveHoldingPageAdvert({ planFeatures: {}, tenantAdvert, platformAdvert }))
      .toEqual({ advert: platformAdvert, source: "PLATFORM", tenantManaged: false });
  });

  it("shows no campaign when the applicable source is disabled or empty", () => {
    expect(resolveHoldingPageAdvert({
      planFeatures: {}, tenantAdvert, platformAdvert: { ...platformAdvert, enabled: false },
    }).advert).toBeNull();
    expect(resolveHoldingPageAdvert({
      planFeatures: { holdingPageAdvertising: true },
      tenantAdvert: { title: null, body: null, ctaLabel: null, ctaUrl: null },
      platformAdvert,
    }).advert).toBeNull();
  });
});
