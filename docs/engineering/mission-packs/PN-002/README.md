# PN-002 — Business directory (published snapshots only)

**Programme:** PN — Business Network (Master Build Plan Part II)
**Status:** BUILT (2026-07-15) — ⚠️ privacy-review gate OPEN (see below)
**Depends on:** PN-001 — satisfied
**Feature flag:** `network.directory` (same flag as PN-001; default OFF)
**Migration:** none (reads `business_profiles` published rows only)

## What this delivers

Cross-tenant business discovery with a hard privacy boundary:

- `GET /network/directory?category=&city=&q=&country=` — searches ONLY rows
  with `status = 'PUBLISHED'`, and projects ONLY the frozen
  `published_snapshot` (+ opaque profile id + publishedAt). Draft columns
  are never selected for other tenants; the tenant id is never exposed.
- `GET /network/directory/:id` — detail by opaque profile id; 404 unless
  PUBLISHED with a snapshot.
- Filters: closed category list (jsonb containment), case-insensitive city,
  ILIKE text over displayName/tagline/description. Results capped at 200.

The DB CHECK from PN-001 (snapshot forbidden on non-PUBLISHED rows) makes
"unpublished ⇒ invisible" a database-level invariant, not just a query
convention.

## Privacy proofs in tests (business-profile 14/14)

- Tenant B sees tenant A's published snapshot with NO tenantId, NO status,
  NO showContact flag; contact details present only because A opted in.
- Stale drafts never leak: after A edits ("SECRET DRAFT NAME"), the
  directory still serves the frozen snapshot; the draft string is provably
  absent from the response body.
- Unpublish removes the listing immediately; detail view 404s.
- Regression: critical + settings + finance tenant-isolation 19/19;
  typecheck clean.

## ⚠️ Gate before enabling for tenants

The master plan marks PN-002 **"T + P (privacy review)"**. The build is
dark and fail-closed; before `network.directory` is enabled for any real
tenant, a privacy review should confirm: consent wording at publish time,
the snapshot field set, contact-details opt-in UX, and takedown handling.
Record the review outcome in this pack, then enable per pilot tenant.

## Follow-ups

- PN-003 directory enquiries → CRM leads (consent-first, rate-limited).
- Web UI for profile management + directory browsing (no web changes in
  this mission).
