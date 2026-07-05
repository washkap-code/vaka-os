# VAKA Homepage Gap Analysis

**Status:** Implementation planning baseline
**Specification reviewed:** `HOMEPAGE-SPEC.md` v2.0
**Implementation reviewed:** `web/src/landing.tsx`, `web/src/landing.css`, `web/src/App.tsx`, `web/src/main.tsx`, and `web/index.html`
**Audit date:** 2026-07-04

## 1. Executive summary

The current VAKA homepage already expresses much of the VAKA vision well. It has a premium dark/warm-light/gold visual direction, a confident Zimbabwe-first hero, connected-product storytelling, responsive behavior, honest VAKA AI preview language, working signup/sign-in entry points, trust content, pricing, FAQ, and a strong final CTA.

It should not be discarded.

The implementation was built around the previous sixteen-part homepage specification. The approved v2.0 specification now requires a ten-section story:

1. Hero
2. Why VAKA exists
3. Built first for Zimbabwe
4. Business outcomes
5. Product modules
6. VAKA AI
7. Trust and security
8. Pricing
9. FAQ
10. Final CTA

The main work is therefore controlled reorganisation, copy alignment, product-status clarity, component extraction, and localisation—not a blind visual rebuild.

## 2. Current implementation snapshot

### Current page sequence

1. Navigation
2. Hero
3. Capability strip
4. Built for Zimbabwe
5. Problem statement
6. Connected operating system
7. Outcome cards
8. VAKA AI
9. Product experience tabs
10. Why VAKA exists
11. Trust
12. Proof before promises
13. Pricing
14. FAQ
15. Final CTA
16. Footer

### Current implementation characteristics

- `Landing` is isolated from the authenticated application through `onLogin` and `onSignup`.
- Homepage styling is isolated through `.v-*` classes in `landing.css`.
- The page is responsive at 1050px, 760px, and 460px breakpoints.
- English copy is partly stored in a keyed `EN` object.
- Many arrays, demo strings, labels, FAQs, and accessibility strings remain hard-coded.
- Language selection persists, detects Shona/Ndebele browser preferences, and falls back honestly to English.
- VAKA AI is explicitly labelled as preview/not live.
- Pricing values are duplicated from backend seed data.
- Analytics events are dispatched locally but no analytics adapter consumes them.

## 3. What already matches the VAKA vision

### Brand and positioning

- **VAKA** is treated as the master brand and **VAKA OS** as the product.
- The exact tagline **“The Operating System for African Business.”** is the stable hero heading.
- Zimbabwe-first positioning is prominent.
- The story explains that VAKA means “build.”
- The page avoids African clichés, generic maps, safari imagery, and cheap startup aesthetics.
- Copy is generally confident, concise, and outcome-led.

### Visual direction

- Deep graphite, warm off-white, and restrained gold match the approved brand direction.
- Large responsive typography creates confidence.
- Generous spacing keeps the page premium rather than cluttered.
- Motion is restrained and respects `prefers-reduced-motion`.
- Product-like visuals are used instead of stock photography or generic laptop mockups.

### Product story

- CRM, finance, inventory, reporting, and AI direction are visible.
- The fragmented-tools problem is explained clearly.
- The workflow visual supports the “operating system” category.
- Current outcome cards lead with business value rather than technical features.
- VAKA AI uses the approved calm, executive voice.

### Trust and accuracy

- AI is labelled as a preview and not presented as live.
- ChiShona and isiNdebele are not falsely presented as complete.
- No customer testimonials, logos, ratings, or adoption statistics are invented.
- No unsupported ZIMRA, payroll, bank, fiscalisation, or offline claims are made.
- Tenant isolation, permissions, auditability, and export claims reflect current architecture.
- Legal templates are not linked as approved public policies.

### Interaction and responsive behavior

- Start Free and Sign In preserve existing application callbacks.
- Mobile navigation exists and keeps the primary CTA visible.
- Product tabs and native FAQ disclosures work without backend changes.
- Semantic sections, skip link, visible focus, and reduced-motion behavior provide a useful accessibility foundation.

### SEO baseline

- Unique title
- Meta description
- Canonical URL
- Open Graph baseline
- Twitter card type
- `SoftwareApplication` structured data
- Semantic hero and section headings

## 4. Gap summary

| Area | Current state | Required direction |
|---|---|---|
| Story structure | Earlier 16-part sequence | Consolidated 10-section v2.0 sequence |
| Hero copy | CRM/finance/inventory-focused | Include accounting, payroll, and operations as platform scope with honest status |
| CTAs | Start Free / Explore VAKA | Open free workspace plus real demo or early-access path |
| Why VAKA | Late in page | Immediately after hero |
| Outcomes | Four outcomes | Six required outcomes |
| Modules | Overview/CRM/Finance/Inventory/AI tabs | CRM, Finance, Inventory, Payroll, Operations, AI with availability states |
| Payroll | Absent | Coming Soon, never implied live |
| Operations | Implied, undefined | Define scope before presenting as module |
| AI | Strong preview section | Align example and “Preview — coming soon” language |
| Trust | Four trust cards | Add verified backup/recovery, reliability, support, responsible AI, approved links |
| Localisation | Partial key map and fallback | Typed catalogues covering all visible copy and metadata |
| Design tokens | Local provisional variables | Approved semantic colour, type, space, motion, and component tokens |
| Analytics | Custom browser events only | Privacy-governed adapter and complete conversion taxonomy |
| Required states | Mostly static happy path | Loading, failure, service-unavailable, media, and JS-reduced states |
| Testing | Manual build/browser checks | Automated visual, interaction, accessibility, localisation, and performance regression |

## 5. What is missing

### Navigation

- Accessible Product dropdown
- Availability labels for CRM, Finance, Inventory, Payroll, and AI
- Scroll-state treatment
- Complete mobile-drawer focus management and Escape behavior
- Active section state, if retained

### Hero

- Exact v2.0 supporting copy
- Explicit VAKA master-brand treatment in the hero
- Payroll and operations represented as future/platform scope rather than omitted
- A real **Open your free VAKA workspace** CTA label
- A genuine **Book a demo** or **Join early access** destination
- Approved synthetic/demo label visible to sighted users
- Customer/pipeline component in the product composition
- Payroll status marked Coming Soon
- Operations context
- Clearer distinction between demo data and live customer data

### Why VAKA exists

The content exists but is in the wrong position. It must become section 2, directly after the hero.

### Built first for Zimbabwe

Existing cards cover:

- USD + ZiG
- local business reality
- remote visibility
- connected records
- language direction
- growth

Missing or underdeveloped:

- Zimbabwean tax/statutory readiness with careful qualification
- explicit Africa country-expansion architecture
- stronger local workflow examples

### Business outcomes

Current cards:

- Win more customers
- Know where your money goes
- Never lose track of stock
- Make better decisions

Required additions/changes:

- Rename finance outcome to **Get paid faster**
- Add **Stay compliant**
- Add **Let VAKA AI assist your business**
- Use approved product fragments rather than abstract bars
- Mark future-linked outcomes accurately

### Product modules

Missing:

- VAKA Payroll — Coming Soon
- VAKA Operations — scope to be defined
- Explicit module availability badges
- Actual live-product evidence for CRM, Finance, and Inventory
- Connected data-flow explanation inside the section
- Approved product screenshots or reusable product preview components

### VAKA AI

Missing:

- Exact v2.0 example answer
- Strong visible label: **VAKA AI Preview — coming soon**
- Suggested prompts, if retained from earlier direction
- Clear source/grounding treatment in representative UI
- Failure/unavailable state

Live AI interaction should remain deferred until the AI architecture, permissions, privacy, audit, evaluation, and cost controls exist.

### Trust and security

Missing:

- verified backup and recovery statement;
- reliability/availability explanation;
- support channel and ownership;
- responsible AI statement;
- approved Security page;
- approved Privacy page;
- approved Terms page;
- approved Data Processing page; and
- account-ownership explanation.

Do not fill these gaps with unsupported claims or links to draft templates.

### Pricing

Missing:

- distinct primary outcome per plan;
- explicit included live modules;
- upcoming module labels;
- governed pricing source shared with billing;
- CTA/programme consistency with “free workspace,” demo, and early access.

### FAQ

Missing required question:

- **Does VAKA include payroll?**

Existing language question should use **ChiShona** and **isiNdebele** consistently.

### Footer

Missing:

- Payroll
- Pricing
- Data Processing state/link
- Solutions group
- Resources group
- About and Careers states

Only add actual destinations. Omit or label unavailable pages clearly.

### Cross-cutting

- Complete localisation catalogues
- Translated metadata
- Approved ChiShona and isiNdebele
- Formal WCAG 2.2 AA audit
- Core Web Vitals baseline
- Social sharing image
- Favicon/application icons
- JavaScript-reduced/prerendered homepage
- Loading/service-unavailable behavior
- Analytics governance and implementation
- Automated regression tests

## 6. What should be rewritten

“Rewrite” here means targeted replacement within the existing homepage architecture—not replacing the application.

### 6.1 Hero copy block

Replace the current supporting copy:

> Run your customers, sales, finance and inventory from one intelligent platform…

with the approved direction:

> Run your customers, sales, accounting, inventory, payroll and operations from one intelligent platform.

Payroll must be visibly marked as Coming Soon in the supporting product composition and module section so the hero is not misleading.

Replace generic **Start free** with the approved **Open your free VAKA workspace** only after confirming that the current three-month trial is correctly described as a free workspace.

Do not add **Book a demo** or **Join early access** until each has a functioning destination and owned follow-up process.

### 6.2 Homepage sequence

Reorder and consolidate:

- Move Why VAKA directly after Hero.
- Keep Built for Zimbabwe as section 3.
- Fold useful problem/connected-system content into Business Outcomes and Product Modules.
- Consolidate product tabs and connected workflow into the Product Modules section.
- Fold “Proof before promises” into Trust or an approved proof component rather than keeping it as an extra top-level section.

### 6.3 Outcome content model

Replace the four-card model with the six approved outcomes.

Each outcome needs:

- title;
- concise promise;
- supporting live/future module;
- availability state;
- approved interface fragment; and
- accessibility label.

### 6.4 Product module model

Replace the current five-tab `ProductTab` type with a module model that supports:

- module name;
- availability;
- outcome;
- evidence/preview;
- up to three capabilities;
- connection to other modules; and
- CTA if applicable.

The new model must include Payroll and Operations without implying they are live.

### 6.5 Localisation implementation

The page-local `EN` object is a useful prototype but not the final architecture.

Rewrite into:

- typed locale keys;
- independent `en`, `sn`, and `nd` catalogues;
- locale provider/hook;
- all arrays translated by key;
- metadata localisation strategy;
- missing-key tests; and
- explicit review status.

### 6.6 Demo product preview

Retain the visual shell but replace:

- “Live” with “Demo” or “Representative data”;
- hard-coded fictional business data with a governed synthetic fixture;
- static abstract bars with approved module fragments;
- ambiguous AI actions with clearly non-operational preview controls.

### 6.7 Pricing data

Replace duplicated frontend plan constants with a governed source:

- safe public pricing contract;
- generated shared configuration; or
- approved build-time content.

Do not expose internal billing behavior or require authentication merely to display public pricing.

### 6.8 Analytics helper

Replace direct `window.dispatchEvent` calls with a privacy-aware analytics interface that can:

- be disabled;
- enforce an approved event schema;
- avoid personal data;
- attach section/item identity;
- track signup completion across the auth boundary; and
- support consent/retention requirements.

## 7. What should not be rewritten

Preserve:

- `App.tsx` auth gating and current login/signup callbacks;
- backend routes and contracts;
- accounting, inventory, billing, and tenant behavior;
- `.v-*` homepage namespace;
- dark/warm-light/gold direction;
- responsive navigation concept;
- semantic section structure;
- working FAQ disclosure behavior;
- reduced-motion support;
- honest language fallback;
- honest AI preview state;
- current pricing names and values until the governed source replaces them;
- SEO baseline; and
- the existing homepage as a deployable fallback during incremental work.

## 8. Sections to add, move, or consolidate

| v2.0 section | Action | Source/reuse |
|---|---|---|
| Hero | Rewrite copy and composition | Reuse `.v-hero`, CTA callbacks, `ProductPreview` shell |
| Why VAKA exists | Move | Reuse current `.v-story` content and visual |
| Built first for Zimbabwe | Improve | Reuse capability grid; add qualified statutory/Africa expansion content |
| Business outcomes | Rewrite | Reuse outcome-card pattern; expand four to six |
| Product modules | Consolidate/add | Merge workflow and product tabs; add Payroll/Operations/status badges |
| VAKA AI | Improve | Reuse current AI section and conversation |
| Trust and security | Expand | Reuse trust grid; add verified operational/legal items |
| Pricing | Improve | Reuse plan cards; govern data and module status |
| FAQ | Improve | Reuse native details; add payroll and terminology updates |
| Final CTA | Improve copy/CTA state | Reuse dark section and auth callback |

### Extra current sections

- **Capability strip:** keep as a hero subcomponent, not a numbered section.
- **Problem statement:** retain its strongest content inside Business Outcomes.
- **Connected workflow:** retain inside Product Modules.
- **Product experience tabs:** become the Product Modules interaction.
- **Proof before promises:** fold into Trust until approved customer proof exists.

## 9. Components needed

### Page composition

- `VakaHomepage`
- `HomepageSection`
- `SectionHeading`

### Navigation

- `HomepageNavigation`
- `ProductMenu`
- `MobileMenu`
- `AvailabilityBadge`

### Hero

- `HomepageHero`
- `HeroActions`
- `VakaProductComposition`
- `DemoDataBadge`
- `CapabilityStrip`

### Content

- `VakaStory`
- `ZimbabweFirst`
- `BusinessOutcomes`
- `OutcomeCard`
- `ProductModules`
- `ModuleSelector`
- `ModulePreview`
- `ConnectedWorkflow`
- `VakaAiPreview`
- `TrustGrid`
- `ProofDisclosure`
- `PricingGrid`
- `PricingCard`
- `FaqList`
- `FinalCta`
- `HomepageFooter`

### Platform utilities

- `LocaleProvider`
- `useLocale`
- typed locale catalogues
- `AnalyticsProvider` or adapter
- responsive media/image component
- client availability/status hook if approved
- public pricing client if approved

Components should be extracted incrementally with visual-parity tests. Do not create a new component library before the page’s repeated patterns justify it.

## 10. Copy changes

### Hero

| Current | Required |
|---|---|
| “Built first for Zimbabwe” eyebrow | Keep or use as supporting context |
| “The Operating System for African Business.” | Keep |
| CRM/sales/finance/inventory description | Replace with approved accounting/payroll/operations copy, paired with availability labels |
| “USD and ZiG…” | Move to Zimbabwe section or keep as supporting proof |
| “Start free” | Change to “Open your free VAKA workspace” only after programme validation |
| “Explore VAKA” | Replace with functioning Book a demo or Join early access, or keep until those exist |

### Zimbabwe section

Change heading to:

> **Designed around your business reality.**

Retain USD/ZiG, remote visibility, and connected-record copy. Add qualified Zimbabwean tax/statutory readiness and Africa-expansion language.

### Outcomes

Use exact approved outcome headings:

- Win more customers
- Get paid faster
- Never lose track of stock
- Stay compliant
- Make better decisions
- Let VAKA AI assist your business

### Modules

Add:

- VAKA Payroll — Coming Soon
- VAKA Operations — scope/availability to be defined

Retain:

- VAKA CRM — Available now
- VAKA Finance — Available now
- VAKA Inventory — Available now
- VAKA AI — Preview / Coming Soon

### AI

Use:

> **VAKA AI Preview — coming soon**

Update the example to the approved overdue-invoice response. Do not show an active-looking “View receivables” control unless it is visibly part of a non-interactive demo.

### Trust

Add verified copy for:

- backups and recovery;
- reliability;
- support;
- responsible AI; and
- account/data ownership.

Do not write these claims until engineering/operations can substantiate them.

### FAQ

Add:

> **Does VAKA include payroll?**

Answer:

> Payroll is planned and is not yet available in the live product. It will require Zimbabwean PAYE and NSSA review before release.

### Terminology consistency

- Use **accounting** in the hero as specified.
- Use **ChiShona** and **isiNdebele** in customer-facing copy.
- Use **ZiG** publicly and preserve **ZWG** as the technical currency code where required.
- Avoid customer-facing use of “tenant.”

## 11. Design-system tokens required

The homepage currently defines useful provisional variables, but hard-coded values remain throughout the CSS. The next system should consume semantic tokens from the approved Colour System and Typography documents.

### 11.1 Colour tokens

```css
--color-ink-950
--color-ink-900
--color-ink-800
--color-paper-50
--color-paper-100
--color-paper-200
--color-border-subtle
--color-text-primary
--color-text-secondary
--color-text-on-dark
--color-text-muted-dark
--color-gold-300
--color-gold-500
--color-gold-700
--color-success
--color-warning
--color-error
--color-information
```

### 11.2 Typography tokens

```css
--font-family-brand
--font-family-body
--font-family-mono
--type-display-xl
--type-display-lg
--type-heading-1
--type-heading-2
--type-heading-3
--type-lead
--type-body
--type-small
--type-label
--leading-tight
--leading-body
--tracking-display
--tracking-label
```

### 11.3 Spacing and layout tokens

```css
--space-1
--space-2
--space-3
--space-4
--space-6
--space-8
--space-12
--space-16
--space-24
--section-space-block
--content-max-width
--reading-max-width
--grid-gutter
--nav-height
```

### 11.4 Shape and elevation tokens

```css
--radius-control
--radius-card
--radius-panel
--radius-pill
--shadow-card
--shadow-panel
--shadow-hero-product
--border-default
--border-strong
```

### 11.5 Motion tokens

```css
--duration-fast
--duration-standard
--duration-reveal
--ease-standard
--ease-emphasised
--motion-distance-small
```

Every animation must have a reduced-motion equivalent.

### 11.6 Component tokens

```css
--button-primary-bg
--button-primary-text
--button-secondary-border
--focus-ring
--card-bg
--card-border
--status-available
--status-preview
--status-coming-soon
```

Availability must include visible text and must not rely on colour.

## 12. Missing assets

- Approved VAKA vector logo and lockups
- Favicon and application icons
- Approved typeface files and licences, if not using system fonts
- Synthetic VAKA demo tenant and governed fixture data
- Accurate CRM product fragment
- Accurate finance/accounting product fragment
- Accurate inventory product fragment
- Payroll Coming Soon preview treatment
- Operations definition/preview
- Approved VAKA AI preview visual
- Responsive screenshots or component-rendered product views
- Open Graph/social image
- Approved Security, Privacy, Terms, and Data Processing pages
- Demo booking workflow or early-access form
- Support/contact operating details
- Customer/pilot proof with written permission, when available

## 13. Backend and operational dependencies

| Homepage requirement | Dependency |
|---|---|
| Public pricing | Governed public plans endpoint or shared build-time source |
| Open free workspace | Confirm current trial proposition and signup continuity |
| Book a demo | CRM/support destination, owner, notifications, spam protection |
| Join early access | Consent, storage, confirmation, privacy, unsubscribe process |
| Signup completion analytics | Auth success instrumentation and deduplication |
| Service unavailable state | Public status/health contract or safe frontend detection |
| Real product composition | Synthetic demo tenant or approved static capture pipeline |
| Trust claims | Verified security, backup, recovery, support, and reliability operations |
| Legal links | Approved public policies |
| Localisation continuity | Optional user/tenant locale persistence |
| Live VAKA AI | AI gateway, scoped tools, permissions, audit, evaluation, privacy, costs, failure handling |

No visual phase should modify accounting, inventory, billing, document numbering, tenant isolation, or customer data.

## 14. Risks before implementation

| Risk | Severity | Mitigation |
|---|---|---|
| Payroll appears live because it is added to hero/modules | Critical | Use Coming Soon at every relevant visual and copy point. |
| AI preview appears operational | High | Keep Preview/Coming Soon labels and remove active-looking unsupported actions. |
| Demo figures look like real customer evidence | High | Use visible Demo Data label and governed synthetic fixtures. |
| Page restructuring breaks signup/sign-in | High | Preserve callbacks and add regression tests first. |
| Existing good visual work is discarded | High | Extract and reorganise incrementally with screenshot parity. |
| Pricing drifts from billing | High | Establish a governed source before changing cards. |
| Security/backups are overstated | High | Require engineering/operations evidence and approved public language. |
| Unreviewed translations are shipped | High | Native review and explicit fallback; no AI-only final translations. |
| Legal templates are published as policies | High | Keep in-review states until counsel approval. |
| Scope expands into authenticated application redesign | High | Keep homepage `.v-*` namespace and separate workstreams. |
| New assets expose customer information | Critical | Synthetic tenant and redaction/review checklist. |
| Analytics violates privacy | High | Approve event schema, provider, consent basis, and retention first. |
| Mobile product composition overflows | Medium | Automated viewport tests and responsive visual regression. |
| Small text fails accessibility | Medium | Token minimums and WCAG audit. |
| Client-rendered SEO underperforms | Medium | Crawlability test; consider prerender/static generation. |
| Component extraction becomes a new design-system rewrite | Medium | Extract only repeated patterns and preserve DOM/output first. |

## 15. Recommended implementation order

### Phase 0 — Preserve the baseline

1. Add automated homepage render and interaction smoke tests.
2. Capture approved desktop, tablet, and mobile screenshots.
3. Record accessibility, bundle size, and Core Web Vitals baselines.
4. Test Start Free, Sign In, mobile menu, tabs, FAQ, and language fallback.

No visual changes.

### Phase 1 — Accuracy corrections

1. Replace “Live” demo wording with visible representative/demo language.
2. Make AI Preview/Coming Soon unmistakable.
3. Add missing payroll FAQ.
4. Standardise ChiShona, isiNdebele, ZiG, and accounting terminology.
5. Add Data Processing in-review state.
6. Validate current CTA/trial language.

### Phase 2 — Component extraction

1. Extract navigation.
2. Extract hero/product composition.
3. Extract story, outcomes, modules, AI, trust, pricing, FAQ, and footer.
4. Move synthetic data into one governed fixture.
5. Preserve visual output through regression tests.

### Phase 3 — v2.0 structural alignment

1. Move Why VAKA after Hero.
2. Consolidate problem content into Business Outcomes.
3. Consolidate workflow/tabs into Product Modules.
4. Fold Proof into Trust.
5. Preserve capability strip as a hero subcomponent.
6. Confirm the final ten-section order.

### Phase 4 — Copy and availability model

1. Apply approved hero copy.
2. Expand to six outcomes.
3. Add Payroll and Operations with explicit status.
4. Align VAKA AI example and label.
5. Expand trust copy only with evidence.
6. Align pricing outcomes/modules/CTA.

### Phase 5 — Localisation architecture

1. Move every English string into typed catalogues.
2. Add missing-key and fallback tests.
3. Localise metadata and accessibility labels.
4. Add native-reviewed ChiShona.
5. Add native-reviewed isiNdebele.
6. Test text expansion and mobile layouts.

### Phase 6 — Design system and assets

1. Introduce approved semantic tokens.
2. Apply logo and typography system.
3. Replace temporary previews with approved product fragments.
4. Add social image and icons.
5. Add responsive media behavior and fallbacks.

### Phase 7 — Accessibility, performance, and resilience

1. Complete menu and tab keyboard patterns.
2. Run WCAG 2.2 AA audit.
3. Add loading and unavailable-service states.
4. Add JavaScript-reduced/prerendered homepage.
5. Meet agreed Core Web Vitals and bundle budgets.

### Phase 8 — Functional integrations

1. Governed public pricing source.
2. Demo or early-access workflow.
3. Privacy-approved analytics.
4. Signup completion tracking.
5. Approved legal/resource destinations.

### Phase 9 — Live VAKA AI

Only after AI architecture release gates:

1. launch bounded read-only AI;
2. validate tenant/permission isolation;
3. meet evaluation thresholds;
4. add real preview interaction;
5. update homepage availability state.

## 16. Recommended first implementation task

Create the non-functional homepage regression baseline:

- render test;
- CTA tests;
- mobile-menu test;
- module-tab test;
- FAQ test;
- language-fallback test;
- desktop/tablet/mobile visual references;
- initial accessibility scan; and
- bundle/performance baseline.

This is the safest first task because the current homepage already contains strong work worth protecting. It creates the evidence needed to reorganise and extract components without breaking authentication, responsive behavior, or brand quality.

## 17. Final recommendation

### Keep

- Brand hierarchy and primary tagline
- Zimbabwe-first positioning
- Dark/warm-light/gold visual direction
- Existing authentication callbacks
- Responsive navigation concept
- Product-led visual approach
- VAKA story content
- Honest AI and language limitations
- Trust-first copy
- Pricing/FAQ/final CTA foundations
- Reduced-motion and SEO baseline

### Rewrite

- Hero support copy and CTA strategy
- Page sequence
- Four-outcome content model
- Product tabs into a full module/status model
- Partial localisation structure
- Demo-data labels and source
- Pricing source
- Analytics helper

### Add

- Product dropdown
- Payroll and Operations status
- Six approved outcomes
- Expanded trust evidence
- Payroll FAQ
- Full localisation catalogues
- Design-system tokens
- Missing assets
- Required failure states
- Regression/accessibility/performance tests

### Defer

- Live payroll
- Live VAKA AI
- Unreviewed translations
- Unsupported regulatory/integration claims
- Customer proof without permission
- Legal links without approved policies
- Demo/early-access CTAs without operating workflows

The homepage needs disciplined evolution, not another wholesale rebuild.
