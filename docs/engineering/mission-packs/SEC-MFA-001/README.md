# SEC-MFA-001 — Mandatory MFA enrollment for platform admins

**Owner:** Dr. Washington Kapapiro
**Status:** READY TO IMPLEMENT (authored 2026-07-20 via Cowork repo reconnaissance)
**Guard already staged:** `server/src/mfa-policy.ts` is written to the working tree as an UNTRACKED file (branch-agnostic — it survives a `git checkout -b` off `main`). Only the `routes.ts` edits and tests remain to apply on the clean branch.
**Migration:** none required (policy logic over existing `user_mfa_factors`)
**Next free migration remains:** 0057 (this mission reserves nothing)
**Endpoint manifest impact:** none (no new/changed paths) — tenant-isolation regression count unchanged
**Risk:** low for the additive `/me` signal; medium for the enforcement guard (updates seeded-admin test expectations — see Verification)

---

## Problem

Reconnaissance of the live codebase (2026-07-20) confirmed MFA is **fully built and
enforced-on-enrollment**: `beginMfaEnrollment` / `verifyMfaEnrollment` /
`verifyMfaLogin` and the `/auth/mfa/*` routes exist; login issues an MFA challenge
for any user with a verified factor; sessions carry `aal1`/`aal2`; and session
resolution in `auth.ts` rejects an `aal1` session once the user has a verified
factor ("Two-factor authentication required"). Rate limiting covers `/auth/mfa`
and every credential surface (`security.ts`).

The single gap: **enrollment is optional.** A search for forced enrollment finds
nothing. A platform admin can never enroll and therefore is never challenged.

2026 cyber-insurance underwriting requires MFA **enforced** on all administrative
accounts; "available but optional" fails the application and can void a claim.
This mission closes that gap, **platform admins first**.

## Goal

1. Surface `mfaEnrollmentRequired` on `GET /me` so the web shell routes an
   un-enrolled admin into the existing enrollment flow.
2. Add a `requirePlatformMfaEnrolled` guard on the most sensitive platform-admin
   mutations, returning `403 MFA_ENROLLMENT_REQUIRED`, never gating login, `/me`,
   or the enrollment routes themselves.

Out of scope (later missions): tenant-owner enforcement (Phase 2), all-user
enforcement (Phase 3), WebAuthn factor type. No schema/migration change.

## Files to change

- `server/src/routes.ts` — additive field on `/me`; wire the guard onto selected routes.
- `server/src/mfa-policy.ts` — **new** file: the guard (full source below).
- `server/src/__tests__/…` — update seeded-admin tests that hit gated routes; add focused tests.

## Implementation

### 1. New guard — `server/src/mfa-policy.ts`

```ts
import type { RequestHandler } from "express";
import { hasVerifiedMfa } from "./auth-security.js";

/**
 * SEC-MFA-001: block a platform admin who has not verified an MFA factor from
 * performing sensitive platform mutations. Read paths, login, /me and the
 * enrollment routes are never gated, so an un-enrolled admin can still sign in,
 * read, and reach enrollment — they simply cannot perform privileged writes
 * until MFA is on. Non-admins are unaffected (pass straight through).
 */
export const requirePlatformMfaEnrolled: RequestHandler = async (req, res, next) => {
  try {
    const auth = (req as any).auth;
    if (!auth?.isPlatformAdmin) return next();
    if (await hasVerifiedMfa(auth.userId)) return next();
    return res.status(403).json({
      error: "MFA_ENROLLMENT_REQUIRED",
      message: "Enable two-factor authentication to perform this action.",
    });
  } catch (e) {
    next(e);
  }
};
```

### 2. `/me` signal — `server/src/routes.ts` (additive, non-breaking)

`hasVerifiedMfa` is already exported from `./auth-security.js` and imported into
`routes.ts`. In the `GET /me` handler, compute and return one new field:

```ts
// alongside the existing awaits in api.get("/me", ...):
const mfaEnrollmentRequired =
  req.auth!.isPlatformAdmin && !(await hasVerifiedMfa(req.auth!.userId));

// in the returned object, add the field (everything else unchanged):
return {
  ...req.auth,
  user: { ...currentUser, ...staffProfile },
  features: await enabledFeaturesFor(req.auth!.tenantId),
  mfaEnrollmentRequired,          // <-- SEC-MFA-001
  tenant: t ? { /* ...unchanged... */ } : null,
};
```

### 3. Wire the guard (`server/src/routes.ts`)

Apply `requirePlatformMfaEnrolled` to the highest-value platform-admin mutations
that are already behind step-up. Do **not** apply it to `/auth/*`, `/me`, or
`/auth/mfa/enroll*`. Suggested first targets:

```ts
// platform staff management, tenant feature-flag toggles, platform verification review, e.g.:
api.put(
  "/platform/tenants/:id/features/:key",
  requireStepUp,
  requirePlatformMfaEnrolled,   // <-- SEC-MFA-001
  wrap(/* ...unchanged... */),
);
```
Add the import: `import { requirePlatformMfaEnrolled } from "./mfa-policy.js";`

## Verification (hosted gate is authoritative)

1. `npm run typecheck` (root) — clean.
2. **Seeded-admin tests:** existing tests seed a platform admin without MFA. Any
   test exercising a route you gate will now receive `403` and must enroll+verify
   MFA first (reuse `beginMfaEnrollment`/`verifyMfaEnrollment`) or assert the new
   `403 MFA_ENROLLMENT_REQUIRED` contract. Expect to touch a handful of tests.
3. Add focused tests:
   - `/me` → `mfaEnrollmentRequired: true` for an admin with no factor; `false`
     after enrollment; `false` for a non-admin.
   - a gated route → `403 MFA_ENROLLMENT_REQUIRED` for an un-enrolled admin,
     `200` after enrollment.
4. Tenant-isolation regression: unchanged endpoint set → green with no manifest edit.
5. Migration drift check: no migration → prove zero drift unchanged.

Sandbox note (per SESSION-HANDOFF verification pattern): the full server suite
needs embedded-postgres and ~250s; run it via the documented scratch-Postgres
flow or hosted CI — not inline.

## Rollout

- **Phase 1 (this mission):** admins. Ship the `/me` signal first (web starts
  routing admins to enrollment); enable the guard on sensitive routes after a
  short grace window for admins to enroll.
- **Phase 2/3 (later):** tenant owners, then all users — separate packs.

## Definition of done

- [ ] `server/src/mfa-policy.ts` added
- [ ] `/me` returns `mfaEnrollmentRequired`
- [ ] guard wired to the selected sensitive platform mutations
- [ ] affected seeded-admin tests updated; focused tests added
- [ ] typecheck + full server suite + tenant-isolation regression green on hosted CI
- [ ] `SESSION-HANDOFF.md` updated; final `chore(handoff)` commit
- [ ] evidence captured for the cyber-insurance application ("MFA enforced on all admin accounts: yes")

## Provenance

Authored from direct inspection of the live repo (auth.ts, auth-security.ts,
routes.ts, security.ts) and `vaka-os-prod`, where `user_mfa_factors` has 0 rows
(no one enrolled yet). This pack was placed as a new, untracked file to avoid
disturbing the uncommitted `feature/ai-foundation` working tree; implement it on
a clean branch off `main` per protocol.
