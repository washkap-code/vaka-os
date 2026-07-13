# P6-001 — App-wide Design-system Token Adoption

**Status:** Approved for compatibility-first implementation
**Programme:** 6 — Application shell, navigation and workbench
**Type:** CSS architecture, conformance evidence and visual-parity migration
**Depends on:** Existing `web/src/design-system` token/primitives foundation

## Outcome

VAKA's public homepage, authentication screens and authenticated workspace
consume one governed design-token vocabulary for foundational colour,
typography, spacing, shape, elevation, motion and component roles while
preserving their current rendered appearance, DOM, routes and behavior.

This mission establishes a reliable styling seam for P6-002. It does not
redesign the shell, replace application components, enable dark mode, approve
directional brand values or remove tenant white-label branding.

## Current behaviour and audit

- `tokens.css` already defines namespaced palette, semantic colour, type,
  spacing, radius, shadow, motion, breakpoint, control, focus and layer tokens.
- `primitives.css` and the development preview already consume those tokens.
- The design-system styles are imported globally before legacy application and
  homepage styles.
- Authenticated `styles.css` still declares a parallel `--brand`, `--accent`,
  `--bg`, `--card`, `--text`, `--muted`, `--line`, `--danger` and `--ok`
  vocabulary and repeats foundational values through component rules.
- Public `landing.css` still declares a separate `--v-*` palette and embeds
  many one-off tonal, spacing and motion values.
- Tenant branding currently updates `--brand` and `--accent` at runtime. That
  contract is live and must remain compatible.
- Audit baseline on 2026-07-13:
  - authenticated CSS: 72 hard-coded colour occurrences / 39 unique values;
  - homepage CSS: 150 hard-coded colour occurrences / 99 unique values;
  - the repository has no frontend unit, accessibility or screenshot-regression
    framework, so this mission adds bounded static conformance evidence and
    records representative manual/browser visual comparisons.

## Target behaviour

1. Extend `tokens.css` with documented compatibility semantic roles for:
   - authenticated workspace canvas, surface, text, muted text, border,
     tenant-brand fallback, tenant-accent fallback and functional states;
   - public homepage canvas/surface/text/border/accent roles;
   - legacy component dimensions/shape/elevation required for pixel parity;
   - restrained motion aliases and reduced-motion equivalents.
2. Preserve tenant white-label behavior:
   - `--brand` and `--accent` remain the runtime mutation boundary;
   - their defaults resolve through governed fallback tokens;
   - functional success, warning, danger and information roles never resolve
     through tenant colours.
3. Make the authenticated application consume the shared font, semantic
   colours, spacing/radius/elevation roles and component aliases without
   changing class names, JSX, layout geometry or interaction behavior.
4. Make the homepage consume shared public semantic roles for its foundational
   palette, type and existing motion timings. Decorative tonal values may remain
   as documented component-specific tokens in `tokens.css`; raw literals must
   not remain scattered through live surface CSS.
5. Preserve the existing design-system primitive contract and preview.
6. Add a deterministic conformance check that fails when live surface CSS:
   - introduces a raw hex/rgb/hsl colour outside `tokens.css`;
   - introduces a literal font-family outside the token source; or
   - introduces a literal transition/animation duration outside approved token,
     reduced-motion or keyframe declarations.
7. Add the conformance check to the web package scripts and CI quality command
   where the repository already centralises frontend checks.
8. Verify computed visual parity on representative public, authentication and
   authenticated workspace surfaces at mobile and desktop widths. Differences
   require an explicit documented decision; this mission permits none.
9. Verify focus visibility, semantic status separation, 200% zoom/reflow and
   `prefers-reduced-motion` on representative surfaces.
10. Update design-system usage documentation, master-plan status, changelog and
    Completion Report without claiming full WCAG conformance or final design
    approval.

## User and measurable business result

- **User:** Every VAKA user and frontend contributor.
- **Problem:** Live surfaces and shared primitives currently have parallel
  styling vocabularies, making shell work risky and design changes difficult to
  audit consistently.
- **Result:** Future shell/components can use one governed semantic vocabulary
  while current users see no visual or behavioral change.
- **Measure:** Live CSS passes the token-conformance check; representative
  before/after screenshots have no unintended pixel differences; type/build and
  full server regression gates remain green.

## Trust, security and privacy

- No server, tenant, permission, finance, stock, document or audit behavior is
  changed.
- Tenant-provided colours remain stored values applied only to the two existing
  CSS custom properties. This mission does not add arbitrary CSS/HTML injection
  or remote assets.
- Governed functional states remain independent of tenant branding.
- No data, provider, secret, persistence, export or retention change occurs.

## Localisation, accessibility and mobile

- No user-facing copy is added by implementation; documentation remains English.
- Layout/DOM and existing small-screen breakpoints remain unchanged for parity.
- Shared type roles use the existing system-font fallback with launch-language
  character coverage; no web font or licence dependency is introduced.
- Existing focus/reduced-motion behavior must be preserved. Token adoption is
  foundation evidence, not a claim that P6-005 WCAG 2.2 AA is complete.

## Scope

- Token compatibility roles and documented ownership boundaries.
- Authenticated workspace and homepage CSS adoption.
- Static token-conformance test/script and package command.
- Representative visual, responsive, focus, zoom and reduced-motion evidence.
- Design-system usage, master plan, changelog and Completion Report updates.

## Out of scope

- JSX/DOM restructuring, route changes, navigation changes or App decomposition.
- Component-by-component migration from legacy classes to React primitives.
- P6-002 responsive shell, command bar, notification menu or user menu.
- P6-003 workbench, P6-004 search UI or P6-005 full accessibility remediation.
- Tenant-colour contrast validation UI, automatic palette generation or theme
  switching.
- Final brand/colour/font approval, new logo assets, web fonts or dark-mode
  product release.
- New strings, translations, dependencies, database schema or server APIs.

## Acceptance criteria

- Mission pack is committed before implementation.
- Both live CSS surfaces consume governed `--vaka-*` semantic/component tokens;
  raw colour and font-family literals are centralised in `tokens.css`.
- Motion durations in live CSS resolve through shared tokens and reduced-motion
  behavior remains effective.
- Tenant `--brand`/`--accent` runtime behavior and all existing selectors,
  class names, DOM, routes and interactions remain compatible.
- Functional state colours do not depend on tenant branding.
- Token-conformance automation passes and has a regression fixture/test.
- Representative desktop/mobile public, auth and workspace visual parity is
  evidenced; focus, zoom and reduced-motion checks are recorded.
- Server DB preparation/full suite, server/web typechecks and web production
  build pass with zero errors.
- No migration, production DB operation, new dependency or availability
  overclaim is introduced.

## Rollback

Revert the compatibility token additions, live CSS substitutions, conformance
check and documentation. Existing selectors/DOM and the runtime tenant variable
contract remain unchanged, so rollback requires no data or component migration.
