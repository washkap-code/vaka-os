export type WorkspacePage =
  | "dashboard"
  | "contacts"
  | "suppliers"
  | "pipeline"
  | "invoices"
  | "products"
  | "pos"
  | "reports"
  | "imports"
  | "usersActivity"
  | "billing"
  | "upgrade"
  | "settings";

export type WorkspaceNavigationItem = {
  key: WorkspacePage;
  permission?: string;
  ownerOnly?: boolean;
};

export const workspaceNavigation: readonly WorkspaceNavigationItem[] = [
  { key: "dashboard", permission: "reports.read" },
  { key: "contacts", permission: "crm.read" },
  { key: "suppliers", permission: "inventory.read" },
  { key: "pipeline", permission: "crm.read" },
  { key: "invoices", permission: "accounting.read" },
  { key: "products", permission: "inventory.read" },
  { key: "pos", permission: "procurement.read" },
  { key: "reports", permission: "reports.read" },
  { key: "imports", permission: "imports.create" },
  { key: "usersActivity", ownerOnly: true },
  { key: "billing" },
  { key: "upgrade", permission: "billing.manage" },
  { key: "settings" },
] as const;

export function visibleWorkspaceNavigation(
  permissions: readonly string[],
  isTenantOwner: boolean,
): WorkspaceNavigationItem[] {
  const granted = new Set(permissions);
  return workspaceNavigation.filter((item) =>
    (!item.permission || granted.has(item.permission)) && (!item.ownerOnly || isTenantOwner));
}

export function resolveWorkspacePage(
  requested: WorkspacePage,
  visible: readonly WorkspaceNavigationItem[],
): WorkspacePage {
  if (visible.some((item) => item.key === requested)) return requested;
  return visible[0]?.key ?? "billing";
}
