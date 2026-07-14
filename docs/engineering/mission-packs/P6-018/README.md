# P6-018 — Tenant-branded Secure Holding and Sign-out Experience

**Status:** Implementation complete and locally verified; remote database and release gates pending
**Programme:** 6 — Application shell, navigation and workbench
**Type:** Public tenant entry, explicit sign-out destination and inactivity privacy policy
**Depends on:** P6-001 design system; P6-002 shell; P9-008 session controls; existing tenant branding

## Outcome

Returning tenant users can sign in from a purpose-built, tenant-branded holding
page instead of returning to VAKA's marketing homepage. Tenant administrators
can choose whether explicit sign-out returns to that page or the public VAKA
home page, configure a safe promotional message and opt into inactivity
sign-out. After the configured idle period, the authenticated session is ended
server-side before the holding page is shown.

## Current behaviour

- Explicit sign-out revokes the current server session, clears the token and
  returns every user to the generic public landing page.
- Brand settings include company name, logo and colours, but there is no public
  safe tenant-brand endpoint or stable tenant entry URL.
- Server sessions have idle/absolute expiry controls, but the web application
  does not offer tenant-configured short inactivity sign-out.
- There is no governed promotional/wallpaper content model; arbitrary HTML or
  third-party advertising scripts must not be introduced.

## Target behaviour

1. Add tenant settings for explicit sign-out destination, inactivity sign-out
   enabled/minutes, holding-page heading/message and optional structured offer
   title/body/CTA label/HTTPS URL.
2. Only `settings.manage` may update these bounded tenant-scoped settings; the
   full before/after policy is audited without secrets.
3. Add a public read-only endpoint by normalized subdomain returning only safe
   company name, logo, colours and enabled holding copy. Never expose tenant ID,
   status, plan, users, internal settings, addresses or other business data.
4. Give each tenant a stable `/workspace/:subdomain` entry experience with a
   subdomain-locked sign-in form, home-page link and clear VAKA attribution.
5. Explicit sign-out revokes the server session first, then follows the saved
   destination. Failed network revocation still clears local access, shows a
   safe message and relies on server session expiry/revocation controls.
6. Optional inactivity policy observes keyboard, pointer, touch, focus and
   visibility activity. The minimum allowed period is five minutes.
7. When the period elapses, call authenticated sign-out and clear credentials
   before rendering/navigating to the public holding page. Never place a visual
   wallpaper over a still-authenticated application.
8. Inactivity applies per tab/session; no background timer refreshes session
   authority. A one-minute accessible warning with “Stay signed in” is shown
   when the configured period permits it.
9. Promotions use plain structured text and an optional allowlisted HTTPS link.
   No arbitrary HTML, script, iframe, third-party tracker or ad network runs.
10. Missing/invalid tenant or unavailable public configuration falls back to
    the generic VAKA sign-in/home experience without leaking existence details.

## User, outcome and measure

- **Users:** Returning tenant staff; tenant owners/administrators configuring
  workspace presentation; security reviewers.
- **Problem:** Returning users lose company context at sign-out, while a visual
  idle wallpaper would leave sensitive data/session authority behind it.
- **Result:** A branded direct-entry experience and configurable, real session
  termination protect privacy while preserving tenant choice.
- **Measure:** Explicit and timed sign-out revoke the current session, direct
  tenant login succeeds, public responses expose only allowlisted fields, and
  responsive/accessibility checks pass at mobile and desktop widths.

## Permissions, audit, privacy and failure behaviour

- Public lookup is by normalized subdomain and returns the same generic not-found
  behavior for missing/unavailable tenants. It is rate-limited.
- Settings writes derive tenant and user from authenticated server context and
  require `settings.manage`.
- Audit `settings.holding_page_updated` captures bounded policy fields; it does
  not capture passwords, tokens or arbitrary rich content.
- Promotion links allow HTTPS only. Logo validation retains existing policy.
- Idle detection is a convenience privacy control, not a replacement for
  server session expiry, MFA, device revocation or step-up authorization.
- If holding configuration cannot load, sign-in and the public-home link remain
  available with VAKA defaults.

## Localisation, accessibility and design system

- All controls/copy enter the typed English catalogue; Shona and Ndebele use
  explicit English fallback until reviewed translations exist.
- Heading/body lengths are bounded and layouts tolerate longer future strings.
- The holding page uses governed brand colour normalization, readable contrast,
  visible focus, 44px controls, reduced motion and 320px reflow.
- The idle warning uses an accessible dialog/status pattern, does not rely on
  colour and permits keyboard/touch continuation.

## Acceptance criteria

- Mission Pack is committed before implementation.
- Cross-tenant settings writes are impossible and public output is allowlisted.
- Explicit and timed sign-out both revoke the server session and clear the token.
- Tenant administrators can choose public-home vs holding-page destination and
  configure safe structured promotional content.
- Holding-page sign-in is subdomain-locked and does not require visiting home.
- Five-minute minimum and warning behavior have deterministic tests.
- No arbitrary HTML/script/tracking content is accepted or rendered.
- Server/web tests, typechecks, build, accessibility, mobile reflow and
  `git diff --check` pass.

## Rollout and rollback

Ship nullable/defaulted tenant settings with holding pages disabled as the
explicit sign-out destination for existing tenants. Tenants opt in through
settings. Rollback returns logout to the generic landing page and disables idle
listeners; additive settings and audit history may remain safely unused.
