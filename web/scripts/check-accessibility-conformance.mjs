import { readFile } from "node:fs/promises";

function lineNumber(source, offset) {
  return source.slice(0, offset).split("\n").length;
}

export function accessibilityIssues(file, source) {
  const issues = [];
  const checks = [
    { label: "positive tab order", pattern: /tabIndex\s*=\s*\{?["']?[1-9]\d*/g },
    { label: "focus indicator suppressed", pattern: /outline\s*:\s*(?:["']\s*)?(?:0|none)\b/gi },
    { label: "unnamed modal dialog", pattern: /role=["']dialog["'](?![^>]*(?:aria-label|aria-labelledby))/g },
  ];
  for (const check of checks) {
    for (const match of source.matchAll(check.pattern)) {
      issues.push(`${file}:${lineNumber(source, match.index ?? 0)} ${check.label}: ${match[0]}`);
    }
  }
  return issues;
}

function requireContract(issues, file, source, expected) {
  if (!source.includes(expected)) issues.push(`${file} missing required accessibility contract: ${expected}`);
}

const selfTest = accessibilityIssues(
  "self-test.tsx",
  '<div role="dialog"><button tabIndex={2} style={{ outline: "none" }}>Broken</button></div>',
);
if (selfTest.length !== 3) {
  throw new Error(`Accessibility scanner self-test failed: expected 3 issues, received ${selfTest.length}`);
}

const files = [
  "src/App.tsx",
  "src/styles.css",
  "src/landing.css",
  "src/accessibility/legacy-field.tsx",
  "src/accessibility/legacy-modal.tsx",
  "src/accessibility/use-modal-focus.ts",
  "src/design-system/primitives.tsx",
  "src/shell/workspace-shell.tsx",
  "src/platform/platform-admin-shell.tsx",
  "src/shell/command-palette.tsx",
  "src/procurement/procurement-workspace.tsx",
];
const sources = new Map();
const issues = [];
for (const file of files) {
  const source = await readFile(file, "utf8");
  sources.set(file, source);
  issues.push(...accessibilityIssues(file, source));
}

const app = sources.get("src/App.tsx");
const styles = sources.get("src/styles.css");
const landing = sources.get("src/landing.css");
const field = sources.get("src/accessibility/legacy-field.tsx");
const modal = sources.get("src/accessibility/legacy-modal.tsx");
const focus = sources.get("src/accessibility/use-modal-focus.ts");
const primitives = sources.get("src/design-system/primitives.tsx");
const platformShell = sources.get("src/platform/platform-admin-shell.tsx");
const procurement = sources.get("src/procurement/procurement-workspace.tsx");

for (const expected of ["htmlFor={id}", '"aria-describedby": describedBy', '"aria-invalid": error ? true']) {
  requireContract(issues, "src/accessibility/legacy-field.tsx", field, expected);
}
for (const expected of ['role="dialog"', 'aria-modal="true"', "aria-labelledby={labelledBy}", "onKeyDown={onKeyDown}"]) {
  requireContract(issues, "src/accessibility/legacy-modal.tsx", modal, expected);
}
for (const expected of ['event.key === "Escape"', 'event.key !== "Tab"', 'document.body.style.overflow = "hidden"', "returnFocus?.isConnected", "!activeIsFocusable"]) {
  requireContract(issues, "src/accessibility/use-modal-focus.ts", focus, expected);
}
for (const expected of ['aria-label={ariaLabel}', 'event.key === "Escape"', 'document.addEventListener("pointerdown", closeOutside)', 'closest("button, a")']) {
  requireContract(issues, "src/design-system/primitives.tsx", primitives, expected);
}
for (const expected of [
  '<LegacyField label={appEnglish.auth.authenticationCode}>',
  '<LegacyField label={copy.name}>',
  'labelledBy="new-contact-title"',
  'labelledBy="customer-timeline-title"',
  'labelledBy="new-invoice-title"',
  'labelledBy="invoice-record-title"',
  'labelledBy="invoice-preview-title"',
  'ariaLabel={appEnglish.invoices.actionsFor.replace',
  'className="invoice-action-menu"',
  'role="group" aria-label={copy.recordActions}',
  'className="invoice-line-card"',
  'customersState.error && <div className="invoice-resource-state danger" role="alert">',
  'labelledBy="new-deal-title"',
  'labelledBy="new-product-title"',
  'labelledBy="reorder-rule-title"',
  'labelledBy="platform-staff-dialog-title"',
  'labelledBy="add-team-member-title"',
  "const copy = appEnglish.products;",
  'aria-label={copy.listLabel} tabIndex={0}',
  "data-modal-initial-focus",
  'aria-label={copy.staffTableLabel} tabIndex={0}',
  'aria-label={copy.sessionsTableLabel} tabIndex={0}',
  'aria-label={copy.usersTableLabel} tabIndex={0}',
  'aria-label={copy.eventsTableLabel} tabIndex={0}',
  'className="table-scroll access-table-region"',
  '<LegacyField label={appEnglish.settings.companyName}>',
  'className="brand-colour-control"',
  '<LegacyField label={pickerLabel}>',
  'error={valid ? undefined : invalidMessage}',
  'aria-labelledby="warehouse-settings-title"',
  'aria-label={copy.capacityLabel}',
  '<LegacyField label={copy.name} hint={copy.nameHelp}>',
  '<LegacyField label={copy.address} hint={copy.addressHelp}>',
  '<LegacyField label={copy.fullName}>',
  'role={messageTone === "error" ? "alert" : "status"}',
  'role="tablist" aria-label={reportsCopy.navigation}',
  'role="tab" aria-selected={tab === t}',
  'aria-controls={`report-panel-${t}`}',
  'role="tabpanel" id="report-panel-pl"',
  'role="status">{reportsCopy.loading}',
  'aria-label={reportsCopy.profitLossTableLabel} tabIndex={0}',
  'aria-label={reportsCopy.balanceSheetTableLabel} tabIndex={0}',
  'aria-label={reportsCopy.agedReceivablesTableLabel} tabIndex={0}',
  'aria-label={copy.evidenceTableLabel} tabIndex={0}',
  'aria-label={copy.invoicesTableLabel} tabIndex={0}',
  'role="group" aria-label={copy.actions}',
  'event.key === "ArrowRight"',
  'className="import-workspace"',
  'labelledBy="capture-review-title"',
  'aria-label={copy.captureListLabel} tabIndex={0}',
  'aria-disabled={captureReviewBusy}',
  'aria-label={copy.importPreviewTableLabel} tabIndex={0}',
  'aria-label={copy.savedReconciliationsTableLabel} tabIndex={0}',
  'aria-label={copy.bankTransactionsTableLabel} tabIndex={0}',
  'htmlFor="new-bank-account-name"',
  'htmlFor="reconciliation-closing-balance"',
  'aria-describedby="import-schema-help"',
  'aria-label={copy.captureReviewActions}',
  'aria-label={copy.bankLineActions.replace',
  'showStatus(copy.captureReady)',
  'showError(copy.csvOnly)',
]) requireContract(issues, "src/App.tsx", app, expected);

for (const expected of [
  'role="tablist" aria-label={copy.workspaceSections}',
  'role="tab" aria-selected={tab === key}',
  'labelledBy="new-requisition-title"',
  'labelledBy="requisition-decision-title"',
  'labelledBy="issue-rfq-title"',
  'labelledBy="award-rfq-title"',
  'labelledBy="new-direct-po-title"',
  'labelledBy="approve-po-title"',
  'labelledBy="receive-po-title"',
  'labelledBy="supplier-bill-title"',
  '<LegacyField label={copy.product}>',
  '<LegacyField label={copy.warehouse}>',
  '<LegacyField label={copy.purchaseOrder}>',
  'aria-labelledby="supplier-analytics-title"',
  '<LegacyField label={copy.from}>',
  '<LegacyField label={copy.supplier}>',
  'role="region" aria-label={label} tabIndex={0}',
  'className={`supplier-analytics-reconciliation ${ties ? "ties" : "difference"}`}',
  'role="status" aria-live="polite"',
  'className="supplier-bill-select"',
  "data-modal-initial-focus",
  'role="alert"',
]) requireContract(issues, "src/procurement/procurement-workspace.tsx", procurement, expected);

for (const expected of [
  'href="#platform-main"',
  'aria-label={labels.navigation}',
  'aria-current={currentPage === item.key ? "page" : undefined}',
  'aria-expanded={drawerOpen}',
  'aria-controls="platform-admin-mobile-drawer"',
  'role="dialog" aria-modal="true"',
  'event.key === "Escape"',
  'event.key !== "Tab"',
  'document.body.style.overflow = "hidden"',
  'drawerCloseRef.current?.focus()',
  'menuButtonRef.current?.focus()',
]) requireContract(issues, "src/platform/platform-admin-shell.tsx", platformShell, expected);

for (const expected of [
  ":where(a, button, input, select, textarea, [tabindex]):focus-visible",
  "grid-template-columns: minmax(0, 1fr)",
  "max-height: 94dvh",
  ".procurement-line-fields",
  ".supplier-analytics-filters",
  ".supplier-analytics-exposure-grid",
  "@media (max-width: 420px)",
  ".access-table-region table",
  ".report-tabs .btn { min-height: var(--vaka-control-height-md); }",
  ".report-tabs [role=\"tab\"][aria-selected=\"true\"]",
  ".import-workspace .btn.btn { min-height: var(--vaka-control-height-md); }",
  ".import-workspace .import-summary",
  ".capture-review-modal",
  ".invoice-table { min-width: 62rem; table-layout: fixed; }",
  ".invoice-action-menu[open] .vds-dropdown-menu",
  ".invoice-line-grid { align-items: end; display: grid;",
  ".invoice-record-actions { background: var(--vaka-workspace-info-surface);",
  ".brand-colour-control { background: var(--vaka-workspace-surface-subtle);",
  ".warehouse-card-grid { display: grid;",
  ".warehouse-settings-heading, .warehouse-load-error, .warehouse-card-heading",
  "@media (forced-colors: active)",
  "@media (prefers-reduced-motion: reduce)",
]) requireContract(issues, "src/styles.css", styles, expected);
requireContract(issues, "src/landing.css", landing, "overflow-x: clip");

if (issues.length) {
  console.error("Accessibility conformance failed:\n" + issues.map((issue) => `- ${issue}`).join("\n"));
  process.exit(1);
}
console.log(`Accessibility conformance passed for ${files.join(" and ")}; negative self-test remains active.`);
