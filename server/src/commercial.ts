export const STANDARD_TRIAL_DAYS = 30;

export const CURRENT_PLANS = [
  { name: "Starter", userLimit: 1, priceAmount: "19.00", features: { inventoryLocations: 1 } },
  { name: "Growth", userLimit: 5, priceAmount: "69.00", features: { inventoryLocations: 2, resourceCentre: true } },
  { name: "Business", userLimit: 15, priceAmount: "249.00", features: { inventoryLocations: 5, approvals: true } },
  { name: "Enterprise", userLimit: 999, priceAmount: "599.00", features: { whiteLabel: true, sla: true, customModules: true } },
] as const;

export const PLATFORM_ADMIN_EMAIL = "washington@africaprocure.com";
export const PLATFORM_ADMIN_NAME = "VAKA Platform Administrator";
