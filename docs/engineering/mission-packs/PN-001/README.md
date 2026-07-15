# PN-001 — Opt-in public business profile

**Programme:** PN — Business Network (Master Build Plan Part II)
**Status:** DONE (2026-07-15) — built and verified in the Cowork lane
**Depends on:** FLAG-002 — satisfied
**Feature flag:** `network.directory` (default OFF for every tenant)
**Migration:** `0041_business_profiles.sql` (additive, idempotent)

## What this delivers

The owner-controlled public face of the canonical Company (the tenant),
with a privacy model enforced in this order:

1. **Nothing public by default** — no row means nothing exists anywhere.
2. **Editing never leaks** — drafts and edits are private until published.
3. **Publishing freezes a snapshot** — only the fields the owner chose;
   contact details included only when `showContact` is true. The PN-002
   directory will read ONLY published snapshots — never live rows, never
   tenant statutory data.
4. **Unpublishing removes the snapshot immediately** (DB CHECK forbids a
   snapshot on any non-PUBLISHED row).

## Surface (dark behind `network.directory`)

- `GET /network/profile` — management view (`settings.manage`); defaults
  derive from the canonical Company; `staleSincePublish` tells the UI the
  draft has drifted from the public snapshot.
- `PUT /network/profile` — save draft (`settings.manage`), audited
  (`business_profile.created/updated`). Validation: 1–3 categories from the
  closed `BUSINESS_CATEGORIES` list, HTTPS-only website, email/phone shape,
  length caps matching DB CHECKs.
- `POST /network/profile/publish` — **tenant OWNER only**, audited
  (`business_profile.published`); requires a saved profile with ≥1 category.
- `POST /network/profile/unpublish` — **tenant OWNER only**, audited.

## Files

- `server/drizzle/0041_business_profiles.sql`
- `server/src/db/schema.ts` (businessProfiles)
- `server/src/business-profile.ts`
- `server/src/routes.ts` (4 routes)
- `server/tests/business-profile.test.ts` (10 tests)

## Verification (scratch Postgres, 2026-07-15)

- business-profile 10/10: fail-closed without flag; canonical defaults;
  validation rejections (empty categories, http website, unknown category);
  audited draft save with nothing public; owner publish with
  contact-excluded snapshot; post-publish edits provably frozen until
  republish (then opted-in contact appears); non-owner publish refused;
  publish-without-save rejected; unpublish clears snapshot + 409 on repeat;
  tenant isolation.
- Regression: critical + settings 16/16, blackbook 27/27, feature-flags 8/8
  (admin-credential suites verified per-file with the documented seed
  reset), finance tenant-isolation green in batch.
- Server typecheck clean. No web changes (directory UI arrives with PN-002).

## To pilot

1. Apply `0041_business_profiles.sql` to production (idempotent) BEFORE
   pushing the code.
2. Enable `network.directory` for pilot tenants; owners complete and
   publish their profiles.

## Follow-ups

- PN-002 directory (search/categories/locations) reads published snapshots
  only — carries the privacy-review gate.
- Logo/branding reuse from tenant branding can join the snapshot later
  behind the same owner-controlled publish step.
