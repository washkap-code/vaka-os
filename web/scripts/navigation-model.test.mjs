import assert from "node:assert/strict";
import test from "node:test";
import { resolveWorkspacePage, visibleWorkspaceNavigation } from "../src/shell/navigation.ts";
import { notificationCopy } from "../src/shell/notification-copy.ts";
import { openPipelineDeals, safeChartPercent, visibleWorkbenchActions } from "../src/shell/workbench-model.ts";
import { parseWorkspaceSearchResponse, workspaceSearchTarget } from "../src/shell/command-search-model.ts";
import { filterPlatformTenants, visiblePlatformAdminPages } from "../src/platform/platform-admin-model.ts";
import { idleSignOutPhase, normalizeIdleSignOutMinutes } from "../src/shell/idle-signout-model.ts";
import {
  BLACKBOOK_CATEGORIES, blackbookDetailValues, parseBlackbookEntries, parseBlackbookEntry,
} from "../src/blackbook/blackbook-model.ts";
import { appEnglish } from "../src/locales/app.en.ts";

const notificationCatalogue = {
  lowStockTitle: "Low stock", lowStockDetail: "{name}: {onHand}/{threshold}",
  deliverySentTitle: "Sent", deliverySentDetail: "{documentType} to {recipientName}",
  deliveryFailedTitle: "Failed", deliveryFailedDetail: "{documentType} to {recipientName}",
  securityTitle: "Security", securityDetail: "Security detail",
  procurementApprovalTitle: "Approval needed", procurementApprovalDetail: "{kind} {reference}",
  procurementRequisition: "Requisition", procurementPurchaseOrder: "Purchase order", procurementReference: "record",
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
  assert.equal(resolveWorkspacePage("dashboard", navigation), "suppliers");
  assert.equal(resolveWorkspacePage("pos", navigation), "suppliers");
  assert.equal(resolveWorkspacePage("pos", visibleWorkspaceNavigation(["procurement.read"], false)), "pos");
});

test("billing and settings remain available without domain permissions", () => {
  assert.deepEqual(visibleWorkspaceNavigation([], false).map((item) => item.key), ["billing", "settings"]);
});

test("Black Book navigation fails closed without its feature and needs no extra role permission", () => {
  assert.equal(visibleWorkspaceNavigation([], false).some((item) => item.key === "blackbook"), false);
  assert.equal(visibleWorkspaceNavigation([], false, ["blackbook.directory"])
    .some((item) => item.key === "blackbook"), true);
  assert.equal(resolveWorkspacePage("blackbook", visibleWorkspaceNavigation([], false)), "billing");
});

test("platform administration navigation exposes only authorised operating areas", () => {
  assert.deepEqual(visiblePlatformAdminPages(["platform.tenants.read", "platform.staff.read"]), ["tenants", "staff", "settings", "guide"]);
  assert.deepEqual(visiblePlatformAdminPages([]), ["settings", "guide"]);
});

test("platform tenant filtering narrows only already-authorised results", () => {
  const tenants = [
    { company_name: "Waskap Advisory", subdomain: "waskap", plan: "Build", status: "TRIAL" },
    { company_name: "Africa Procurement Group", subdomain: "africaprocure", plan: "Scale", status: "ACTIVE" },
  ];
  assert.deepEqual(filterPlatformTenants(tenants, "WASKAP", "all"), [tenants[0]]);
  assert.deepEqual(filterPlatformTenants(tenants, "", "ACTIVE"), [tenants[1]]);
  assert.deepEqual(filterPlatformTenants(tenants, "Scale", "TRIAL"), []);
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

test("procurement approval notifications expose only bounded catalogue copy", () => {
  const formatted = notificationCopy({
    id: "approval", template: "procurement.approval_requested.v1", locale: "en-ZW", status: "accepted", createdAt: "2026-07-14",
    variables: { kind: "purchase_requisition", reference: "PR-00001", supplierTaxNumber: "must-not-render" },
  }, notificationCatalogue);
  assert.deepEqual(formatted, { title: "Approval needed", detail: "Requisition PR-00001" });
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

test("workspace search maps the canonical supplier projection to procurement", () => {
  const [result] = parseWorkspaceSearchResponse({ results: [{
    id: "supplier-one", entityType: "supplier", title: "Mbare Supply",
    document: { id: "supplier-one", entityType: "supplier", name: "Mbare Supply", contactType: "COMPANY", supplierCode: "SUP-001", supplierCurrency: "USD" },
    object: { key: "supplier", fallbackLabel: "Supplier", navigation: { section: "procurement", recordView: "supplier" } },
  }] });
  assert.deepEqual(workspaceSearchTarget(result), { page: "suppliers", entityType: "supplier", recordId: "supplier-one" });
});

test("workspace search maps only a governed Black Book entry descriptor", () => {
  const [result] = parseWorkspaceSearchResponse({ results: [{
    id: "zimra", entityType: "blackbook", title: "Zimbabwe Revenue Authority",
    document: {
      id: "zimra", entityType: "blackbook", key: "zimra", name: "Zimbabwe Revenue Authority",
      category: "regulator", verified: true, lastReviewed: "2026-07-15", sources: ["must-not-render"],
    },
    object: { key: "blackbook", fallbackLabel: "Black Book", navigation: { section: "blackbook", recordView: "entry" } },
  }] });
  assert.deepEqual(workspaceSearchTarget(result), { page: "blackbook", entityType: "blackbook", recordId: "zimra" });
  assert.equal(JSON.stringify(result).includes("must-not-render"), false);
  assert.equal(workspaceSearchTarget({
    ...result,
    object: { ...result.object, navigation: { section: "settings", recordView: "entry" } },
  }), null);
});

test("Black Book response parsing accepts only canonical categories and supported payload fields", () => {
  const summary = {
    key: "zimra", category: "regulator", name: "Zimbabwe Revenue Authority",
    verified: true, lastReviewed: "2026-07-15", currentVersion: 2,
  };
  assert.deepEqual(parseBlackbookEntries([summary, { ...summary, category: "unknown" }]), [summary]);
  const detail = parseBlackbookEntry({
    ...summary,
    payload: { id: "zimra", website: "https://www.zimra.co.zw/", notes: "Official authority", invented: "ignore" },
    sources: ["https://www.zimra.co.zw/"],
    notice: "Server fallback notice",
  });
  assert.ok(detail);
  assert.deepEqual(blackbookDetailValues(detail.payload), [
    { key: "website", value: "https://www.zimra.co.zw/" },
    { key: "notes", value: "Official authority" },
  ]);
  assert.equal(BLACKBOOK_CATEGORIES.every((category) => Boolean(appEnglish.blackbook.categories[category])), true);
});

test("idle sign-out policy enforces the minimum, warning and expired phases", () => {
  assert.equal(normalizeIdleSignOutMinutes(1), 5);
  assert.equal(normalizeIdleSignOutMinutes(30.9), 30);
  assert.equal(normalizeIdleSignOutMinutes(999), 480);
  assert.equal(idleSignOutPhase(600_000, 539_999), "ACTIVE");
  assert.equal(idleSignOutPhase(600_000, 540_000), "WARNING");
  assert.equal(idleSignOutPhase(600_000, 600_000), "EXPIRED");
  assert.equal(idleSignOutPhase(600_000, 900_000), "EXPIRED");
});
