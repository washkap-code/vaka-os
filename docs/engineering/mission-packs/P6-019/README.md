# P6-019 — Tiered Holding-page Advertising and Tenant Layout Integrity

**Status:** Approved for implementation
**Programme:** 6 — Application shell, navigation and workbench
**Type:** Commercial entitlement, platform-managed public content and responsive layout repair
**Depends on:** P6-018 holding pages; Book Twenty commercial controls; P6-001 design system; current Starter, Growth, Business and Enterprise catalogue

## Outcome

Every tenant sign-out returns staff to that tenant's branded workspace page.
Business and Enterprise tenants may manage their own plain-text holding-page
advertisement. Starter and Growth tenants cannot manage advertisements; their
holding pages use the safe default campaign selected by an authorised VAKA
platform administrator. Tenant settings remain readable and usable without
helper text overlapping controls at desktop or mobile widths.

This mission supersedes P6-018 only where P6-018 allowed tenants to choose the
public VAKA homepage after sign-out or allowed every plan to manage promotional
content. Its session-revocation, privacy, localisation, safe-link and public-data
minimisation requirements remain authoritative.

## Current behaviour

- A tenant administrator can choose either the VAKA homepage or the tenant
  holding page as the explicit sign-out destination.
- Starter, Growth, Business and Enterprise tenants can all save and publish
  their own holding-page offer fields.
- There is no platform-admin control for the lower-tier default advertisement.
- Shared `.field-help` styling uses a negative top margin. Rendered settings
  evidence shows helper sentences overlapping the following control row.
- Explicit sign-out is decided in the browser from mutable tenant settings.

## Commercial decision and entitlement

- `holdingPageAdvertising: true` is an implemented server-side entitlement for
  **Business** and **Enterprise**.
- **Starter** and **Growth** are non-entitled lower tiers. They receive the
  current platform default campaign when it is enabled.
- One platform default campaign is active at a time in this bounded mission.
  Supporting schedules, rotation, targeting, impressions, third-party adverts
  or tracking requires a separate privacy and commercial mission.
- Stored lower-tier tenant advert copy is retained but is neither editable nor
  published while the entitlement is absent. Upgrade can restore access without
  destructive data loss.

## Target behaviour

1. Tenant explicit and inactivity sign-out revoke the server session, clear
   browser authority and navigate to `/workspace/:subdomain` every time.
2. The settings API always persists the holding-page destination. The browser
   cannot select or restore public-home sign-out for a tenant.
3. Plan features in the accepted catalogue carry the advert entitlement.
   Server-side subscription/plan evidence is authoritative.
4. Non-entitled tenants cannot set non-empty advert title, body, button label or
   URL through the API. Safe clearing remains allowed.
5. The public holding endpoint publishes tenant advert fields only for entitled
   plans. Otherwise it publishes the enabled platform default campaign.
6. Platform staff with `platform.settings.manage` can read and update the
   singleton lower-tier campaign. Writes are validated and audited.
7. Campaign content is bounded plain text with an optional paired HTTPS label
   and URL. No HTML, script, iframe, pixel, tracker or arbitrary embed exists.
8. Tenant settings explain the current plan entitlement. Lower tiers see the
   platform-managed state and an upgrade path, not disabled editable controls.
9. Shared field layout reserves normal document flow for labels, controls,
   hints and errors. Text expansion does not overlap neighbouring boxes.
10. Settings and holding pages reflow at 390px without horizontal page overflow;
    keyboard focus, readable contrast and 44px primary actions remain intact.

## Permissions, audit and tenant isolation

- Tenant identity comes only from authenticated server context.
- `settings.manage` controls tenant holding-page settings. The plan entitlement
  is an additional server-side condition for tenant advert writes.
- `platform.settings.manage` controls the VAKA default campaign.
- Platform campaign writes record `platform.holding_advert_updated` with actor,
  enabled state and bounded configuration flags, not campaign copy or URLs.
- Tenant holding updates continue to record `settings.holding_page_updated` and
  include the evaluated advert entitlement and whether content was cleared.
- The public endpoint returns only the already-approved company presentation
  fields and selected campaign. It never exposes plan, subscription, tenant ID,
  internal campaign key, staff identity or audit evidence.

## Failure and rollback

- Missing subscription/plan evidence fails closed to the non-entitled path.
- A missing, disabled or invalid platform campaign produces no advertisement;
  login remains available.
- Failed sign-out network revocation still clears local authority and navigates
  to the known tenant holding page; server expiry/revocation remains the backstop.
- Rollback disables the platform campaign and hides advert editors. Preserve
  campaign and tenant copy for audit and future reactivation. Do not restore
  tenant sign-out to the public homepage.

## Localisation and data protection

- New interface copy is added to the typed English catalogue with explicit
  Shona and Ndebele fallback pending qualified translation review.
- Campaign text is public promotional content. Administrators are warned not to
  enter personal, confidential, financial or authentication data.
- No advertising telemetry or third-party network is introduced.

## Verification

- Server tests cover Business/Enterprise entitlement, Starter/Growth denial,
  public campaign selection, failed-closed plan lookup, permissions and audit.
- Navigation tests prove tenant sign-out always resolves to its workspace.
- Type-check, production build, design-token and accessibility checks pass.
- Browser verification covers tenant settings and holding pages at 1440px and
  390px, with screenshots, no overlay, no console error, no clipped helper text
  and no horizontal page overflow.
- Production release requires additive migration verification, remote checks,
  live workspace smoke tests and a runtime-error scan.

