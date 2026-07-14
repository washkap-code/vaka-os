export type HoldingAdvert = {
  title: string | null;
  body: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
};

type PlatformHoldingAdvert = HoldingAdvert & { enabled: boolean };

export function canManageHoldingPageAdvertising(features: unknown): boolean {
  return Boolean(features && typeof features === "object"
    && !Array.isArray(features)
    && (features as Record<string, unknown>).holdingPageAdvertising === true);
}

function configured(advert: HoldingAdvert | null | undefined): HoldingAdvert | null {
  if (!advert || (!advert.title && !advert.body)) return null;
  return advert;
}

export function resolveHoldingPageAdvert(input: {
  planFeatures: unknown;
  tenantAdvert: HoldingAdvert;
  platformAdvert: PlatformHoldingAdvert | null | undefined;
}): { advert: HoldingAdvert | null; source: "TENANT" | "PLATFORM" | "NONE"; tenantManaged: boolean } {
  const tenantManaged = canManageHoldingPageAdvertising(input.planFeatures);
  if (tenantManaged) {
    const advert = configured(input.tenantAdvert);
    return { advert, source: advert ? "TENANT" : "NONE", tenantManaged };
  }
  const advert = input.platformAdvert?.enabled ? configured(input.platformAdvert) : null;
  return { advert, source: advert ? "PLATFORM" : "NONE", tenantManaged };
}
