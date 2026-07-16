# PB-003 — Black Book directory UI and universal search integration

**Status:** APPROVED FOR DARK IMPLEMENTATION — PB-002 CONTENT GATE OPEN

**Programme:** PB — Black Book

**Branch:** `codex/pb-003-blackbook-ui`

**Depends on:** PB-001 registry; PB-002 certification pack; P1-006 search
adapter; P6-004 command palette; FLAG-001/002

**Feature flag:** `blackbook.directory` (default OFF)

**Migration:** none. Migration `0046` is reserved by PV-001 and must not be
taken by this mission.

## Outcome

An authenticated tenant user whose workspace has `blackbook.directory`
enabled can browse the governed Black Book registry, search it by name or
payload keyword, inspect a complete entry with provenance, and open a matching
entry from universal search. A tenant without the flag sees no Black Book
navigation or page and receives no Black Book data from either the directory
API or P1-006 search.

PB-003 is a technical dark build. PB-002 has prepared the professional review
queue but has not certified the content. The feature must remain disabled for
all tenants until the signed PB-002 content pack is returned, recorded and
approved for the intended published scope.

## User and measurable business result

**User:** Zimbabwean founders, finance and operations staff who need to find
the correct public authority, regulator, council, utility, tender portal,
business association, licence type, service or compliance record.

**Problem:** PB-001 exposes governed registry reads, but tenant users have no
directory surface and the universal search palette cannot discover Black Book
entries.

**Result:** a user can move from category or keyword to an entry's current
registry payload and official sources without leaving VAKA, while remaining
clearly directed to confirm requirements with the competent authority.

**Measures:**

- all nine PB-001 categories are labelled and browsable, including the seven
  named PB-003 directory groups (government, regulators, councils, utilities,
  tender portals, associations and licence types);
- a name or payload-keyword query returns matching active entries from the
  tenant's country pack;
- a universal-search Black Book result opens the matching detail surface;
- sources, `lastReviewed`, verified state and the not-professional-advice
  notice are always visible on detail;
- flag-off navigation, pages, directory API reads and search projections fail
  closed; and
- no registry write, import, content edit, schema change or migration occurs.

## Current behaviour

- PB-001 owns global `blackbook_entries`, immutable entry versions and import
  runs. The registry deliberately has no `tenant_id`.
- `GET /blackbook/entries` and `GET /blackbook/entries/:key` are authenticated,
  read-only and already protected by `requireFeature("blackbook.directory")`.
- List search currently matches name and entry key; detail already returns the
  full payload, sources, review date, verified state, version history and the
  advice notice.
- P1-006 searches a tenant-owned derived index for Customer, Supplier, Invoice
  and Product. It applies tenant and permission checks inside the provider.
- P6-004 renders those governed P1-006 results in the authenticated command
  palette.
- The web shell consumes `/me.features` for flag-aware navigation, but has no
  Black Book page or navigation item.
- PB-002 remains professionally unapproved. Evidence readiness must not be
  presented as content certification or VAKA endorsement.

## Target behaviour

1. Add a `blackbook` workspace destination guarded only by the existing
   `blackbook.directory` feature key. No new tenant permission is introduced;
   PB-001 reference reads remain available to any authenticated tenant member
   when the flag is on.
2. Render responsive category controls for all canonical PB-001 categories,
   using customer-facing labels for government, regulators, councils,
   utilities, tender portals, associations, licence types, compliance events
   and services.
3. Search the directory by name, entry key or text present in the governed
   payload. Validate and bound search input at the existing API boundary.
4. Render explicit initial/loading/empty/error/retry states. Superseded list
   and detail requests must be aborted so stale responses cannot replace the
   current selection.
5. Render detail as a page-like region with the complete supported PB-001
   payload, category, verified state, locale-formatted review date, official
   sources and the not-professional-advice notice. Do not add editing controls.
6. Extend P1-006 with a read-through Black Book projection rather than copying
   global content into the tenant `search_documents` index. This avoids a
   migration, stale per-tenant duplicates and changes to the existing index
   CHECK constraints.
7. The search provider must derive the country from the authenticated tenant
   and check `blackbook.directory` for that tenant before querying global
   active entries. It must never accept a tenant or country override from the
   universal-search client.
8. Return only a minimal Black Book search document: entry key, name, category,
   verified state and review date. Sources and the full payload remain on the
   gated detail endpoint.
9. Extend the P6-004 parser and closed navigation map with the single governed
   `blackbook -> Black Book entry` destination. Unknown shapes or navigation
   descriptors continue to fail closed.
10. Keep all new user-facing copy in the typed locale catalogue. Stable
    category, cadence and payload-field keys remain separate from translated
    labels. English is the current baseline; qualified Shona and Ndebele
    activation remains a PI18N professional-review mission.
11. Preserve every PB-001 import, versioning, platform permission, audit and
    governance rule unchanged.

## Authority, tenancy, audit and data protection

- Authentication supplies the tenant, actor and permissions. No PB-003 client
  request supplies a tenant identifier.
- Directory routes retain `requireFeature("blackbook.directory")`; the P1-006
  provider independently checks the same feature before including Black Book
  results.
- Universal search derives the tenant's country from the tenant record and
  selects only ACTIVE registry entries for that country.
- The global registry is shared reference data, not private tenant data. The
  tenant boundary in PB-003 is feature entitlement and country projection;
  tests must prove that one tenant's enabled flag does not expose results to a
  second disabled tenant.
- Reads and navigation are not material actions and add no audit event. PB-001
  import writes remain the only mutation path and retain platform audit.
- Search results minimise returned data. Full sources and payload are fetched
  only after the user opens a detail entry.
- Search text is sent only to VAKA's same-origin APIs and is not written to
  browser storage, history, analytics or logs.

## Accessibility, mobile and localisation

- Meet WCAG 2.2 AA for the changed surface: semantic headings and landmarks,
  persistent labels, keyboard-operable category/result controls, visible
  focus, non-colour status text, descriptive link names and polite status
  announcements.
- Opening a detail result moves focus to its heading; returning to the
  directory preserves a usable keyboard path.
- Use list/card presentation instead of a wide table. At 320 CSS pixels the
  search, categories, result list, payload and sources must stack without
  page-level horizontal overflow.
- Touch targets use the design-system control sizing and layouts tolerate text
  expansion.
- All new interface strings live in `appEnglish`; dates use locale-aware
  formatting. Source URLs and registry payload values are data, not embedded
  interface copy.
- Verified state is described narrowly as a registry evidence state, not an
  endorsement, legal conclusion or proof of current compliance.

## Failure behaviour

- Missing, disabled or unknown feature state returns no Black Book data.
- Invalid category, country, key or query input is rejected by the existing
  zod/API boundaries.
- An unknown or retired entry returns safe not-found behaviour.
- A directory or search network failure leaves the rest of the workspace
  usable, shows localised recovery copy and never displays a stale response as
  current.
- An unrecognised payload field is not given an invented meaning; PB-001's
  closed import schema remains the source of supported display labels.
- A malformed universal-search result is discarded client-side and cannot
  navigate.
- PB-002 approval remains a release blocker even when every technical check in
  this mission passes.

## Scope

- PB-003 mission and completion documentation.
- Read-only PB-001 list keyword enhancement.
- P1-006 provider composition for tenant-feature- and country-scoped Black
  Book results, without storing Black Book rows in `search_documents`.
- Black Book directory/detail React surface, typed parsing/model helpers,
  feature-aware shell navigation and command-palette navigation.
- Typed English catalogue additions and token-based responsive CSS.
- Focused Black Book/search tests, feature-flag/tenant-isolation regression,
  navigation-model tests and accessibility/token conformance coverage.

## Out of scope

- Any migration, Drizzle file, schema constraint or `server/drizzle/` change.
- Registry imports, source edits, content certification, entry editing,
  retirement or correction workflows.
- Fees, deadlines, legal/tax interpretations or compliance-guide publication.
- PB-002 gate closure, professional approval or tenant enablement.
- PB-004 licence-guide expansion, PB-005 reminders, PB-006 tenders or PB-007
  AI advice.
- Semantic/vector/fuzzy search, external search providers, analytics or saved
  searches.
- Changes to `config.ts`, LP-owned health routes, `.github/workflows`, or
  `server/src/routes.ts` outside its existing Black Book section.

## Acceptance criteria

- This README is committed before implementation begins.
- The requested branch is based on current `main` and contains no migration.
- Black Book navigation and page rendering are absent without
  `blackbook.directory` and present when enabled.
- Existing directory list/detail endpoints still return 403 FEATURE_DISABLED
  when the flag is off.
- Category browsing covers government, regulators, councils, utilities,
  tender portals, associations and licence types, with the remaining PB-001
  categories represented consistently.
- Directory search matches entry name/key and governed payload keywords.
- Detail renders payload, sources, locale-formatted `lastReviewed`, verified
  status and the localised not-professional-advice notice.
- P1-006 includes Black Book only for a flag-enabled tenant and only from that
  tenant's country; a disabled tenant receives no Black Book projection.
- A governed command-palette Black Book result opens the correct detail entry;
  malformed descriptors fail closed.
- All new user-facing strings are catalogue-owned; no `dangerouslySetInnerHTML`
  is introduced.
- Changed React code passes the React component/hook/accessibility/TypeScript
  quality checklist.
- Black Book suite; critical, feature-flag and tenant-isolation regression;
  both typechecks; web build; navigation-model; design-token; accessibility;
  and `git diff --check` all pass.
- `COMPLETION.md` records verification, PB-002's open gate and that no
  migration was taken.
- `SESSION-HANDOFF.md` is updated and committed as the final commit, explicitly
  recording PB-003 status and no migration.

## Rollback

Revert the PB-003 implementation and documentation commits. The existing
PB-001 registry and its read APIs remain intact and dark behind the feature
flag. No schema, registry data, tenant data, financial record or production
operation requires rollback.
