# P6-002 — Responsive, Permission-aware Application Shell

**Status:** Approved for bounded implementation
**Programme:** 6 — Application shell, navigation and workbench
**Type:** Frontend shell decomposition plus tenant/user-scoped notification read adapter
**Depends on:** P6-001 design-token adoption; P1-004 notification service; existing verified-JWT/RBAC context

## Outcome

Authenticated tenant users receive one responsive application shell with
permission-aware navigation, a mobile drawer, an inert command-bar mount point,
a recent-notifications menu backed by P1-004, and an account menu. Every
existing workspace page keeps its current component, API contract and route
state while the visual shell is extracted from the 2,682-line `App.tsx`.

This mission is shell infrastructure, not a route-framework rewrite, universal
workbench, command palette, notification read/unread system, new domain module,
or final WCAG certification.

## Current behaviour and audit

- `App.tsx` owns authentication gates, platform administration, the tenant
  shell, navigation state and every domain screen in one 2,682-line module.
- The tenant shell uses a fixed 220-pixel sidebar on desktop. Below 760 pixels
  it becomes a two-column block of navigation buttons above page content; there
  is no compact header, drawer, overlay, Escape behavior or mobile account
  access.
- Navigation hides only Imports without `imports.create` and Users & Activity
  for non-owners. Other items remain visible even when their server endpoints
  require `crm.read`, `accounting.read`, `inventory.read` or `reports.read`.
- Sign out is placed only in the desktop sidebar footer, which is hidden on
  mobile. Personal settings are a navigation page, but there is no account
  menu.
- P1-004 persists tenant-scoped notification intents/delivery evidence and
  exposes an internal `listNotifications` read helper. There is no authenticated
  user-targeted notification endpoint or shell menu.
- Current `IN_APP` producers use the authenticated user ID as `recipient` for
  finance-delivery outcomes and active authorised user IDs for low-stock alerts.
- The notification table has no read/unread field. Calling recent records
  “unread” would be false product behavior.
- P1-006 search exists server-side, but P6-004 owns the command-palette/search
  UI. P6-002 must provide only a stable mount seam.
- P6-001 now governs shell colour, typography, spacing, shape, elevation and
  motion. The runtime tenant boundary remains `--brand` and `--accent`.

## Target behaviour

1. Extract reusable tenant shell presentation into named React components under
   `web/src/shell/`, keeping route/domain rendering in the current workspace
   controller for an incremental, reversible decomposition.
2. Define one typed navigation model with explicit access rules:
   - Dashboard and Reports require `reports.read`;
   - Contacts and Sales Pipeline require `crm.read`;
   - Invoices require `accounting.read`;
   - Products & Stock and Purchase Orders require `inventory.read`;
   - Imports requires `imports.create`;
   - Users & Activity requires tenant-owner identity;
   - Upgrade requires `billing.manage`;
   - Billing & Plan remains available to authenticated tenant users to preserve
     suspend-then-escrow billing access;
   - Settings remains available for the user-owned profile, while company
     controls continue to require `settings.manage` server-side.
3. If the current page is not permitted after identity refresh, select the first
   permitted destination; never render a forbidden module merely because the
   client retained stale page state.
4. Preserve the existing in-memory page contract and all domain components.
   Browser back/forward routing and URL deep links remain a separately scoped
   routing mission.
5. On desktop, preserve the sidebar information architecture while adding a
   compact shell header for command, notification and account affordances.
6. Below the existing mobile breakpoint, present navigation as a labelled
   drawer with an explicit menu button, close button and backdrop. Navigation,
   backdrop selection and Escape close the drawer; scroll locking is cleaned up
   on close/unmount.
7. Add a skip link and semantic `header`, `nav`, `aside` and `main` landmarks.
   Active navigation uses `aria-current="page"`; menu buttons expose
   `aria-expanded` and `aria-controls`.
8. Add a stable, non-visible `#vaka-command-bar-mount` owned by the shell. It
   must not claim that universal search is live; P6-004 will mount the command
   palette there.
9. Extend P1-004 `listNotifications` with optional recipient/channel filters and
   expose `GET /notifications?limit=` after completed-password enforcement.
   The route:
   - derives tenant and user from the verified JWT;
   - forces `recipient` to the current user and `channel` to `IN_APP`;
   - zod-validates and bounds the limit;
   - returns `Cache-Control: private, no-store`;
   - omits provider IDs, dedupe keys, email/SMS/WhatsApp records and other users'
     records.
10. Render a recent-notifications menu using typed English catalogue copy for
    current inventory/finance templates. Unknown templates fall back to a safe
    generic message rather than exposing arbitrary stored variables.
11. Label notifications as recent, not unread. Read state, mark-read writes,
    deletion, preference controls, push delivery and polling/websocket freshness
    are outside this mission.
12. Add an account menu showing the authenticated user's name/email with
    Settings and Sign out actions. Sign out continues through the existing
    server logout/revocation path.
13. Keep P6-001 token ownership and conformance: new live shell files consume
    `--vaka-*`/compatibility roles and join the conformance scan; no scattered
    raw colour, font or motion literals are introduced.

## User and measurable business result

- **User:** Authenticated VAKA tenant users across Owner, Admin, Accountant,
  Sales, Stock Controller and Staff roles.
- **Problem:** The current shell exposes inaccessible modules, hides sign-out on
  mobile and gives live notifications no user-facing destination.
- **Result:** Each user sees only usable destinations, can navigate and sign out
  at small widths, and can review their own recent in-app operational outcomes.
- **Measure:** Permission-model tests cover every navigation rule; endpoint tests
  prove tenant/user/channel isolation; representative desktop/mobile browser
  checks cover drawer, focus, Escape, account, notifications and all existing
  destinations; full server/web gates remain green.

## Trust, permissions and privacy

- The UI is not an authority boundary. Existing server permission/lifecycle
  middleware remains authoritative for every domain route and write.
- Navigation derives only from verified `/me` permissions and owner identity;
  tenant/user identifiers are never accepted as navigation or notification
  query input.
- Notification reads are independently scoped by tenant, recipient and channel
  in the database query. Cross-tenant, same-tenant-other-user and external
  delivery records never enter the response.
- Stored notification variables are treated as untrusted display data. Only
  recognised template keys are formatted; React escaping remains intact.
- No provider message ID, recipient email, dedupe identifier, secret, document
  bearer link or redacted variable is exposed by the shell endpoint.
- Notification reading is non-consequential and does not create an audit event.
  Existing notification-send audit evidence remains authoritative.
- Sign out preserves the existing session revocation behavior. No authentication
  token storage, rotation, MFA or permission model changes are included.

## Localisation, accessibility and mobile

- New copy is added to the typed English application catalogue. ChiShona and
  isiNdebele enablement remains gated until the broader localisation framework
  and qualified review exist.
- The layout must tolerate text expansion and 320-pixel CSS width without
  hiding navigation/account controls or introducing shell-level horizontal
  overflow.
- Native buttons/details/landmarks are preferred. Drawer state and current-page
  semantics must be keyboard and screen-reader observable.
- Focus remains visibly governed by P6-001 tokens. Escape closes the mobile
  drawer and focus returns to the menu control.
- `prefers-reduced-motion` removes drawer transition effects through governed
  motion tokens.
- This mission resolves shell-specific access/navigation issues but does not
  claim complete WCAG 2.2 AA conformance; P6-005 remains the full pass.

## Scope

- Tenant workspace shell components and typed navigation model.
- Responsive drawer/header, command mount, notification and account menus.
- Current-user P1-004 notification list endpoint and filtering extension.
- Typed catalogue additions and token-conformant shell styles.
- Pure navigation-model tests, server endpoint isolation tests and representative
  browser regression evidence.
- Design-system usage, roadmap, changelog and completion documentation.

## Out of scope

- Platform-admin shell redesign.
- React Router or URL/deep-link migration.
- Moving every domain component out of `App.tsx`.
- P6-003 Universal Workbench widgets.
- P6-004 command palette/universal search UI.
- P6-005 complete accessibility remediation.
- Notification read/unread persistence, mark-read, deletion, preferences,
  pagination cursors, push, websocket/SSE, background polling or provider
  delivery status UI.
- New notification producers or changed finance/inventory behavior.
- New role/permission definitions, database schema or dependencies.

## Acceptance criteria

- This mission pack is committed before implementation.
- Shell presentation is extracted into focused named TSX components; App route
  and domain behavior remains compatible.
- Every navigation item follows the documented permission/owner mapping and the
  first permitted-page fallback is deterministic.
- Mobile drawer, skip link, landmarks, active state, Escape/backdrop/navigation
  close, focus return and account sign-out work at representative widths.
- The command-bar mount exists without visible or availability overclaim.
- `GET /notifications` is zod-bounded, private/no-store and independently
  tenant/user/IN_APP scoped with minimised output.
- Notification menus render safe typed copy for known and unknown templates and
  do not call recent records unread.
- P6-001 conformance covers all new live shell files and passes its negative
  self-test.
- Navigation model, notification isolation, permission, mobile and existing
  route regression evidence passes.
- Guarded database preparation/full server suite, server/web typechecks and web
  production build pass with zero errors.
- No migration, production database operation, new dependency or planned-
  capability claim is introduced.

## Rollback

Revert the extracted shell components, navigation model, notification read
route/filter, catalogue/styles/tests and documentation. Restore the current
inline tenant `Shell` JSX in `App.tsx`. No data or schema rollback is required;
existing P1-004 notification records and all domain routes remain unchanged.

