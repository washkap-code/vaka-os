# P6-011 — Platform Operations Evidence Accessibility

**Status:** Implementation complete; local frontend and browser gates passed; remote quality and production release pending behind P6-008 through P6-010
**Programme:** 6 — Application shell, navigation and workbench
**Type:** Frontend accessibility remediation and localisation adoption
**Depends on:** P6-001 design system; P6-005 accessibility foundation; P6-008 platform shell/workforce/settings remediation; OPS-010 through OPS-014 control-centre and backup evidence foundations

## Outcome

Authorised VAKA platform administrators can inspect aggregate commercial
signals, tenant lifecycle metadata, authorised tenant audit evidence, frozen
capability status and backup/DR evidence through named, keyboard-accessible and
mobile-safe surfaces. Evidence remains truthful and read-only; the existing
confirmed global billing action retains its current authority and safeguards.

This is a bounded WCAG 2.2-oriented presentation wave, not an accessibility
certification, operational sign-off, DR proof or production-readiness claim.

## Current behaviour

- Platform overview, tenant, audit, capability and operations-evidence tables
  are not consistently exposed as named keyboard-scrollable regions.
- Plan and growth tables do not use a local responsive scroll boundary.
- Dense control-centre evidence can compress or contribute to narrow-screen
  overflow.
- Platform load, audit and billing feedback shares one visual treatment without
  reliably distinguishing success from recoverable failure.

## Target behaviour

1. Preserve native tables while placing every selected table in a typed,
   labelled, focusable local scroll region.
2. Retain readable minimum widths for dense tenant and operations evidence
   without widening the document at 320 or 640 CSS pixels.
3. Announce platform load/audit failures as alerts and successful confirmed
   billing completion as status.
4. Keep existing permission-derived navigation, platform-only authentication,
   tenant-audit scope, confirmation and loading/empty evidence visible.
5. Add typed English accessible names and permanent conformance contracts.

## User, problem and measurable result

- **User:** Authenticated VAKA platform administrators with the relevant
  `platform.*` permissions.
- **Problem:** High-density operating evidence is harder to review safely when
  tables are unnamed, cannot be intentionally focused, or widen a mobile page.
- **Result:** Selected evidence has a distinct programmatic name, local keyboard
  scroll surface and truthful live feedback at desktop and mobile widths.
- **Measure:** Static contracts and frontend gates pass; browser inspection
  identifies every selected region; document width equals viewport width at
  320/640 CSS pixels; existing platform permission and server gates stay green.

## Permissions, audit, data and failure behaviour

- Server-derived `platform.overview.read`, `platform.tenants.read`,
  `platform.operations.read`, `platform.backups.read`,
  `platform.staff.read` and `platform.billing.run` remain authoritative.
- No tenant scope is manufactured for a platform administrator. Tenant audit
  review remains the existing authorised, tenant-ID-scoped, read-only route.
- Aggregate analytics and privacy-minimised operating signals remain unchanged;
  no business-record search, impersonation, secret display or new telemetry is
  added.
- Billing still requires its existing explicit confirmation and approved
  server permission. Cancellation makes no request; uncertain failure is shown
  and never retried automatically.
- Missing control-centre or backup evidence remains missing/open. Presentation
  must never infer healthy, restored, reviewed or launch-ready state.

## Finance and operations invariants

- No accounting event, journal, invoice, subscription amount, entitlement,
  arrears state, tenant status, backup or manifest is created or changed.
- The existing global billing endpoint and finance rules are unchanged.
- Backup manifests remain evidence inputs, not restore-test, DR or launch
  approval. Architecture/capability states remain independent exact evidence.
- No posted tenant finance/stock history is accessible for mutation.

## Finance Readiness Questions

1. **Accounting event:** None added; the existing confirmed billing command is unchanged.
2. **Journal:** No journal shape or posting service changes.
3. **Legal entity:** Existing tenant/platform boundaries remain unchanged.
4. **Currency:** Aggregate display retains existing currency values and formatting.
5. **Tax:** No tax behaviour or claim changes.
6. **Audit:** Existing billing and platform audit behaviour remains intact.
7. **Reversal:** Existing corrections remain controlled by current services.
8. **Explanation:** Exact evidence, limitations, empty states and next gates remain visible.
9. **AI:** No AI is involved.
10. **Permission:** Existing server-derived `platform.*` permissions remain mandatory.

## Localisation and mobile

- New table names and feedback use the typed English catalogue. ChiShona and
  isiNdebele activation remains gated on native and operations terminology
  review.
- Evidence scrolls within labelled local regions at 320/640 CSS pixels; cards,
  headings and confirmation controls retain existing responsive behaviour.

## Scope

- Platform overview plan, growth, subscription-billing and activity tables.
- Tenant list and selected tenant audit table.
- Capability catalogue, operations gate, manifest-field and recorded-manifest
  tables.
- Platform feedback/loading semantics, typed English copy, permanent scanner
  contracts and completion evidence.

## Out of scope

- Platform workforce/settings already covered by P6-008 and guide-document
  content/formatting.
- New platform permissions, roles, mutations, impersonation, tenant support
  access, operational actions, backup execution, restore/DR, incident controls,
  providers, infrastructure, APIs, schemas or dependencies.
- Billing, pricing, trial, dunning, entitlement or finance behaviour changes.
- Accessibility certification, penetration testing or professional operations,
  security, privacy, legal, accounting or localisation approval.

## Acceptance criteria

- Mission Pack is committed before implementation.
- All selected native tables are named focusable regions and dense evidence
  scrolls locally without page-level overflow at 320/640 CSS pixels.
- Success/failure/loading semantics are programmatically exposed without
  changing confirmation, permission, tenant or audit behaviour.
- Accessibility/design-token conformance, TypeScript, shell, invoice PDF,
  production build, browser checks, `git diff --check` and remote gates pass.

## Rollback

Revert the scoped component, catalogue, scanner and documentation changes. No
schema, data, API, tenant, billing, finance, backup or production rollback is
needed.
