# P6-016 — Homepage Visual Modernisation I: Navigation, Hero and Product Proof

**Status:** Defined; implementation pending
**Programme:** 6 — Application shell, navigation and workbench
**Type:** Public homepage visual, responsive and accessibility redesign
**Depends on:** P6-001 design system; P6-015 released regression baseline; approved Homepage Specification v2.0

## Outcome

Within five seconds, a first-time visitor can recognise VAKA as a modern,
credible Zimbabwe-designed business operating system, see which core modules
are available, understand that payroll and VAKA AI are not yet live, inspect a
fully visible representative product view, and begin a 30-day trial or sign in.

This is the first visible homepage design wave. It modernises the navigation,
above-the-fold hero and representative product composition. It does not claim
to finish the entire ten-section homepage programme; later measured waves will
refine the remaining section hierarchy, outcomes, trust, pricing and footer.

## Current behaviour

- The centred hero is visually strong but oversized; on common laptop heights
  much of the representative product view sits below the first viewport.
- The desktop product composition retains a narrow legacy sidebar and abstract
  panels rather than an executive overview with clear operational priorities.
- At small widths the product preview uses a 650px minimum width and negative
  translation. Page overflow is clipped, but meaningful content is cropped.
- The desktop Product navigation item scrolls directly to a section and does
  not reveal CRM, Finance, Inventory, Payroll or VAKA AI availability.
- Representative-data and not-live labels are accurate, but they are visually
  separated from the hero decision and can be missed during a quick scan.
- Preview tabs do not yet share the keyboard selection model already used by
  the lower module explorer.

## Target behaviour

1. Use an asymmetric, product-led desktop hero with a clear copy column and a
   complete product composition visible in the initial experience.
2. Stack the same content intentionally at 320 and 640 CSS pixels; never crop or
   translate a fixed-width pseudo-desktop surface beyond the viewport.
3. Add a native, keyboard-accessible Product disclosure in desktop navigation
   with visible text states for VAKA CRM, Finance, Inventory, Payroll and AI.
4. Keep mobile navigation compact, clearly named and explicit about module
   availability without creating a pointer-only nested menu.
5. Present a concise availability rail beside the hero actions: core platform
   available, Payroll coming soon and VAKA AI concept preview.
6. Recompose representative product evidence around executive metrics, an
   accessible exact-value chart, customer/stock priorities and the clearly
   non-operational VAKA AI concept.
7. Give preview tabs the shared Arrow Left/Right, Home and End model with roving
   tab order and stable tab/panel relationships.
8. Use only governed design-system tokens and the existing public compatibility
   aliases; add no raw colour, font or motion values.
9. Preserve the exact working sign-in/signup callbacks, 30-day trial, package
   values, English fallback and all live/planned distinctions.

## User and measurable business result

- **Users:** Prospective Zimbabwean business owners, returning users, diaspora
  operators, partners and evaluators across mobile, tablet and desktop.
- **Problem:** The current above-the-fold experience is credible but feels like
  an earlier SaaS composition and hides part of its best proof on smaller screens.
- **Result:** VAKA feels contemporary, ownable and enterprise-ready while the
  next action and capability truth remain immediately understandable.
- **Measure:** Browser evidence at 320/640/1024/1440 shows the complete hero
  composition without page overflow; sign-in/signup work; all module states are
  text-visible; both tab sets work by keyboard; primary actions are at least
  44px; no runtime errors occur; P6-015 contracts and remote gates remain green.

## Design-system extension

### Problem

The existing public compatibility tokens are sound, but the homepage lacks a
documented product-navigation disclosure and responsive executive product-proof
pattern. Reusing legacy card grids alone cannot provide this hierarchy.

### Existing patterns

| Pattern | Reuse | Gap addressed here |
|---|---|---|
| Public sticky navigation | Logo, auth actions, mobile drawer, focus style | Add desktop product disclosure and textual availability |
| Product preview tabs | Native buttons, tab/panel semantics, synthetic data | Add roving focus and responsive executive composition |
| Availability badges | Existing planned/sample labels | Standardise available, coming-soon and preview treatments |
| VAKA buttons | Gold, outline and dark variants | Preserve variants and 44px minimum while improving placement |

### Proposed variants and states

| Pattern | Variants | States |
|---|---|---|
| Product disclosure | Desktop popover; mobile inline availability list | Closed, open, focus-visible, selected destination |
| Availability badge | Available; coming soon; concept preview | Text always present; colour supplementary |
| Hero composition | Desktop split; tablet stack; mobile evidence stack | Default, reduced motion, long text, media-independent fallback |
| Product tab | Overview; Customers; Finance; Inventory | Selected, unselected, hover, focus-visible |
| Priority evidence | Customer; stock; payroll; AI concept | Normal, attention, unavailable/preview |

### Tokens used

- Colour: `--vaka-home-*` semantic compatibility roles and governed functional roles.
- Typography: `--vaka-font-sans`, display, heading, lead, body and label roles.
- Spacing: governed four-point `--vaka-space-*` scale where new selectors are introduced.
- Shape/elevation: governed radius and shadow roles.
- Motion: governed fast/standard durations with complete reduced-motion fallback.

### Accessibility

- Product disclosure uses native `details`/`summary`; destinations remain buttons.
- Availability never relies on colour.
- Both preview and module tabs use roving tab order and Arrow Left/Right, Home and End.
- Product evidence keeps real text for exact values and operational priorities;
  the chart retains a concise accessible name.
- Mobile content order matches reading order; no essential content requires hover.
- Visible focus, reduced motion, 200% zoom and 320px reflow remain mandatory.

## Permissions, audit, data, finance and failure behaviour

- The page remains public and receives no tenant, user, customer or credential data.
- Sign-in and signup continue through existing application callbacks; UI is not authority.
- Representative figures remain synthetic and visibly labelled; they are never
  presented as customer evidence or fetched from production records.
- No new external media, analytics or AI provider is introduced. If optional
  visual CSS fails, semantic text, statuses and auth actions remain available.
- No API, schema, authentication, plan, price, entitlement, billing, audit,
  accounting, tax, currency, inventory, document or production-data behaviour changes.

## Finance Readiness Questions

1. **Accounting event:** None.
2. **Journal:** None.
3. **Legal entity:** None; representative public content only.
4. **Currency:** Existing synthetic USD values and accurate public ZiG terminology remain.
5. **Tax:** No tax calculation, filing or approval claim changes.
6. **Audit event:** None; no material business write is introduced.
7. **Reversal:** Not applicable.
8. **Explanation:** Synthetic labels, exact display values and capability statuses remain explicit.
9. **AI:** VAKA AI remains a static concept preview and performs no retrieval or action.
10. **Permission:** Existing auth callbacks and server authority remain unchanged.

## Localisation and content

- All new visible copy is added to the typed English homepage catalogue.
- ChiShona and isiNdebele selections retain the explicit English fallback and
  native-review notice. No machine-generated translation is published.
- Stable status kinds are separate from visible English labels where needed.
- Layouts tolerate long availability text without shrinking below readable sizes.

## Scope

- Homepage navigation product disclosure and mobile availability presentation.
- Hero copy hierarchy, action placement and truthful availability rail.
- Representative product header, tabs, metrics, chart and priority evidence.
- Focused homepage model/test, catalogue, CSS and accessibility contracts.
- Desktop/tablet/mobile screenshots, browser interaction evidence and completion report.
- P6-015 final release evidence retained in the same documentation branch.

## Out of scope

- Redesigning every lower homepage section in this wave.
- Changing trial duration, package prices, plan entitlements or signup fields.
- New demo-booking, partner, referral, support, analytics or legal-policy workflows.
- Live payroll, VAKA AI, payments, WhatsApp, bank feed, mobile-app or regulatory functionality.
- Unreviewed translations, customer logos, testimonials, usage figures or performance claims.
- Backend, API, schema, authentication, accounting, inventory or production-data changes.
- New runtime or browser-test dependencies.

## Acceptance criteria

- Mission Pack is committed before implementation.
- P6-015 homepage regression test remains green and gains contracts for the new
  product disclosure, availability rail, fully responsive preview and tab model.
- Product disclosure exposes all five required modules and visible statuses.
- Sign in and all workspace CTAs preserve existing callbacks and 30-day trial wording.
- Both tab sets work with click, Arrow Left/Right, Home and End and expose one selected tab.
- The complete hero/product composition remains visible without page-level
  horizontal overflow at 320, 640, 1024 and 1440 CSS pixels.
- Primary actions meet 44px; focus is visible; reduced-motion behavior passes.
- Representative/demo, payroll coming-soon and VAKA AI concept/not-live labels are visible.
- Homepage, accessibility, design-token, shell, invoice-PDF, TypeScript,
  production build, browser checks, `git diff --check` and remote gates pass.
- Bundle growth is measured and explained; no new dependency is added.

## Rollback

Revert the scoped landing component, typed catalogue, CSS, tests and documentation
commits. Existing auth callbacks, APIs, schemas and production data remain
unchanged, so no data or database rollback is required.
