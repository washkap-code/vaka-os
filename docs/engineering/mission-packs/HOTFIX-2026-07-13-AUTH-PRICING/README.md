# Production Hotfix — Authentication, Identity and Commercial Offer Alignment

**Status:** Approved by owner for urgent implementation
**Date:** 2026-07-13
**Environment:** Vercel production with shared Supabase `vaka-platform`

## Incident

The owner reported that existing credentials could not reach either the tenant
workspace or platform administration and that signup still advertised obsolete
three-month trial terms and old backend package values.

Production evidence established three independent causes:

1. deployed authentication selected `tenants.country_code`, while production
   had not received additive migration `0015`; authenticated requests therefore
   returned HTTP 500 before credentials could complete the journey;
2. both the Nomvuyo tenant owner and the tenantless platform administrator used
   `waskap@me.com`, while email-only login selected an arbitrary first match;
3. the homepage displayed the current USD 19 / 69 / 249 / 599 commercial
   direction, but server seed/billing plans remained USD 12 / 30 / 75 / 150 and
   signup still created a broad three-month trial.

Earlier production logs also showed `user_sessions` missing after deployment.
The recurring operational cause is that code deployment is not gated on the
minimum production schema required by authentication.

During verification, the owner also reported that creating a customer returned
an unexpected error. Production evidence showed the contact transaction had
committed, but post-commit event publication tried to construct an email
transport with incomplete optional provider configuration. The API therefore
returned HTTP 500 after success and encouraged three identical retries.

## Approved target

- Preserve `waskap@me.com` as the active Owner of the Nomvuyo tenant workspace.
- Use `washington@africaprocure.com` only for the active tenantless VAKA
  platform-administrator identity.
- Preserve existing password hashes; do not put passwords in source, migration
  SQL, logs, commits or chat. Platform admin remains forced to change the
  existing temporary password on successful first login.
- Make email-only login deterministic: accept a unique account, require the
  company subdomain when the same email belongs to multiple tenant accounts,
  and never choose an arbitrary database row.
- Adopt the currently published package catalogue as the governed standard:
  Starter USD 19 / 1 user / 1 location; Growth USD 69 / 5 users / 2 locations;
  Business USD 249 / 15 users / 5 locations; Enterprise from USD 599 with
  contracted scale.
- Use a 30-day standard trial for new signups. Preserve existing trial end dates
  rather than retroactively shortening a customer's agreed period.
- Align homepage, signup, workspace upgrade/billing copy, seed reference data,
  decision log, pricing documentation and tests.
- Add a read-only production-schema compatibility gate for authentication so a
  deployment cannot report ready when its required login tables/columns are
  absent.
- Never return a false write failure after a business transaction has already
  committed. Log post-commit projection/delivery failures for operations while
  returning the committed result to the user.
- Keep optional email delivery unavailable when it is not configured without
  preventing customer, search, timeline, finance or stock events from loading.

## Production database boundary

The database is shared with GENFIN. Never run `drizzle-kit push`, drop/reset a
schema, or target `genfin_*` objects. Production repair is limited to explicit,
additive VAKA migrations and narrow audited identity/reference-data updates.
Finance behavior, balances, journals, tax values and historical subscriptions
remain unchanged.

## Verification

- Unit/API tests for unique and ambiguous email login, tenant/platform scope,
  new 30-day signup and canonical package values.
- Read-only production schema probe for authentication prerequisites.
- Guarded clean local database preparation and full server suite.
- Web typecheck/build plus browser checks for Sign in as the primary existing-
  user path, accurate signup offer and both portal gates.
- Production smoke check must show no authentication HTTP 500/runtime schema
  error. Final credential success requires the owner-held passwords and must be
  confirmed without disclosing them.

## Rollback

Revert the application/configuration changes and restore previous commercial
copy only if required. Do not roll back the additive `country_code` column or
delete migration history. Identity rollback would restore only the platform
admin email after revoking active sessions and recording a new platform audit
event; it must never alter the Nomvuyo tenant user.
