# P6-004 — Universal Command and Search Palette

**Status:** Approved for implementation
**Programme:** 6 — Application shell, navigation and workbench
**Type:** Frontend command/search presentation over existing tenant-scoped services
**Depends on:** P6-002 shell mount; P1-006 search adapter; P1-008 metadata registry

## Outcome

Authenticated tenant users can open one modern command palette from the
workspace header or keyboard, search the Customer, Invoice and Product records
they are already permitted to read, and move to the governed record/module
destination without weakening any server-side permission or tenant boundary.

This is deterministic keyword discovery over the existing P1-006 index. It is
not VAKA AI, semantic search, cross-tenant platform search, a route-framework
rewrite or a guarantee of durable real-time indexing.

## Current behaviour

- P6-002 provides an inert `#vaka-command-bar-mount` in the authenticated shell
  and deliberately makes no visible search claim.
- P1-006 exposes validated, authenticated `GET /search` for Customer, Invoice
  and Product summaries, with tenant and per-result permission enforcement.
- P1-008 attaches governed object labels and navigation descriptors to search
  results.
- Workspace navigation is currently in-memory. Customer and invoice record
  dialogs exist inside their module screens; Products currently has a list
  surface but no governed product-detail editor.

## Target behaviour

1. Replace the inert command mount with a visible, compact `Search workspace`
   button that remains usable beside notifications and account actions.
2. Add a focused `CommandPalette` React component using the existing VAKA
   `Dialog` primitive and semantic design tokens.
3. Open the palette from the header, `Ctrl+K`/`Cmd+K`, or `/` when focus is not
   inside an editable control. Escape closes through native dialog behaviour
   and focus returns to the invoking control.
4. Keep all new user-facing copy in the typed English catalogue. Stable machine
   entity values remain independent from labels; Shona and Ndebele translation
   activation remains separately reviewed.
5. Do not send blank or one-character queries. After a short debounce, call the
   existing authenticated `GET /search` endpoint with a bounded result limit.
   Abort superseded requests and ignore stale responses.
6. Render explicit initial, loading, result, empty and recoverable error states.
   Never expose raw server internals or imply that result freshness is durable.
7. Group and label results by their governed metadata descriptor. Display only
   the minimal P1-006 summary already returned by the server; do not fetch or
   cache additional contact, tax, cost, ledger or stock detail in the palette.
8. Support Arrow Up/Down result movement and Enter activation, while retaining
   native Tab navigation and visible focus. Result selection must be available
   to pointer and keyboard users.
9. On activation, map only known governed object/navigation combinations:
   Customer → Contacts, Invoice → Invoices, Product → Products & Stock. Unknown
   combinations fail closed with no navigation.
10. Customer and invoice selections open their existing authorised record
    dialogs after the destination list loads. Product selections navigate to
    Products & Stock and focus/highlight the matching row because a product
    detail editor is not yet governed.
11. Clear palette query/results when closed so one user session does not leave
    sensitive business discovery visible to the next person viewing the
    workstation.
12. Preserve P6-002 permission-filtered navigation and every existing server
    authority check. The palette is a convenience surface, never an
    authorization boundary.

## User and measurable business result

- **User:** Authenticated tenant users with `crm.read`, `accounting.read` or
  `inventory.read`.
- **Problem:** Users must navigate separate modules before they can discover a
  known customer, invoice or product.
- **Result:** One keyboard- and mobile-friendly palette finds only authorised
  record summaries and moves the user to the correct existing surface.
- **Measure:** Permission/result-shape tests remain green; component/model tests
  cover shortcuts, result mapping, stale-request safety and keyboard selection;
  representative browser checks cover desktop and 320-pixel layouts.

## Trust, privacy and failure behaviour

- Tenant, actor and permissions continue to come only from the verified server
  session. The client never submits a tenant identifier.
- Server result filtering remains authoritative. Client mapping accepts only
  the three currently governed searchable objects and known destinations.
- Search text is operational business data. It is sent only to VAKA's existing
  same-origin API, is not placed in URLs/history, analytics or logs, and is
  cleared on close.
- Search is read-only and creates no audit event. Opening a result does not
  mutate the record.
- Network failure leaves existing navigation usable, offers a retry path and
  does not sign the user out or show stale results as current.
- The palette must not use `dangerouslySetInnerHTML`; React escaping remains
  active for all result text.

## Accessibility, mobile and localisation

- Use the native-dialog design-system primitive for modal semantics, focus
  containment and Escape behaviour.
- The trigger has an accessible name and advertised keyboard shortcut.
- The input has a persistent label; result count/loading/error changes use an
  appropriate live status without excessive announcements.
- Active result state is conveyed by text/ARIA and focus styling, not colour
  alone.
- At 320 CSS pixels the dialog, input, filters and result summaries stack
  without page-level horizontal overflow.
- Copy lives in `appEnglish`; values use locale-aware currency formatting and
  layouts tolerate launch-language expansion.
- This mission verifies the palette-specific path but does not claim the
  P6-005 product-wide WCAG 2.2 AA certification.

## Scope

- New command-palette component, typed search result model and result mapper.
- Visible P6-002 shell trigger and keyboard shortcut lifecycle.
- Minimal abort-signal support in the existing web API helper.
- Existing Customer/Invoice record-dialog handoff and Product row focus.
- Typed English copy, token-conformant responsive styles and focused tests.
- Design-system usage, roadmap, mission index and completion evidence updates.

## Out of scope

- Backend search schema, ranking, permissions, metadata or canonical records.
- Semantic/fuzzy/vector/AI search, attachments, saved searches, analytics or
  cross-tenant platform-administrator search.
- Durable event delivery, outbox/replay, index scale proof or search SLAs.
- React Router, browser URLs, back/forward history or deep-link migration.
- Product detail editing, new record mutation, new permissions or audit events.
- Complete application-shell redesign or P6-005 accessibility remediation.

## Acceptance criteria

- This Mission Pack is committed before implementation.
- The trigger and `Ctrl/Cmd+K` shortcut open one accessible palette; `/` works
  only outside editable controls; cleanup removes global listeners.
- Queries shorter than two characters do not call the API; superseded requests
  are aborted and stale responses cannot overwrite newer results.
- Loading, results, empty, error and retry states are explicit and localised.
- Keyboard and pointer activation work without a positional/index key.
- Only governed Customer, Invoice and Product results map to permitted module
  destinations; unknown descriptors fail closed.
- Existing Customer and Invoice dialogs open from search; Product selection
  focuses the matching product row without inventing edit capability.
- The query and results clear on close and are not written to URL/history,
  storage, analytics or logs.
- New TSX/CSS passes the P6-001 token-conformance gate and responsive
  320-pixel verification.
- Search/model tests, server/web typechecks, web build, `git diff --check` and
  the full remote database-backed quality gate pass.
- No migration, production database operation, new dependency or accounting,
  inventory, pricing or authentication behaviour is introduced.

## Rollback

Revert the command-palette component/model, shell trigger, API signal support,
record handoff props, catalogue/styles/tests and documentation. Restore the
inert P6-002 mount. No schema, canonical data, search index or server rollback
is required.
