# P9-010 — Completion report (v2, regenerated off current main)

**Branch:** `codex/p9-010-refresh-token-rotation-v2` (fresh off `main` @ c9f59ca)
**Status:** Implementation complete; all local gates green; production DDL pending hand-application.

## Files changed

| File | Change |
| --- | --- |
| `server/drizzle/0031_refresh_token_rotation.sql` | New migration (additive, idempotent, nullable refresh state) |
| `server/src/db/schema.ts` | `user_sessions`: refresh hash columns, `assurance_level`, partial unique indexes, CHECK |
| `server/src/auth.ts` | Refresh credential minting at session creation; `renewSession()` rotation + replay containment; hardened cookie helpers; unique `jti` per access token |
| `server/src/routes.ts` | `POST /auth/refresh`; refresh cookie delivery on login/signup/MFA verify (raw credential stripped from JSON); cookie cleared on sign-out |
| `server/src/app.ts` | Rate limiter on `/api/v1/auth/refresh` |
| `server/scripts/check-runtime-schema.mjs` | Runtime readiness for the four new columns |
| `server/tests/refresh-token-rotation.test.ts` | New suite (10 tests) |
| `web/src/shell/session-renewal-model.ts` | Single-flight renewal model (pure, DI) |
| `web/src/api.ts` | One background renewal on 401, then one retry; falls back to existing sign-in state |
| `web/scripts/session-renewal-model.test.mjs` + `web/package.json` | Web renewal test (7 tests) + script |
| `docs/engineering/mission-packs/P9-010/README.md` | Mission pack copied onto this branch |

No unrelated files touched: no P6 accessibility work, no `App.tsx` rewrite, no style changes, no finance behaviour changes.

## Production SQL (hand-apply BEFORE the code deploys; never `drizzle-kit push`)

```sql
ALTER TABLE "user_sessions"
  ADD COLUMN IF NOT EXISTS "refresh_token_hash" text,
  ADD COLUMN IF NOT EXISTS "previous_refresh_token_hash" text,
  ADD COLUMN IF NOT EXISTS "refresh_rotated_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "assurance_level" text NOT NULL DEFAULT 'aal1';

CREATE UNIQUE INDEX IF NOT EXISTS "user_sessions_refresh_token_hash"
  ON "user_sessions" ("refresh_token_hash") WHERE "refresh_token_hash" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "user_sessions_previous_refresh_token_hash"
  ON "user_sessions" ("previous_refresh_token_hash") WHERE "previous_refresh_token_hash" IS NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_sessions_assurance_level_check') THEN
    ALTER TABLE "user_sessions"
      ADD CONSTRAINT "user_sessions_assurance_level_check"
      CHECK ("assurance_level" IN ('aal1', 'aal2'));
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ("refresh_token_hash", "previous_refresh_token_hash") ON "user_sessions" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ("refresh_token_hash", "previous_refresh_token_hash") ON "user_sessions" FROM authenticated;
  END IF;
END $$;
```

Backward compatible: applying this DDL does not affect the currently deployed build (all new columns nullable or defaulted; existing sessions keep working and simply cannot renew until a new sign-in).

## Test evidence (scratch embedded Postgres, empty `vaka_test` db, drizzle push + integrity scripts + seed)

- `tests/refresh-token-rotation.test.ts`: **10/10 passed**, including double application of the 0031 SQL (idempotency), rotation, replay containment scoped to the affected session, unknown/malformed/missing-cookie negatives with no audit amplification, revoked/idle-expired/absolute-expired/disabled negatives, legacy access-only session compatibility, aal2 preservation + MFA-inconsistent denial, platform workforce audit, sign-out cookie clearing, and audit redaction checks.
- Full DB-backed server suite: **all 47 test files green** (finance, auth, session, procurement, imports, platform — no regressions).
- `server` typecheck: clean.
- `web`: `test:session-renewal` **7/7 passed** (single-flight, retry, failure fallback), typecheck clean, production build OK, design-token + accessibility + shell gates OK.
- `git diff --check`: clean.

## Notes

- Every access token now carries a unique `jti`, so a rotated token always supersedes its predecessor even within the same second.
- Audit events: `security.session_refreshed`, `security.session_refresh_replay` (tenant, via the kernel audit facade in-transaction) and `platform_admin.*` equivalents. Metadata is limited to session id / client type / reason — never token, cookie, IP or secret material.
- Excluded per mission: OAuth/OIDC/SAML, access-token transport cutover, CSRF cookie transport, native secure storage, distributed rate limiter, mandatory MFA.
