export type PlatformAdminPage = "overview" | "tenants" | "operations" | "staff" | "settings" | "guide";

const platformAdminDestinations: ReadonlyArray<{ key: PlatformAdminPage; permission?: string }> = [
  { key: "overview", permission: "platform.overview.read" },
  { key: "tenants", permission: "platform.tenants.read" },
  { key: "operations", permission: "platform.operations.read" },
  { key: "staff", permission: "platform.staff.read" },
  { key: "settings" },
  { key: "guide" },
];

export function visiblePlatformAdminPages(permissions: readonly string[]): PlatformAdminPage[] {
  const granted = new Set(permissions);
  return platformAdminDestinations
    .filter((destination) => !destination.permission || granted.has(destination.permission))
    .map((destination) => destination.key);
}

export function filterPlatformTenants<T extends { company_name: string; subdomain: string; plan: string | null; status: string }>(
  tenants: readonly T[],
  queryValue: string,
  status: string,
): T[] {
  const query = queryValue.trim().toLocaleLowerCase();
  return tenants.filter((tenant) => {
    const matchesStatus = status === "all" || tenant.status === status;
    const matchesQuery = !query || [tenant.company_name, tenant.subdomain, tenant.plan ?? ""]
      .some((value) => value.toLocaleLowerCase().includes(query));
    return matchesStatus && matchesQuery;
  });
}
