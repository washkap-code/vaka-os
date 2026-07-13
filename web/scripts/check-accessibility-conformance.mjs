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
  "src/shell/workspace-shell.tsx",
  "src/shell/command-palette.tsx",
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

for (const expected of ["htmlFor={id}", '"aria-describedby": describedBy', '"aria-invalid": error ? true']) {
  requireContract(issues, "src/accessibility/legacy-field.tsx", field, expected);
}
for (const expected of ['role="dialog"', 'aria-modal="true"', "aria-labelledby={labelledBy}", "onKeyDown={onKeyDown}"]) {
  requireContract(issues, "src/accessibility/legacy-modal.tsx", modal, expected);
}
for (const expected of ['event.key === "Escape"', 'event.key !== "Tab"', 'document.body.style.overflow = "hidden"', "returnFocus?.isConnected"]) {
  requireContract(issues, "src/accessibility/use-modal-focus.ts", focus, expected);
}
for (const expected of [
  '<LegacyField label={appEnglish.auth.authenticationCode}>',
  '<LegacyField label={copy.name}>',
  'labelledBy="new-contact-title"',
  'labelledBy="customer-timeline-title"',
  'labelledBy="new-invoice-title"',
  'labelledBy="invoice-record-title"',
  'labelledBy="invoice-preview-title"',
  'labelledBy="new-deal-title"',
  'labelledBy="new-product-title"',
  'labelledBy="reorder-rule-title"',
  'labelledBy="new-purchase-order-title"',
  'labelledBy="platform-staff-dialog-title"',
  'labelledBy="add-team-member-title"',
  "const copy = appEnglish.products;",
  "const copy = appEnglish.purchaseOrders;",
  'aria-label={copy.listLabel} tabIndex={0}',
  'className="purchase-line-create"',
  'copy.line.replace("{number}", String(i + 1))',
  'aria-label={copy.lineField.replace',
  "data-modal-initial-focus",
  "copy.lineField.replace",
  'href="#platform-main"',
  'aria-label={copy.navigation}',
  'aria-current={tab === "settings" ? "page" : undefined}',
  'className="side-signout"',
  'aria-label={copy.staffTableLabel} tabIndex={0}',
  'aria-label={copy.sessionsTableLabel} tabIndex={0}',
  'aria-label={copy.usersTableLabel} tabIndex={0}',
  'aria-label={copy.eventsTableLabel} tabIndex={0}',
  '<LegacyField label={appEnglish.settings.companyName}>',
  '<LegacyField label={copy.fullName}>',
  'role={messageTone === "error" ? "alert" : "status"}',
  'role="tablist" aria-label={reportsCopy.navigation}',
  'role="tab" aria-selected={tab === t}',
  'aria-controls={`report-panel-${t}`}',
  'role="tabpanel" id="report-panel-pl"',
  'aria-label={reportsCopy.profitLossTableLabel} tabIndex={0}',
  'aria-label={reportsCopy.balanceSheetTableLabel} tabIndex={0}',
  'aria-label={reportsCopy.agedReceivablesTableLabel} tabIndex={0}',
  'aria-label={copy.evidenceTableLabel} tabIndex={0}',
  'aria-label={copy.invoicesTableLabel} tabIndex={0}',
  'role="group" aria-label={copy.actions}',
  'event.key === "ArrowRight"',
]) requireContract(issues, "src/App.tsx", app, expected);

for (const expected of [
  ":where(a, button, input, select, textarea, [tabindex]):focus-visible",
  "grid-template-columns: minmax(0, 1fr)",
  "max-height: 94dvh",
  ".purchase-line-create",
  ".report-tabs [role=\"tab\"][aria-selected=\"true\"]",
  "@media (forced-colors: active)",
  "@media (prefers-reduced-motion: reduce)",
]) requireContract(issues, "src/styles.css", styles, expected);
requireContract(issues, "src/landing.css", landing, "overflow-x: clip");

if (issues.length) {
  console.error("Accessibility conformance failed:\n" + issues.map((issue) => `- ${issue}`).join("\n"));
  process.exit(1);
}
console.log(`Accessibility conformance passed for ${files.join(" and ")}; negative self-test remains active.`);
