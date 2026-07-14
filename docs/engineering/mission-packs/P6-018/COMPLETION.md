# P6-018 Completion Report

**Date:** 2026-07-14
**Status:** Implementation complete and locally verified; remote database and release gates pending

## Delivered

- Added tenant-controlled explicit sign-out destination, optional inactivity
  sign-out period, holding-page welcome copy and structured offer fields.
- Added a permission-protected, tenant-derived settings route with a five-minute
  minimum, HTTPS-only offer link pairing and content-minimised audit evidence.
- Added an allowlisted, rate-limited public workspace presentation endpoint that
  excludes tenant ID, lifecycle, plan, users, addresses and internal settings.
- Added stable `/workspace/:subdomain` entry pages with tenant logo/colours,
  locked-workspace sign-in, password recovery, password visibility, safe offer,
  VAKA-home link and restrained VAKA attribution.
- Explicit sign-out now revokes the server session before following the tenant's
  saved destination. Network failure still clears local credentials safely.
- Optional inactivity behavior counts background-tab time, warns one minute
  before expiry in the existing focus-trapped dialog and performs real server
  sign-out before showing the holding page.
- Added company settings and a safe preview link. No arbitrary HTML, iframe,
  script, tracker or advertising network is accepted or rendered.

## Verification evidence

- Web TypeScript and production build: passed.
- Design-token conformance: passed with the existing 236 governed tokens.
- Accessibility conformance and negative fixture: passed.
- Shell/navigation and deterministic inactivity-policy tests: 14/14 passed.
- Homepage regression: 4/4 passed; invoice-PDF regression: 3/3 passed.
- Desktop 1440x1000 browser check: branded content, offer, home link and locked
  `waskap` workspace field visible; no page overflow, overlay or console error.
- Mobile 320x800 browser check: sign-in visible, locked workspace retained, no
  horizontal overflow, overlay or console error. The only discovered copy defect
  (a trailing separator after Forgot password) was corrected and reverified.
- Database-backed settings/public allowlist/audit contract added. Local execution
  is blocked only by the absent local `jonomi` PostgreSQL role; remote CI remains
  the authoritative database gate.
- `git diff --check`: passed before the release commit.

## Security and design-system outcome

The holding page is a public presentation surface, not an authenticated
wallpaper. Timed inactivity always ends server authority and clears local access
before navigation. The design-system skill materially shaped the delivery:
tenant-safe colour roles, governed tokens, existing form/password patterns,
focus-trapped warning behavior, 44px actions and responsive stacking were reused
instead of creating an unrelated theme.

## Rollback

Set tenants to `PUBLIC_HOME` and disable inactivity sign-out, then revert the
public page/settings/listeners if required. Additive nullable presentation fields
and audit history may remain safely unused.
