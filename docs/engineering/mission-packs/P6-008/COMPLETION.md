# P6-008 Completion Report

**Date:** 2026-07-14
**Status:** Implementation complete; local frontend and browser gates passed; remote quality and production release pending

## Delivered

- Reused the governed `LegacyField` and `LegacyModal` patterns for tenant
  Settings, owner team-member creation, Platform workforce and Platform
  security settings.
- Added persistent accessible names and associated help to the selected profile,
  company, password, MFA and workforce controls.
- Added initial/contained/returned focus, Escape close and background scroll
  locking through the existing shared modal implementation.
- Added labelled, keyboard-focusable local scroll regions around selected user,
  session, event and staff tables.
- Added semantic alert/status feedback while keeping one-time credentials out of
  logs, analytics and new storage.
- Added a Platform Admin skip target, labelled navigation, current-page state
  and semantic sign-out button.
- Migrated selected embedded strings into the typed English catalogue and
  extended the permanent accessibility conformance gate.

## Verification evidence

- Server TypeScript: passed.
- Server runtime-schema command: passed by correctly reporting that
  `DATABASE_URL` is not set; no schema was changed by this mission.
- Full server suite: attempted both sandboxed and with local database access,
  but the configured local PostgreSQL instance rejected the expected `jonomi`
  role (`28000 role does not exist`). This is an explicit local-environment
  block, not a test assertion failure attributable to the frontend change.
- Web TypeScript: passed.
- Accessibility conformance check and negative fixture: passed.
- Design-token conformance: passed with 236 governed tokens.
- Shell/navigation permission tests: 11/11 passed.
- Invoice PDF regression tests: 3/3 passed.
- Web production build: passed.
- Tenant Settings: all 11 selected controls had accessible names; both help
  texts were associated with their controls.
- Owner Users & Activity: user, session and event regions were named; the team-
   member dialog naming, initial focus, Escape, scroll lock and opener focus
  return passed; all four form controls were named.
- Platform workforce: staff region was named and locally scrollable; the staff
  dialog passed naming, initial focus, Escape, scroll lock and opener focus
  return; all 14 selected controls were named.
- Platform security: all selected controls were named; the session table region
  was named; exactly one navigation item exposed `aria-current="page"`.
- Browser reflow: document width equalled viewport width at 320 and 640 CSS
  pixels across tenant Settings and Platform workforce/security; selected grids
  stacked to one column and tables remained inside local scrolling regions.
- Browser console: no error-level logs during the selected journeys.
- `git diff --check`: passed.

## Invariants preserved

No server, schema, API, tenant, permission, audit, password policy, MFA,
credential, session lifetime, customer, stock, tax, currency, journal or
production-data behaviour changed. Existing owner-only and platform least-
privilege authority remains server-enforced.

## Remaining limits

This is not a whole-product WCAG certification, penetration test or legal,
security, privacy or localisation opinion. Platform overview/tenant/operations
tables, Reports, Billing and Imports remain later measured remediation waves.
ChiShona and isiNdebele activation, formal contrast certification, automated
browser accessibility scanning and broader device/screen-reader matrices remain
gated and require qualified review before a public certification claim.

## Release evidence

Remote checks, merge, deployment and production smoke evidence will be retained
in the PR and deployment records. Rollback requires only reverting the scoped
frontend and documentation commits.
