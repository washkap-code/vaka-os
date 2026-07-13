# P6-008 — Settings and Access Administration Accessibility

**Status:** Approved for implementation
**Programme:** 6 — Application shell, navigation and workbench
**Type:** Frontend accessibility remediation and design-system adoption
**Depends on:** P6-001 design system; P6-005 legacy field and modal patterns; P9-008 account recovery, MFA and platform workforce

## Outcome

Tenant owners and authorised VAKA administrators can manage company settings,
workspace users, sessions, their own security and VAKA workforce profiles with
keyboard, touch, zoom and assistive technology using the governed field, dialog
and local-table patterns established by P6-005. The selected workflows remain
usable at 320 CSS pixels without changing authentication, authority, audit or
credential behaviour.

This mission follows the latest W3C-recommended WCAG 2.2 baseline and the WAI-
ARIA Authoring Practices guidance for modal dialogs and tabular information. It
is a bounded accessibility wave, not a whole-product accessibility
certification.

## Current behaviour

- Tenant and platform settings use visible labels that are not consistently
  associated with their controls.
- Owner team-member creation and platform workforce editing use separate legacy
  overlays without consistent focus containment, Escape close, scroll locking
  or opener focus return.
- User, staff and session tables are not consistently labelled or keyboard-
  scrollable local regions.
- Success and failure feedback is visually presented but not consistently
  announced with appropriate live semantics.
- Platform Admin navigation uses a non-semantic sign-out link and does not
  expose current-page state or a skip target.
- Some selected user-facing strings remain embedded in the component instead
  of the typed English catalogue.

## Target behaviour

1. Reuse `LegacyField` and `LegacyModal`; do not introduce competing form or
   modal abstractions.
2. Associate every selected visible label, hint and error with its control.
3. Give owner team-member and platform workforce dialogs visible titles,
   programmatic names, initial focus, contained Tab/Shift+Tab, Escape close,
   background scroll lock and opener focus return.
4. Present selected user, session, event and staff tables as labelled,
   focusable local scrolling regions while preserving native table semantics.
5. Announce recoverable errors as alerts and successful operations as status
   messages without exposing temporary credentials to logs or analytics.
6. Give Platform Admin a keyboard skip target, labelled navigation, current-
   page state and a semantic sign-out button.
7. Keep forms, modal actions and table regions operable without page-level
   horizontal overflow at 320 and 640 CSS pixels.
8. Move selected embedded copy into the typed English catalogue, keeping API
   values and permission keys locale-independent.
9. Extend permanent conformance checks so regressions in the selected dialog,
   field, table-region and navigation contracts fail locally and in CI.

## User and measurable business result

- **Users:** Accountable tenant owners, authorised tenant administrators and
  authorised VAKA operational administrators.
- **Problem:** High-trust administration is harder to understand and operate
  when labels, focus, state and locally scrolling data are inconsistent.
- **Result:** Selected controls have persistent accessible names, selected
  dialogs use one predictable focus model, state changes are announced and
  administrative records remain usable on narrow screens.
- **Measure:** Static negative-self-testing contracts pass; browser inspection
  finds no unnamed selected controls; keyboard dialog and navigation behaviour
  passes; document width equals viewport width at 320 and 640 CSS pixels; all
  existing quality gates remain green.

## Permissions, audit, data and failure behaviour

- Tenant identity, platform identity and all permissions continue to come from
  authenticated server context. Navigation visibility is never authority.
- Owner-only user administration and platform least-privilege staff rules are
  unchanged and remain server-enforced.
- Password change, temporary password, MFA enrolment, recovery-code, session
  revocation and sign-out routes and audit behaviour are unchanged.
- No password, MFA secret, recovery code or one-time password is written to
  logs, analytics, new storage or a third-party provider by this mission.
- Existing API failures remain visible to the initiating user. Presentation
  improvements do not retry consequential actions automatically.
- Company identity changes retain their existing tenant scope and API/audit
  behaviour. No customer, financial, stock or ledger data is changed.

## Localisation, mobile and AI

- Migrated copy is added to the typed English catalogue. ChiShona and
  isiNdebele activation remains gated on the localisation framework and
  qualified language review.
- Forms tolerate text expansion and use a single readable column at 320 CSS
  pixels; native tables retain a labelled local horizontal scroll region.
- No AI is involved. Deterministic authentication, permission, session,
  credential and audit rules remain authoritative.

## Scope

- Tenant Settings profile, branding and company identity fields and feedback.
- Owner Users & Activity user/session/event tables and team-member dialog.
- Platform Admin shell navigation and sign-out semantics.
- Platform workforce staff table and create/edit dialog.
- Platform self-service profile, password, MFA and session settings.
- Typed English catalogue, responsive CSS, conformance scanner coverage and
  completion evidence.

## Out of scope

- Authentication protocol, password policy, MFA cryptography, secret delivery,
  session lifetime or recovery-flow changes.
- New platform roles, permission grants, impersonation, deletion, approval or
  audit policy.
- Platform overview, tenant, operations, billing and guide table-wide
  remediation; these remain later measured waves.
- New settings fields, provider integrations, schema/API migrations,
  production data operations or a visual rebrand.
- Accessibility certification, penetration testing or professional security,
  privacy, localisation or regulatory approval.

## Acceptance criteria

- Mission Pack is committed before implementation.
- Selected fields, hints, dialogs, messages, navigation and tables expose
  correct names, roles, values and focus behaviour.
- Selected forms and dialogs reflow without page-level overflow at 320/640 CSS
  pixels; tables scroll only inside labelled local regions.
- Tenant and platform permissions, password/MFA/session behaviour, credential
  handling and audit effects are unchanged.
- Accessibility and design-token conformance, TypeScript, shell and invoice PDF
  regressions, web production build, browser checks, `git diff --check` and
  remote quality gates pass.

## Rollback

Revert the scoped component, catalogue, CSS, scanner and documentation changes.
No schema, data, API, permission, session or credential rollback is needed.
