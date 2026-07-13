import type { WorkspaceNavigationItem, WorkspacePage } from "./navigation";

export type WorkbenchAction = {
  page: WorkspacePage;
  labelKey: "contacts" | "invoices" | "products" | "pipeline";
};

const ACTIONS: readonly WorkbenchAction[] = [
  { page: "invoices", labelKey: "invoices" },
  { page: "contacts", labelKey: "contacts" },
  { page: "products", labelKey: "products" },
  { page: "pipeline", labelKey: "pipeline" },
];

export function visibleWorkbenchActions(
  navigation: readonly WorkspaceNavigationItem[],
): WorkbenchAction[] {
  const visiblePages = new Set(navigation.map((item) => item.key));
  return ACTIONS.filter((action) => visiblePages.has(action.page));
}

export function safeChartPercent(value: number, values: readonly number[]): number {
  const maximum = Math.max(0, ...values.map((candidate) => Math.abs(candidate)));
  if (!Number.isFinite(value) || maximum === 0) return 0;
  return Math.min(100, Math.max(0, (Math.abs(value) / maximum) * 100));
}

export function openPipelineDeals(rows: readonly { n: string | number }[]): number {
  return rows.reduce((total, row) => {
    const count = Number(row.n);
    return total + (Number.isFinite(count) && count > 0 ? count : 0);
  }, 0);
}
