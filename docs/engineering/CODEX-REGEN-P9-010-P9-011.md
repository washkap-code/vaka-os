# Codex regeneration prompts — P9-010 & P9-011 (off current main)

The original P9-010/P9-011 branches bit-rotted against `main` (they re-add the old
`0024` ownership migration, bundle unrelated P6 accessibility churn and a ~500–800
line `App.tsx` rewrite, and are based on a stale `auth.ts` that predates P9-008/P9-009
on main). Rather than merge them, regenerate each cleanly off the **current** `main`.

**Context Codex must respect (current main state):**
- P9-009 explicit tenant ownership is already merged: `tenant_ownerships` table,
  `users_id_tenant_unique` constraint, and `auth.ts` derives owner authority from
  ownership. Do not re-add it.
- Highest migration on main is `server/drizzle/0030_explicit_tenant_ownership.sql`.
  New migrations must continue the sequence (P9-010 → `0031`).
- Production runs on a **shared Supabase project** (GENFIN co-located). NEVER run
  `drizzle-kit push`, `db:push`, or any destructive DDL against production. Emit
  the exact **idempotent** additive SQL in `COMPLETION.md` for hand-application.
- Keep each mission's diff **scoped to the feature**. Do not touch unrelated
  modules, accessibility docs, styles, `universal-workbench.tsx`, or rewrite
  `App.tsx` wholesale. Web changes must be the minimum needed to wire the feature.

---

## PROMPT 1 — Regenerate P9-010 (refresh-token rotation) — run now

```
Branch off the latest origin/main as codex/p9-010-refresh-token-rotation-v2.

Implement mission P9-010 "Refresh-token rotation and replay containment" fresh on
current main. Do NOT reuse the stale codex/p9-010-refresh-token-rotation branch.

Read first: docs/engineering/mission-packs/P9-010/README.md (copy it into the new
branch), docs/02-product/USER-SESSION-ACTIVITY-SPEC.md, docs/03-technical/
SECURITY-PRINCIPLES.md, and the current server/src/auth.ts + server/src/db/schema.ts.

Outcome: an authenticated web user stays signed in across short-lived access-token
expiry via server-held refresh-credential rotation, without weakening revocation,
tenant isolation or MFA assurance. Every renewal rotates the refresh credential;
reuse of a superseded credential revokes the session and records redacted evidence.

Data model (additive, nullable — use these exact columns; this DDL is already
validated). Add to the existing user_sessions table in schema.ts and as migration
server/drizzle/0031_refresh_token_rotation.sql (next free number; do NOT use 0025):

  ALTER TABLE "user_sessions"
    ADD COLUMN IF NOT EXISTS "refresh_token_hash" text,
    ADD COLUMN IF NOT EXISTS "previous_refresh_token_hash" text,
    ADD COLUMN IF NOT EXISTS "refresh_rotated_at" timestamptz,
    ADD COLUMN IF NOT EXISTS "assurance_level" text NOT NULL DEFAULT 'aal1';
  CREATE UNIQUE INDEX IF NOT EXISTS "user_sessions_refresh_token_hash"
    ON "user_sessions" ("refresh_token_hash") WHERE "refresh_token_hash" IS NOT NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS "user_sessions_previous_refresh_token_hash"
    ON "user_sessions" ("previous_refresh_token_hash") WHERE "previous_refresh_token_hash" IS NOT NULL;
  -- add CHECK (assurance_level IN ('aal1','aal2')) guarded by IF NOT EXISTS
  -- REVOKE the two refresh-hash columns from anon/authenticated roles if present.

Server behaviour:
- On new authenticated session creation (login), mint a high-entropy opaque refresh
  credential; store only its hash (domain-separated server secret material — reuse
  the existing session-hashing approach). Never persist or return the raw credential.
- Deliver the refresh credential ONLY in a Secure (production) + HttpOnly +
  SameSite=Strict + path-restricted cookie. Never expose it to application JS.
- Add a public, rate-limited POST /auth/refresh (or /auth/session/renew) that accepts
  ONLY that cookie. Lock the session row, verify it is not revoked / idle-expired /
  absolute-expired / disabled-user / MFA-inconsistent, then atomically rotate both the
  access token and the refresh credential, preserving the original absolute session
  limit. Keep the immediately previous refresh hash for replay detection only.
- On replay of a superseded credential: revoke the session, clear the cookie, return a
  generic 401, and record redacted evidence. Fail closed; scope to the affected session.
- Re-resolve active identity through the normal auth middleware on each new access
  token (renewal grants no new permissions). Preserve assurance_level across rotation.
- Password reset, MFA change, user disablement, owner/admin revocation and sign-out
  must continue to invalidate renewal immediately. Clear the refresh cookie on sign-out
  and on failed renewal.
- Existing access-only sessions remain valid until normal expiry but cannot renew
  (compatible migration).

Audit (via the kernel audit facade; metadata may include session id, client type,
reason — never token/cookie/IP/secret): security.session_refreshed,
security.session_refresh_replay, and platform_admin.* equivalents for platform
workforce sessions. Do NOT persist routine anonymous invalid-refresh attempts.

Web client (MINIMAL — do not rewrite App.tsx; touch web/src/api.ts and the smallest
wiring only): on an access-token auth failure, make ONE single-flight background
renewal call, then retry the original request once; on renewal failure, clear the
access token and return to the existing accessible sign-in state. No new visible
component, no untranslated copy.

Explicitly EXCLUDE (do not implement): OAuth/OIDC/SAML, moving access tokens out of
browser storage, CSRF-cookie transport cutover, native secure storage, distributed
edge rate limiter, mandatory MFA. Do NOT bundle any P6 accessibility work, style
changes, or unrelated docs.

Tests (server/tests/refresh-token-rotation.test.ts and a web session-renewal test):
migration idempotency + runtime schema readiness; current-token rotation; previous-
token replay containment; single-flight browser renewal; revoked/expired/disabled/
cross-session/cross-tenant negatives; MFA assurance preserved; tenant + platform
audit redaction.

Constraints & gates:
- NEVER run drizzle-kit push / db:push against production. Put the exact idempotent
  additive SQL (the block above) in docs/engineering/mission-packs/P9-010/COMPLETION.md.
- The migration and code must be backward-compatible: applying the DDL must not affect
  the currently-deployed build; the DDL will be hand-applied to production BEFORE the
  code deploys.
- Pass: server typecheck; full DB-backed server suite (npm run test:db:prepare && npm
  test) with all existing finance/auth/session tests still green; web typecheck +
  production build; git diff --check. Report a COMPLETION.md with files changed,
  the production SQL, test evidence, and confirmation no unrelated files were touched.
```

---

## PROMPT 2 — Regenerate P9-011 (privileged step-up) — run AFTER P9-010 is merged

P9-011 depends on P9-010 (session assurance) and P3-004 (governed contact deletion,
already on main). Its restore-drill-review protection also depends on OPS-016
(restore-drill evidence), which is **not yet on main** — so scope that one route out
unless OPS-016 has landed. Step-up needs **no new migration** (the proof is a stateless
in-memory HS256 token; audit uses the existing `audit_logs`).

```
Branch off the latest origin/main (which must already include P9-010 v2) as
codex/p9-011-privileged-step-up-v2. Do NOT reuse the stale branch.

Implement mission P9-011 "Privileged recent reauthentication" fresh on current main.
Read first: docs/engineering/mission-packs/P9-011/README.md (copy into the new branch),
SECURITY-PRINCIPLES.md, and the current auth.ts / routes.ts / MFA factor code.

Outcome: require a fresh password — and, when the user has an enrolled verified MFA
factor, a TOTP or one-time recovery code — before an already signed-in Owner or
Principal Platform Administrator can perform selected destructive actions. The proof
is short-lived, session-bound, audited, and held only in browser memory.

Server:
- Add an authenticated, rate-limited POST /auth/step-up. Verify the current password
  against the authenticated active identity; if a verified MFA factor exists, require
  and verify TOTP or a one-time recovery code through the existing factor boundary
  (consume recovery codes once via the existing atomic path).
- Issue a signed HS256 proof (explicit alg) with purpose "privileged-step-up", the
  user id, the current user_sessions.id, tenant context, assurance level, a unique id,
  and a MAX 10-minute expiry. Validate server-side with explicit algorithm/purpose/
  expiry/user/session/tenant binding. Never persist the proof; never place it in
  storage, URLs, logs, audit metadata, analytics or errors.
- Require a valid proof (via an X-Vaka-Step-Up header; add it to the same-origin client
  and CORS allowlist) for these existing routes, WITHOUT weakening their current
  permission/ownership/audit checks (permission checks run first, independently):
    * owner creation or status change of tenant users;
    * immediate owner contact deletion (crm.write + owner identity);
    * owner approval of a contact-deletion request;
    * platform staff creation / profile-access change (platform.staff.manage);
    * platform staff temporary-password issuance.
  Include the "Principal acceptance/rejection of restore-drill evidence" route ONLY if
  OPS-016 restore-drill evidence is present on main; otherwise omit it and note it as a
  follow-up in COMPLETION.md.
- Do NOT require proof when an ordinary staff member merely requests a contact deletion,
  nor when an Owner rejects a request without deleting data.
- Failure behaviour: missing/invalid/expired proof → 428 STEP_UP_REQUIRED, no operation;
  wrong password/MFA → generic 401 + redacted audited failure, no proof; MFA enrolled
  but code missing → explicit authenticated prompt requirement; DB/audit failure while
  issuing → no proof. Session revocation / password or MFA change / sign-out / expiry
  must prevent the protected action because the ordinary session is checked first.

Audit (metadata limited to session id, assurance/method, bounded failure class — no
secrets): security.step_up_completed / security.step_up_failed and
platform_admin.step_up_completed / platform_admin.step_up_failed. The downstream
protected operation keeps its existing audit event.

Web (reusable, accessible — reuse existing focus-trap/modal primitives; do NOT rewrite
App.tsx wholesale): a reauthentication modal with labelled fields, password show/hide,
optional authenticator/recovery input, visible focus, escape/close, safe error state,
works at 320px, and returns to the initiating action after success. Hold the proof only
for the initiating in-memory action; never persist across reloads/tabs. All copy in the
existing English catalogue.

Explicitly EXCLUDE: ownership transfer/recovery, mandatory MFA policy, SSO/OIDC,
WebAuthn/passkeys, risk scoring, trusted devices, transaction signing, bulk session
revocation, and applying step-up to any finance/billing route (finance audit phase).
No new migration. Do not bundle unrelated missions.

Tests (server/tests/privileged-step-up.test.ts + focused route tests): password-only
and MFA/recovery issuance; password/MFA failure audits + redaction; missing/expired/
malformed/wrong-purpose/cross-user/cross-session/cross-tenant proof; permission denial
even with a valid proof; each protected route positive/negative + the non-owner request
exception; proof invalidation via session revocation / password / MFA change; modal
keyboard/focus/visibility/localised-copy/static accessibility.

Constraints & gates: no production drizzle push/db:push (no migration expected anyway);
server typecheck + full DB-backed suite green; web typecheck + production build +
accessibility/shell gates; git diff --check. COMPLETION.md lists files changed, test
evidence, and confirms no unrelated files were touched and no finance route was altered.
```

---

## After each lands

I (VAKA tech lead) will, per branch: review the net diff, run the DB-backed suite on a
scratch Postgres, hand-apply the production DDL **before** pushing the code (so the live
build never references a missing column), then merge to `main` and push. P9-010 first,
then P9-011.
