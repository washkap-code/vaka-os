import assert from "node:assert/strict";
import test from "node:test";
import { resolveWorkspacePage, visibleWorkspaceNavigation } from "../src/shell/navigation.ts";
import { notificationCopy } from "../src/shell/notification-copy.ts";
import { openPipelineDeals, safeChartPercent, visibleWorkbenchActions } from "../src/shell/workbench-model.ts";
import { parseWorkspaceSearchResponse, workspaceSearchTarget } from "../src/shell/command-search-model.ts";

const notificationCatalogue = {
  lowStockTitle: "Low stock", lowStockDetail: "{name}: {onHand}/{threshold}",
  deliverySentTitle: "Sent", deliverySentDetail: "{documentType} to {recipientName}",
  deliveryFailedTitle: "Failed", deliveryFailedDetail: "{documentType} to {recipientName}",
  securityTitle: "Security", securityDetail: "Security detail",
  genericTitle: "Workspace update", genericDetail: "Generic safe detail",
  stockItem: "Stock item", unknownAmount: "unknown", document: "Document", recipient: "recipient",
};

test("workspace navigation exposes only permitted domains", () => {
  const navigation = visibleWorkspaceNavigation(["crm.read", "billing.manage"], false);
  assert.deepEqual(navigation.map((item) => item.key), ["contacts", "pipeline", "billing", "upgrade", "settings"]);
});

test("owner-only activity stays hidden from non-owners and visible to owners", () => {
  assert.equal(visibleWorkspaceNavigation([], false).some((item) => item.key === "usersActivity"), false);
  assert.equal(visibleWorkspaceNavigation([], true).some((item) => item.key === "usersActivity"), true);
});

test("a forbidden current page falls back to the first visible destination", () => {
  const navigation = visibleWorkspaceNavigation(["inventory.read"], false);
  assert.equal(resolveWorkspacePage("dashboard", navigation), "products");
  assert.equal(resolveWorkspacePage("pos", navigation), "pos");
});

test("billing and settings remain available without domain permissions", () => {
  assert.deepEqual(visibleWorkspaceNavigation([], false).map((item) => item.key), ["billing", "settings"]);
});

test("workbench actions expose only destinations already permitted by the shell", () => {
  const navigation = visibleWorkspaceNavigation(["reports.read", "crm.read", "inventory.read"], false);
  assert.deepEqual(visibleWorkbenchActions(navigation).map((action) => action.page), ["contacts", "products", "pipeline"]);
});

test("workbench chart geometry is bounded and handles empty or invalid values", () => {
  assert.equal(safeChartPercent(50, [50, 100]), 50);
  assert.equal(safeChartPercent(-100, [50, -100]), 100);
  assert.equal(safeChartPercent(Number.NaN, [50]), 0);
  assert.equal(safeChartPercent(0, []), 0);
});

test("workbench open-deal count ignores malformed and negative evidence", () => {
  assert.equal(openPipelineDeals([{ n: "2" }, { n: 3 }, { n: "unknown" }, { n: -4 }]), 5);
});

test("known notifications use only their catalogue-owned display fields", () => {
  const formatted = notificationCopy({
    id: "one", template: "inventory.low_stock", locale: "en-ZW", status: "accepted", createdAt: "2026-07-13",
    variables: { name: "Cooking Oil", onHand: "2", threshold: "5", secret: "must-not-render" },
  }, notificationCatalogue);
  assert.deepEqual(formatted, { title: "Low stock", detail: "Cooking Oil: 2/5" });
  assert.equal(JSON.stringify(formatted).includes("must-not-render"), false);
});

test("unknown notifications never expose arbitrary persisted variables", () => {
  const formatted = notificationCopy({
    id: "two", template: "future.template", locale: "en-ZW", status: "accepted", createdAt: "2026-07-13",
    variables: { bearerToken: "private-value", personalData: "private-name" },
  }, notificationCatalogue);
  assert.deepEqual(formatted, { title: "Workspace update", detail: "Generic safe detail" });
});

test("workspace search accepts only governed minimal result documents", () => {
  const [result] = parseWorkspaceSearchResponse({ results: [{
    id: "customer-one", entityType: "customer", title: "Mbare Traders",
    document: { id: "customer-one", entityType: "customer", name: "Mbare Traders", contactType: "COMPANY", secret: "excluded" },
    object: { key: "customer", fallbackLabel: "Customer", navigation: { section: "crm", recordView: "customer" } },
  }, {
    id: "broken", entityType: "invoice", title: "Broken",
    document: { id: "another-record", entityType: "invoice" },
    object: { key: "invoice", fallbackLabel: "Invoice", navigation: { section: "accounting", recordView: "invoice" } },
  }] });
  assert.equal(result.id, "customer-one");
  assert.equal(JSON.stringify(result).includes("excluded"), false);
});

test("workspace search maps only the governed object and destination pair", () => {
  const [result] = parseWorkspaceSearchResponse({ results: [{
    id: "invoice-one", entityType: "invoice", title: "INV-00001",
    document: { id: "invoice-one", entityType: "invoice", number: "INV-00001", status: "ISSUED", currency: "USD", total: "125.00", customerName: "Acme" },
    object: { key: "invoice", fallbackLabel: "Invoice", navigation: { section: "accounting", recordView: "invoice" } },
  }] });
  assert.deepEqual(workspaceSearchTarget(result), { page: "invoices", entityType: "invoice", recordId: "invoice-one" });
  assert.equal(workspaceSearchTarget({ ...result, object: { ...result.object, navigation: { section: "crm", recordView: "invoice" } } }), null);
});
