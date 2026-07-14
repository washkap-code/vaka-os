# P6-015 — Homepage Regression and Redesign Baseline

**Status:** Released (PR #77); local, remote, production and live-bundle gates passed
**Programme:** 6 — Application shell, navigation and workbench
**Type:** Public homepage regression, accessibility and responsive baseline
**Depends on:** P6-001 design system; approved Homepage Specification v2.0; current governed 30-day trial and package catalogue

## Outcome

VAKA can modernise its public homepage incrementally without breaking the
working sign-in and signup entry points, obscuring capability availability,
losing keyboard interaction, or introducing page-level overflow on mobile.
The baseline records current visual, bundle and browser evidence before the
first redesign wave.

This mission does not claim that the current homepage is the final design. It
creates the regression protection required by the approved Homepage Gap
Analysis before P6-016 changes composition, hierarchy and visual treatment.

## Current behaviour

- Sign-in and signup callbacks work but have no focused homepage regression gate.
- Locale selection, honest English fallback, module-tab keyboard behaviour and
  navigation targets are implemented inside the landing component rather than
  through a small independently testable model.
- Mobile menu, FAQ disclosure, availability wording and representative-data
  labels are protected only by general build and source checks.
- Responsive behaviour has been inspected manually, but no permanent homepage
  contract guards document width, touch target size or key mobile simplifications.
- No retained desktop, tablet and mobile browser evidence or bundle baseline is
  attached to a dedicated homepage Mission Pack.

## Target behaviour

1. Extract only the locale, navigation and tab-key selection rules needed for
   deterministic homepage tests without changing rendered output.
2. Add a permanent self-testing homepage gate for auth callbacks, mobile-menu
   semantics, native FAQ disclosures, locale fallback, module tabs, capability
   statuses, representative-data labels, trial copy and governed CSS contracts.
3. Keep the public page usable at 320, 640 and 1440 CSS pixels with no page-level
   horizontal overflow and with primary actions meeting the 44px target.
4. Retain screenshots and browser measurements as Mission Pack evidence rather
   than committing unstable generated images to the product bundle.
5. Record the current production bundle size as the comparison point for the
   visual redesign; do not add a new runtime dependency.
6. Preserve the exact sign-in/signup callbacks, current routes, package values,
   30-day trial, availability states and honest English fallback.

## User and measurable business result

- **Users:** Prospective customers, returning users, partners and evaluators on
  desktop, tablet, mobile, keyboard and assistive-technology paths.
- **Problem:** A visual redesign can damage conversion and trust if it breaks
  access, mobile navigation, status clarity or responsive behaviour.
- **Result:** The next design wave begins from a testable and reversible
  baseline while the live page remains fully usable.
- **Measure:** Deterministic negative-self-testing contracts pass; browser
  inspection confirms signup/sign-in, menu, tabs, FAQ and language fallback;
  page width equals viewport width at 320/640/1440 pixels; primary visible
  actions are at least 44px high; build and existing conformance gates remain green.

## Permissions, audit, data, finance and failure behaviour

- The public page remains unauthenticated and gains no business-data access.
- Sign-in and signup continue through the existing application callbacks; this
  mission adds no authentication, billing, tenant or analytics provider.
- No tenant identifier, customer data, credential, conversion event or personal
  data is stored or sent to a new destination.
- Existing local conversion events remain inert browser events; privacy-governed
  analytics integration is out of scope.
- No API, schema, price, entitlement, accounting, tax, currency, inventory,
  document, audit or production-data behaviour changes.
- Optional media or script failures must leave meaningful crawlable copy and
  working auth actions; the baseline does not introduce required external media.

## Finance Readiness Questions

1. **Accounting event:** None.
2. **Journal:** None.
3. **Legal entity:** None; this is a public presentation baseline.
4. **Currency:** Existing public USD/ZiG wording and technical ZWG explanation remain unchanged.
5. **Tax:** No tax behaviour or filing claim changes.
6. **Audit event:** None added; no material business action is introduced.
7. **Reversal:** Not applicable.
8. **Explanation:** Capability, plan, trial and representative-data labels remain explicit.
9. **AI:** VAKA AI remains a non-operational concept preview.
10. **Permission:** Existing sign-in/signup and server authority remain unchanged.

## Localisation, mobile, accessibility and AI

- English remains the verified catalogue. ChiShona and isiNdebele selections
  retain an explicit English fallback and review-in-progress notice.
- The extracted locale model must never imply that an unreviewed translation is live.
- Keyboard tab selection supports Arrow Left/Right, Home and End. Native FAQ
  disclosure and mobile navigation retain clear names, states and focus visibility.
- Browser verification covers 320, 640 and 1440 CSS pixels, reduced motion and
  representative touch targets.
- VAKA AI remains clearly labelled concept preview/not live. No AI provider,
  generated content, business data or active-looking consequential action is added.

## Scope

- `landing.tsx` behaviour-preserving extraction for deterministic helpers.
- A focused homepage test and negative self-test.
- Root/web scripts and CI adoption of the new gate.
- Permanent source contracts for selected homepage accessibility, accuracy and
  responsive behaviour.
- Local browser screenshots, measurements, bundle baseline and completion report.

## Out of scope

- Visual redesign, section reordering, new marketing claims or new imagery.
- Changing CTA destinations, trial duration, plan prices, entitlements or billing.
- Publishing unapproved legal pages, translations, customer evidence or testimonials.
- Live payroll, AI, payment, WhatsApp, banking, native-app or regulatory claims.
- Backend, API, schema, authentication, accounting, inventory or production-data changes.
- New third-party runtime, browser-test or analytics dependencies.

## Acceptance criteria

- Mission Pack is committed before implementation.
- The focused test fails its built-in negative fixture.
- Locale resolution preserves stored preference, browser preference and English fallback.
- Tab-key selection deterministically handles Arrow Left/Right, Home and End.
- Source contracts protect auth callbacks, mobile navigation, tabs, FAQ, demo
  labels, AI status, payroll status, current 30-day trial and exact package values.
- Browser smoke confirms auth entry, mobile menu, tab and FAQ interaction and
  honest language fallback without a runtime overlay or unexpected error.
- Document width equals viewport width at 320, 640 and 1440 CSS pixels; visible
  primary actions meet the governed 44px minimum.
- Homepage test, accessibility, design-token, shell, invoice-PDF, TypeScript,
  production build, `git diff --check` and applicable remote gates pass.
- Completion report records bundle and browser evidence and explicitly hands the
  protected baseline to P6-016 Homepage Visual Modernisation.

## Rollback

Revert the scoped helper, test, script, CI and documentation commits. Rendered
homepage output, APIs, schemas and production data are unchanged, so no data or
database rollback is required.
