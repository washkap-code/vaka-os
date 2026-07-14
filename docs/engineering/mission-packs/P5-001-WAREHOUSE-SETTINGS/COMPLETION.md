# P5-001 Warehouse Settings Completion Report

**Date:** 2026-07-14
**Status:** Implementation and local static/browser verification complete; isolated DB suite and remote merge gates pending

## Delivered

- Added a tenant-scoped Settings read model over the canonical `warehouses`,
  `subscriptions` and `plans` records. It reports the current package, used
  locations, finite remaining capacity or an explicit contract-scaled state.
- Enforced the governed Starter/Growth/Business location allowances of 1/2/5
  on both the existing inventory create endpoint and the new Settings create
  endpoint. The transaction locks the tenant before checking and inserting, so
  simultaneous requests cannot exceed a finite allowance.
- Preserved Enterprise as contract-scaled rather than inventing a self-service
  fixed limit. Tenant-specific Enterprise contract overrides remain staged.
- Added optional location naming with deterministic fallback to the first
  non-empty address line, bounded input validation, case-insensitive duplicate
  rejection and compatibility for existing name-only API clients.
- Added tenant-safe name/address amendment and atomic selection of one default
  location. Deletion is deliberately unavailable, so no stock history or
  referenced record can be removed through Settings.
- Added transactional audit recording through the Platform Audit service and a
  transaction-scoped adapter, preserving all-or-nothing location/audit effects.
- Added a responsive Settings surface with loading, permission, empty,
  retry/error, busy, success, at-limit and over-limit states. Product, stock,
  invoice and procurement selectors continue to consume the same canonical
  location rows.
- Replaced the two raw brand colour fields with labelled picker-plus-hex
  controls, role descriptions, inline validation and a light/dark-aware company
  preview. Tenant colours remain limited to the existing brand compatibility
  slots and do not replace functional status colours.
- Added typed English copy, frontend access/contrast model tests and permanent
  accessibility/design-token source contracts.

## Behaviour and invariant evidence

- Tenant identity is derived from authenticated server context and every
  location query includes the tenant ID.
- Reads accept the existing `inventory.read` route or authorised Settings
  access; location writes require `settings.manage` or `inventory.write` on the
  new surface, while the legacy create route keeps its existing
  `inventory.write` contract.
- Finite package capacity is read from server-side plan feature JSON; the
  browser does not submit or decide an allowance.
- A rejected allowance, permission, validation or cross-tenant request creates
  no warehouse or audit row.
- Downgrade/excess behavior preserves all current locations and stock records;
  it blocks only additional creation.
- No stock movement, stock level, journal, finance, numbering, tax, currency,
  notification, search or production data behavior changed.

## Files changed

- `server/src/warehouse-settings.ts`
- `server/src/routes.ts`
- `server/src/platform/audit-facade.ts`
- `server/tests/warehouse-settings.test.ts`
- `web/src/App.tsx`
- `web/src/settings/warehouse-settings-model.ts`
- `web/src/locales/app.en.ts`
- `web/src/styles.css`
- `web/scripts/warehouse-settings-model.test.mjs`
- `web/scripts/check-accessibility-conformance.mjs`
- `web/package.json`
- `docs/engineering/mission-packs/P5-001-WAREHOUSE-SETTINGS/README.md`
- `docs/02-product/PRICING-AND-PACKAGING.md`
- `knowledge-system/13-roadmaps/MASTER-BUILD-PLAN.md`
- `CHANGELOG.md`

## Verification evidence

- Server TypeScript: passed.
- Web TypeScript: passed.
- Warehouse settings frontend model: 2/2 passed.
- Accessibility conformance and negative self-test: passed.
- Design-token conformance: passed with 236 governed tokens.
- Web production build: passed; the existing main-bundle size warning remains.
- Desktop browser inspection: colour roles/hex values, three location cards,
  capacity and create workflow rendered without overlap or clipping.
- 320-pixel browser inspection: colour inputs and location cards stacked to one
  column; action buttons expanded to practical full-width touch targets; no
  text/control overlap was observed.
- `git diff --check`: passed after implementation and completion documentation.
- Isolated DB preparation was attempted first without and then with
  `NODE_ENV=test`. The guard correctly refused because no explicit
  `DATABASE_URL` is configured. Consequently the new DB-backed capacity,
  tenant, RBAC, audit, concurrency and downgrade tests, and the full server
  suite, remain mandatory hosted-CI gates; no unguarded fallback was used.

## Production migration

None. This mission adds no table, column, index, constraint, enum or data
migration. It uses the existing `warehouses`, `plans` and `subscriptions`
schema. There is no production DDL to hand-apply, and no production database
command was run.

## Risks and remaining gates

- Enterprise package capacity is shown as contracted but is not yet resolved
  from tenant-specific contract/override persistence. Until the governed
  entitlement catalogue ships, Enterprise location creation is not given an
  invented fixed cap.
- Complete plan versioning, grandfathering, add-ons and downgrade remediation
  remain part of the staged entitlement architecture. This mission safely
  preserves over-limit data and blocks only further creation.
- The browser verification used a local representative state because this
  workspace has no isolated application database. Authenticated end-to-end and
  DB concurrency evidence must pass hosted CI before merge.
- ChiShona and isiNdebele activation remains gated on the localisation
  framework and qualified language review. This mission adds structured English
  catalogue copy only.
- This is a scoped Settings improvement, not a whole-product WCAG or contrast
  certification.

## Rollback

Revert the implementation commit. Do not delete locations created while the
feature is enabled. Existing canonical locations and every historical stock or
procurement reference remain intact; there is no schema or data rollback.

## Next mission

After hosted DB gates and merge, continue the authorised sequence without
overtaking the pending finance branch: complete the P5-003 PR/merge, then begin
P2-004 effective-dated exchange-rate register work from a fresh, green main.
