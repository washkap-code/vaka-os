# P6-013 — Modern Platform Administration

**Status:** Specification committed; implementation pending
**Programme:** 6 — Application shell, navigation and workbench
**Type:** Frontend information architecture, design-system adoption and accessibility
**Depends on:** P6-001 design system; P6-002 tenant workspace shell; P6-005 accessibility foundation; P6-008 and P6-011 platform administration safeguards

## Outcome

Authorised VAKA operational staff can understand platform status, find the
correct administrative area and review permitted evidence quickly in a modern,
responsive control centre consistent with the tenant portal. Navigation remains
permission-derived and all server authority, audit, billing, tenant and backup
controls remain unchanged.

This mission modernises presentation and information architecture. It does not
claim that unavailable operational capabilities exist, add tenant impersonation
or expand any administrator's authority.

## Current behaviour

- Platform Administration still uses the original narrow legacy sidebar and has
  no responsive header or mobile drawer.
- Navigation labels do not explain the purpose of each area, making unfamiliar
  administration tasks harder to locate.
- The overview presents nine equal-weight metrics before context or shortcuts.
- Tenant review has no search or lifecycle filter.
- Operations evidence is one very long page, despite distinct health,
  capability, assurance and recovery tasks.
- Existing tables and evidence are truthful and permission-scoped, but the
  visual hierarchy no longer matches the modern tenant workbench.

## Target behaviour

1. Provide a modern platform-specific shell using governed VAKA tokens, a
   descriptive desktop sidebar, sticky contextual header and accessible mobile
   drawer.
2. Derive every navigation destination from existing server-issued
   `platform.*` permissions, retaining Settings and Help for authenticated
   platform users.
3. Give each destination a clear eyebrow, title, concise purpose and relevant
   actions so users always know where they are and what they can do.
4. Reorganise the overview into prioritised platform signals, commercial
   evidence, activity and permission-visible shortcuts without inventing data.
5. Add client-side tenant search and lifecycle filtering over already-authorised
   results, with a result count, clear empty state and unchanged audit review.
6. Split Operations into in-page Health, Capabilities, Assurance and Recovery
   views while retaining exact evidence, limitations and controls.
7. Present workforce, security settings and guide surfaces within the same
   consistent page hierarchy.
8. Support keyboard navigation, Escape-to-close, focus restoration, body scroll
   locking, reduced motion, forced colours and 320px reflow.

## User, problem and measurable result

- **User:** Authenticated VAKA staff with one or more platform permissions.
- **Problem:** Administrators must scan a dated, dense interface and a long
  operations page to locate routine tasks and evidence.
- **Result:** An administrator can identify their current area, reach each
  permitted destination and narrow tenant or operations evidence without
  horizontal page overflow or authority ambiguity.
- **Measure:** Permission/navigation contracts, focused interaction tests,
  accessibility and design-token gates pass; browser verification passes at
  1440, 1024, 640 and 320 CSS pixels; no platform API payload or permission
  outcome changes.

## Permissions, audit, data and failure behaviour

- Existing server-derived `platform.overview.read`, `platform.tenants.read`,
  `platform.operations.read`, `platform.backups.read`, `platform.staff.read`,
  `platform.staff.manage`, `platform.security.manage` and
  `platform.billing.run` checks remain authoritative.
- Hidden navigation never substitutes for server authorisation. No tenant
  identity is derived in the browser and no platform user gains tenant
  membership, support access or impersonation.
- Client-side search/filter only narrows authorised tenant metadata already
  returned by the existing API; it sends no new query or analytics event.
- Tenant audit review, billing confirmation, restore evidence recording,
  independent review, recent reauthentication and their audit behaviour remain
  unchanged.
- Loading, empty, unavailable and error states remain explicit. Missing evidence
  is never rendered as healthy, complete, restored or approved.

## Finance and operations invariants

- No accounting event, journal, balance, invoice, subscription amount,
  entitlement, arrears state, tenant lifecycle state, backup or restore evidence
  is created or changed by the shell.
- The existing billing command keeps its permission, confirmation, one-shot
  request and failure behaviour.
- Operations evidence states and limitations remain exact. Progressive
  disclosure does not reinterpret or suppress open gates.

## Finance Readiness Questions

1. **Accounting event:** None added; existing confirmed billing is unchanged.
2. **Journal:** No journal or posting-service change.
3. **Legal entity:** Existing platform and tenant boundaries remain unchanged.
4. **Currency:** Existing aggregate currency values and formatting are retained.
5. **Tax:** No tax logic or claim changes.
6. **Audit:** Existing platform action audit events remain authoritative.
7. **Reversal:** Existing finance correction controls are untouched.
8. **Explanation:** Exact metrics, evidence states, limitations and next gates remain visible.
9. **AI:** No AI is involved.
10. **Permission:** Existing server-issued `platform.*` permissions are mandatory.

## Localisation, accessibility and mobile

- All new user-facing text is added to the typed English catalogue. ChiShona
  and isiNdebele activation remains gated on professional terminology review.
- Navigation uses text labels with decorative icons hidden from assistive
  technology; active location uses `aria-current`.
- The mobile drawer has a named control, Escape close, backdrop close, focus
  restoration and background scroll lock.
- Search, filters and operations subnavigation use native labelled controls.
- Dense evidence remains in named, focusable local scroll regions at narrow
  widths; the document itself must not overflow at 320 or 640 CSS pixels.

## Scope

- Platform Administration shell, sidebar, header and page header.
- Overview hierarchy and permission-visible shortcuts.
- Tenant search, lifecycle filter and audit-review presentation.
- Operations task navigation and evidence grouping.
- Consistent presentation wrappers for VAKA workforce, security settings and
  guide.
- Typed English copy, responsive styles, focused tests and completion evidence.

## Out of scope

- New APIs, schema, dependencies, metrics, platform roles or permissions.
- Tenant mutations, impersonation, support access, cross-tenant search or tenant
  business-record access.
- Billing, pricing, trial, dunning, finance, tax or entitlement behaviour.
- Backup execution, provider binding, incident automation or DR approval.
- Whole-product redesign, native applications, translation activation,
  accessibility certification or professional operations/security approval.

## Acceptance criteria

- Mission Pack is committed before implementation.
- Platform Administration uses a modern responsive shell consistent with the
  tenant design system and displays only permitted primary destinations.
- Every page has clear context; overview, tenant and operations information is
  easier to scan without inventing or suppressing evidence.
- Tenant search/filter and Operations subnavigation work without new server
  authority or data access.
- Keyboard, focus, mobile drawer, reduced-motion, forced-colour and 320px reflow
  contracts are verified.
- Design-token, accessibility, TypeScript, focused frontend, production build,
  relevant server regression and repository hygiene gates pass.

## Rollback

Revert the scoped shell, catalogue, style, test and documentation changes. No
schema, API, tenant data, audit, finance, billing, backup or production data
rollback is required.
