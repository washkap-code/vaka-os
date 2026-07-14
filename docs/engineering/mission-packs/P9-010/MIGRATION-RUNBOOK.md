# P9-010 Refresh-session Migration Runbook

## Purpose

Apply `server/drizzle/0025_refresh_token_rotation.sql` before application code
that issues or rotates refresh credentials. The migration is additive and keeps
all new columns nullable except the backward-compatible `aal1` assurance
default. Existing access-only sessions remain valid through their normal access
token lifetime but cannot renew.

## Preconditions

1. Confirm the target database, redacted environment, release commit and
   operator identity.
2. Confirm a current recoverable backup and the tested rollback connection.
3. Confirm `user_sessions` has no existing columns or indexes with the P9-010
   names but incompatible meanings.
4. Record active/revoked session counts and confirm the current runtime-schema
   gate passes before migration.
5. Confirm the production origin uses HTTPS. The application marks refresh
   cookies `Secure` in production and renewal must not be tested over HTTP.

Preflight:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'user_sessions'
  AND column_name IN (
    'refresh_token_hash', 'previous_refresh_token_hash',
    'refresh_rotated_at', 'assurance_level'
  )
ORDER BY column_name;
```

On a first application this returns no rows. On a retry or already migrated
environment, compare every result with migration `0025` before proceeding.

## Apply and verify

1. Apply `0025_refresh_token_rotation.sql` through the approved migration
   channel and database role.
2. Rerun the script once in staging to prove idempotency.
3. Run the runtime-schema readiness check.
4. Verify constraints and indexes:

```sql
SELECT column_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'user_sessions'
  AND column_name IN (
    'refresh_token_hash', 'previous_refresh_token_hash',
    'refresh_rotated_at', 'assurance_level'
  )
ORDER BY column_name;

SELECT indexname
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'user_sessions'
  AND indexname IN (
    'user_sessions_refresh_token_hash',
    'user_sessions_previous_refresh_token_hash'
  )
ORDER BY indexname;

SELECT count(*) AS invalid_assurance_rows
FROM user_sessions
WHERE assurance_level NOT IN ('aal1', 'aal2');
```

Both indexes must be present and `invalid_assurance_rows` must be zero.

## Staged smoke test

Use dedicated staging tenant and platform-workforce identities only.

1. Confirm an existing access-only session still works until its access token
   expires and receives a normal sign-in state afterward.
2. Sign in afresh and inspect response headers: the refresh cookie must be
   `HttpOnly`, `Secure`, `SameSite=Strict`, and scoped to `/api/v1/auth`; the
   JSON body must not contain the refresh credential.
3. Expire the access token in the controlled test setup and confirm one renewal
   restores the existing view without password entry.
4. Confirm the old access token is rejected after rotation and the new one is
   accepted.
5. In a dedicated disposable session, replay the superseded refresh cookie.
   Confirm renewal is denied, the affected session is revoked, other device
   sessions remain active, and a redacted replay event exists.
6. Confirm sign-out clears the cookie and blocks subsequent renewal.
7. Confirm an MFA-enrolled session retains `aal2` after renewal.

Never copy production refresh cookies into tickets, logs, screenshots, shell
history or test reports.

## Rollback and incident handling

- Roll back application/client code first and retain the additive columns,
  indexes and audit events. Existing access tokens continue through normal
  expiry.
- Do not drop refresh columns during an incident; they may contain necessary
  hash-only evidence and dropping them cannot retract issued credentials.
- If replay or credential exposure is suspected, revoke affected sessions (or
  all sessions when scope is uncertain), preserve audit evidence and follow the
  incident-response process.
- A database rollback that removes P9-010 columns is permitted only after the
  old application is restored and all refresh-capable sessions are revoked.
