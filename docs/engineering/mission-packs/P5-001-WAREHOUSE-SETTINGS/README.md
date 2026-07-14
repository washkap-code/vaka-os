# P5-001 Warehouse Settings — Tier-Governed Locations and Brand Controls

**Status:** Approved by owner for implementation
**Programme:** 5 — Inventory and warehousing
**Type:** Canonical warehouse administration, commercial entitlement enforcement and scoped settings UX
**Depends on:** P5-001 product/multi-warehouse foundation; governed package catalogue; P6-001 design system

## Outcome

Tenant owners and authorised company administrators can maintain the stock
locations used throughout inventory and procurement from Company Settings.
Every stock-entry selector continues to use the one canonical `warehouses`
record set, while the server enforces the tenant's package allowance before a
new location is created.

The same settings change also replaces the visually ambiguous native colour
inputs with labelled colour controls that show both the swatch and exact
hexadecimal value, retain keyboard access and update the existing workspace
preview.

## User and measurable business result

- **User:** Tenant owner or authorised company administrator configuring the
  places where stock is held; inventory users selecting a location during
  product and stock entry.
- **Problem:** Locations can currently be created only through a bare inventory
  endpoint, are not manageable in Settings and are not limited by package.
  The primary/accent colour controls expose large browser-dependent colour
  fields without a clear exact value.
- **Result:** Settings shows the tenant's current package, used/available
  location capacity and canonical location records; a location can be created
  or amended without leaving Settings; product and stock selectors immediately
  draw from the same list; colour choices are understandable and precise.
- **Measure:** Starter cannot exceed one location, Growth cannot exceed two and
  Business cannot exceed five; Enterprise remains contract-scaled pending the
  governed entitlement/override catalogue. Default names, permission, tenant,
  audit, responsive and canonical-source tests pass.

## Current behaviour

- Signup creates one canonical `Main Warehouse`.
- `GET /warehouses` is tenant-scoped and feeds product, stock, invoice and
  procurement selectors.
- `POST /warehouses` accepts a required name and optional free-text address,
  requires `inventory.write` and does not check the subscribed plan.
- Company Settings has no location-management surface.
- Package reference data already records `inventoryLocations` values of 1, 2
  and 5 for Starter, Growth and Business. Enterprise is described as
  contracted scale and has no fixed location value.
- Primary and accent colours use raw browser colour inputs without an adjacent
  editable/readable hexadecimal value.

## Target behaviour

1. Keep `warehouses` as the only warehouse/store-location entity. Do not add a
   duplicate location table or client-owned warehouse list.
2. Add a tenant-scoped settings read model returning canonical warehouses,
   current plan name, used count and a finite allowance or an explicit
   contract-scaled state.
3. Accept an optional location name and a required address. When the name is
   blank, derive it deterministically from the first non-empty address line.
4. Enforce finite plan allowances inside the create transaction after locking
   the tenant, so concurrent requests cannot exceed the limit.
5. Permit creation and amendment to callers with `settings.manage` or the
   existing inventory-management permission. Keep ordinary location reads
   available to `inventory.read` for operational selectors.
6. Allow name/address amendment and selection of one default location. Changing
   the default clears the previous default atomically. Do not delete a location
   or rewrite stock history in this mission.
7. Produce tenant/actor/entity/time audit evidence for create, amendment and
   default changes. Rejected limit, permission or cross-tenant attempts produce
   no location or audit side effect.
8. Add loading, empty, validation, limit, permission, success and retry states
   to Settings. Changes refresh the canonical list used by subsequent product
   and stock entry.
9. Replace each raw colour field with a governed control containing a labelled
   swatch, exact six-digit hexadecimal text input and a non-colour textual role
   description. Preserve tenant `--brand`/`--accent` compatibility and prevent
   either value from replacing functional status colours.
10. Use typed English catalogue copy, tolerate text expansion and stack cleanly
    at 320 and 640 CSS pixels. ChiShona and isiNdebele activation remains gated
    on the localisation framework and qualified review.

## Commercial policy

The current governed catalogue is authoritative:

| Plan | Location allowance |
|---|---:|
| Starter | 1 |
| Growth | 2 |
| Business | 5 |
| Enterprise | Contracted |

Finite limits come from the seeded plan feature `inventoryLocations`; they are
not inferred from client copy or submitted by the browser. Enterprise remains
explicitly contract-scaled because tenant-specific entitlement overrides are
not yet implemented. This mission must not claim that negotiated Enterprise
capacity management is live.

Downgrades never delete locations or stock. If a tenant already exceeds a new
finite allowance, all existing locations remain readable and usable, but
creating another is blocked until capacity is increased or the tenant reduces
future configuration through a separately approved lifecycle workflow.

## Permissions, tenant isolation and audit

- Tenant identity comes only from the verified authenticated server context.
- Operational reads retain `inventory.read`; settings administration accepts
  `settings.manage` or `inventory.write` and is enforced server-side.
- Every lookup and mutation includes the authenticated tenant ID. A location ID
  from another tenant is not disclosed or modified.
- Create/update/default actions are atomic and audited. Audit metadata records
  bounded changed-field and capacity facts, not secrets or full addresses.
- Location administration never writes `stock_movements`, `stock_levels`,
  journals, financial history or production data.

## Data, migration and rollback

The existing `warehouses`, `plans` and `subscriptions` schema is sufficient.
No table, column, index or production DDL is required. The change is additive at
the API and UI level and uses the current plan feature JSON.

Rollback reverts the settings routes/service, UI/catalogue/CSS and tests.
Canonical warehouse and historical stock records remain intact. A rollback
must not delete locations created while this capability was enabled.

## Localisation, accessibility, mobile and AI

- New interface copy belongs to the typed English catalogue. Machine values,
  plan names, IDs and colours remain locale-independent.
- Forms use persistent labels/hints, textual validation and status messages,
  visible focus and minimum practical touch targets; status is never conveyed
  by colour alone.
- Location cards and colour controls reflow to one column at 320 CSS pixels and
  two-column layouts only where space permits.
- No AI or provider is involved. Deterministic server-side entitlement,
  permission and canonical-record rules remain authoritative.

## Out of scope

- Warehouse deletion, archival, transfer/count workflows or stock-history
  changes.
- Warehouse-specific permissions, geocoding, maps, bins, zones or legal-entity
  modelling.
- Tenant-specific Enterprise contracts, add-ons, entitlement overrides,
  grandfathering automation or the full versioned entitlement catalogue.
- Changes to product, stock, invoice, purchase or goods-receipt business rules.
- A whole-product redesign, colour contrast certification or release of
  ChiShona/isiNdebele translations.
- Production database operations or deployment.

## Acceptance criteria

- Mission Pack is committed before implementation.
- Settings reads and writes the canonical tenant-scoped `warehouses` rows.
- Blank location name derives from the first non-empty address line; blank name
  plus blank address is rejected with a clear message.
- Starter/Growth/Business limits are enforced server-side and concurrency-safe;
  Enterprise response is labelled contract-scaled, not falsely fixed.
- Create/update/default behavior is permission checked, tenant isolated and
  audited, with no effects on rejection.
- Existing location GET shape and stock-entry dropdown behavior remain
  compatible.
- Primary/accent controls expose labels, role help, swatch and exact validated
  hex values, and remain keyboard-operable without colour-only meaning.
- Settings provides loading, empty, error/retry, busy, success and limit states
  and reflows at 320/640/desktop widths.
- Server tests cover capacity, default naming, audit, RBAC, tenant isolation,
  concurrency and downgrade/excess behavior. Web model/accessibility/design
  gates cover colour and responsive contracts.
- Server/web typechecks, relevant tests, web production build, design-token and
  accessibility conformance and `git diff --check` pass. Full DB-backed suite
  remains the merge gate.

