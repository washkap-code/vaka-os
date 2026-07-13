export type WorkspacePage =
  | "dashboard"
  | "contacts"
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
  label: string;
  permission?: string;
  ownerOnly?: boolean;
};

export const workspaceNavigation: readonly WorkspaceNavigationItem[] = [
  { key: "dashboard", label: "Dashboard", permission: "reports.read" },
  { key: "contacts", label: "Contacts", permission: "crm.read" },
  { key: "pipeline", label: "Sales Pipeline", permission: "crm.read" },
  { key: "invoices", label: "Invoices", permission: "accounting.read" },
  { key: "products", label: "Products & Stock", permission: "inventory.read" },
  { key: "pos", label: "Purchase Orders", permission: "inventory.read" },
  { key: "reports", label: "Reports", permission: "reports.read" },
  { key: "imports", label: "Imports", permission: "imports.create" },
  { key: "usersActivity", label: "Users & Activity", ownerOnly: true },
  { key: "billing", label: "Billing & Plan" },
  { key: "upgrade", label: "Upgrade", permission: "billing.manage" },
  { key: "settings", label: "Settings" },
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
