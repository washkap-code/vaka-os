# CO-006 Completion Report

**Date:** 2026-07-14
**Status:** Implementation complete and locally verified; remote database gates and live merchant activation pending

## Delivered

- Added an environment-only, disabled-by-default Paynow merchant configuration
  with explicit currency and dedicated poll-reference encryption material.
- Added a signed-message Paynow adapter using ordered SHA-512 message hashing,
  constant-time inbound comparison, approved HTTPS Paynow hosts, bounded payloads
  and request timeouts.
- Added tenant-owned, exact-value subscription payment attempts with unique
  merchant references, idempotency keys, normalized lifecycle states, encrypted
  poll URLs and audit timestamps.
- Added tenant payment-provider availability, attempt list, initiate and status
  refresh routes behind authenticated tenant context and `billing.manage`.
- Added a bounded public Paynow result endpoint that verifies the signed form,
  resolves the opaque reference and re-polls the stored provider URL before any
  settlement decision.
- Extended the controlled subscription settlement transaction so verified
  attempt evidence, invoice paid state, tenant reactivation and audit evidence
  commit atomically and duplicate confirmation remains idempotent.
- Added tenant billing UI for truthful availability, secure Paynow hand-off,
  pending/status checks and provider-return reconciliation.
- Replaced raw platform billing-run JSON with timestamped action cards and an
  explicit successful no-op explanation.

## Verification evidence

- Server TypeScript: passed.
- Paynow/config unit tests: 13/13 passed, including Paynow's official published
  outbound and inbound hash vectors, tamper rejection, redirect-host rejection,
  encrypted poll evidence and disabled/partial configuration gates.
- Tenant/list/cross-tenant/atomic-settlement database contracts were added for
  the remote PostgreSQL quality environment.
- Full local server suite was attempted inside and outside the sandbox. The
  HTTP-listener restriction was resolved outside the sandbox, but database tests
  remained blocked because the local PostgreSQL instance has no `jonomi` role
  and no task-specific `DATABASE_URL`. No database-backed pass is claimed.
- Web TypeScript, design-token conformance, accessibility, navigation, homepage,
  invoice-PDF regression and production build: passed.
- `git diff --check`: passed before the release commit.

## Finance and trust outcome

No tenant sales invoice, customer payment, journal, tax amount, stock record or
posted history is changed by initiation, pending, failure or browser return.
Only an authenticated server-to-server poll with valid signed evidence, exact
merchant reference and exact stored amount may settle a VAKA subscription
invoice. Provider secrets remain environment-only; poll URLs are encrypted and
excluded from API/audit responses. Refund, dispute and reversal accounting
remain explicitly gated for a later approved mission.

## Activation gate

Live collection is not claimed. Production activation still requires an
approved VAKA Paynow merchant profile, Integration ID, Integration Key,
dedicated encryption key, settlement currency, approved callback/return origin,
successful/cancelled/tampered/duplicate end-to-end evidence and settlement
reconciliation. Until those are supplied, the UI truthfully reports that online
payment is unavailable and exposes no payment button.

## Rollback

Set `PAYNOW_ENABLED=false` to stop new payment attempts without deleting
evidence. Revert the routes/UI/adapter if required; retain the additive table and
audit history for reconciliation. Never delete or rewrite a settled attempt.
