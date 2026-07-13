# P6-005 — Core-flow Accessibility and Reflow Foundation

**Status:** Implemented; local and browser verification passed; remote release gates pending
**Programme:** 6 — Application shell, navigation and workbench
**Type:** Frontend accessibility remediation and permanent regression guard
**Depends on:** P6-001 design system; P6-002 shell; P6-004 command palette

## Outcome

People using keyboards, screen readers, zoom, small screens, reduced motion or
forced colours can complete VAKA's authentication, customer and invoice core
journeys with the same information and actions as pointer users. Future work
receives a permanent automated accessibility guard so these guarantees do not
quietly regress.

This mission uses the current W3C Recommendation, WCAG 2.2 Level AA, and the
WAI-ARIA Authoring Practices modal-dialog pattern. It is a bounded remediation
and evidence pass, not a claim that every VAKA screen or assistive-technology
combination is certified.

## Current behaviour

- P6-001 established governed semantic tokens and accessible primitives, but
  legacy domain screens have not migrated to them in bulk.
- P6-002 and P6-004 provide semantic landmarks, a keyboard-operable mobile
  drawer and a native-dialog command palette.
- Many legacy form labels are visually present but not associated with their
  controls, so selecting a label may not focus the control and assistive
  technology may announce no useful name.
- Customer and invoice record overlays use several separate modal
  implementations. Escape support, initial focus, focus containment and focus
  return are inconsistent.
- P6-001 recorded pre-existing page-level horizontal overflow at zoom/small
  widths. Wide grids, action rows and legacy minimum sizes remain risk areas.
- The repository has design-token checks but no permanent accessibility source
  conformance command.

## Target behaviour

1. Add one small, reusable legacy-accessibility layer that associates labels,
   descriptions and errors with form controls without replacing domain logic.
2. Add one governed modal-focus hook/pattern for the customer and invoice core
   overlays: initial focus, contained Tab/Shift+Tab, Escape close, background
   scroll lock and focus return to the invoking element.
3. Migrate authentication password controls and the customer/invoice create,
   detail and edit forms in this scope to explicit accessible names. Repeating
   invoice-line controls include their line number in the accessible name.
4. Expose asynchronous errors as alerts and non-error progress/result changes
   as polite status messages without duplicative announcements.
5. Make the selected core flows reflow at 320 CSS pixels and representative
   200% zoom without page-level two-dimensional scrolling or loss of actions.
   Data tables may retain a labelled, keyboard-scrollable local region where
   their two-dimensional relationship requires it.
6. Preserve visible focus when controls sit near sticky/fixed surfaces and use
   at least the governed minimum target sizes for primary core-flow actions.
7. Preserve reduced-motion and forced-colour behavior using semantic tokens and
   system-colour fallbacks; tenant branding never replaces functional or focus
   semantics.
8. Add a self-testing `test:accessibility` source conformance command and wire
   it into the web quality workflow. It rejects the remediated surfaces if
   labels, dialog names, forbidden positive tab order, raw focus suppression or
   required responsive/accessibility contracts disappear.
9. Record manual keyboard, VoiceOver-labelled-control, 320-pixel, 200%-zoom,
   reduced-motion and forced-colour evidence. Automated checks complement but
   do not replace human evaluation.

## User and measurable business result

- **User:** Tenant and platform users completing sign-in, password recovery,
  customer maintenance and invoice preparation/review with keyboard, touch,
  zoom or assistive technology.
- **Problem:** Visible labels and overlays do not consistently expose equivalent
  programmatic structure or focus behavior, increasing error and abandonment.
- **Result:** The selected journeys have persistent accessible names, reliable
  modal focus behavior and usable small-screen reflow while preserving every
  server-side authority and financial rule.
- **Measure:** Static contracts and their negative fixture pass; keyboard and
  labelled-control checks pass; representative 320-pixel and 200%-zoom pages
  have no page-level horizontal overflow; existing tests and builds stay green.

## Trust, permissions, data and failure behaviour

- This is presentation-only work. Tenant identity, record access and mutation
  authority remain derived and enforced by existing authenticated server paths.
- Customer deletion approval, invoice draft-only editing, immutable posted
  history, tax configuration and audit behavior do not change.
- No customer, invoice, credential or financial value is logged, persisted or
  sent to a new provider by accessibility code or tests.
- Focus management must fail safely: if a preferred target is missing, focus
  moves to the dialog container; closing returns focus only when the prior
  element still exists.
- Accessibility errors never mask the existing recoverable API message. No new
  generic failure replaces a more useful governed message.

## Localisation, mobile and AI

- All new accessible names and status copy come from the typed English
  catalogue. Machine values remain independent from display language.
- Layouts tolerate text expansion; ChiShona and isiNdebele activation remains
  gated on the broader localisation framework and qualified review.
- At 320 CSS pixels forms use one readable column, modal actions remain reachable
  and local table overflow does not widen the page.
- No AI is required. Accessibility behavior is deterministic and receives no
  access to tenant data or credentials.

## Scope

- Shared legacy field association and modal-focus utilities.
- Authentication password/reset/change/sign-in controls.
- Customer create/profile/timeline overlays and invoice create/detail/preview
  overlays, including their relevant responsive CSS.
- Permanent static accessibility conformance command, negative fixture and CI
  wiring.
- Design-system usage, roadmap, mission index and completion evidence updates.

## Out of scope

- Accounting, tax, currency, ledger, stock, numbering or API behavior changes.
- Whole-product component rewrite, visual rebrand or replacement of legacy CSS.
- Accessibility certification, legal conformance opinion or exhaustive testing
  of every page, browser, screen reader and language.
- Platform-admin, Products, Purchases, Reports and Billing form migration; they
  remain follow-on remediation waves measured by the new guard.
- New dependencies, analytics, external scanners or production data operations.

## Acceptance criteria

- This Mission Pack is committed before implementation.
- Selected controls have persistent programmatic labels; errors/statuses use
  appropriate live semantics; no positive `tabIndex` or raw focus suppression
  is introduced.
- Selected dialogs are named, contain focus, close with Escape, lock background
  scroll and restore focus to their opener.
- Customer and invoice permission, deletion-approval and draft-edit rules are
  unchanged.
- Selected journeys pass keyboard checks and representative labelled-control
  inspection; 320-pixel and 200%-zoom checks show no page-level overflow or
  unreachable primary action.
- Reduced-motion and forced-colour rules remain effective and tenant colours do
  not control functional/focus states.
- `test:accessibility`, its negative fixture, shell tests, design-token checks,
  TypeScript checks, production build, `git diff --check` and remote quality
  gates pass.
- Documentation names remaining audit/certification limits explicitly and does
  not overstate conformance.

## Rollback

Revert the shared accessibility utilities, scoped form/modal migrations,
responsive styles, conformance command/CI wiring and documentation. No data,
schema, API, tenant, accounting or production database rollback is required.
