# P7-001 — Completion Report

**Implementation:** Complete for the approved bounded explicit-send scope
**Technical verification:** Complete
**Availability:** Authenticated finance send APIs plus invoice-record confirmation UI
**Production gate:** Provider/domain approval, retry/webhook/rate/deliverability operations remain open
**Completed on:** 2026-07-13

## Delivered

- Append-only, tenant-scoped customer EMAIL preference events recording current
  `CONSENTED`/`OPTED_OUT` status, locale, evidence source, optional reason,
  actor and time.
- `crm.read` preference read and `crm.write` preference record commands with
  strict zod inputs, canonical contact checks and atomic audit evidence.
- Typed/versioned catalogues for invoice, customer-statement, payment-reminder
  and in-app outcome notifications.
- Explicit English fallback for stored `sn-ZW`/`nd-ZW` preferences; unreviewed
  finance translations remain disabled and requested/resolved locale is audited.
- Exact, currency-separated customer statement summaries over issued/partial/
  paid customer invoices, with reconciliation checks and no cross-currency sum.
- `accounting.post`, confirmation and `Idempotency-Key` protected commands for:
  - issued/partial invoice delivery;
  - as-at customer statement summary delivery; and
  - manual overdue-invoice payment reminders with positive outstanding value.
- Idempotent domain claims/outcomes that prevent same-key duplicate provider
  sends and reject same-key/different-input reuse.
- P1-004 EMAIL delivery plus initiating-user IN_APP success/failure outcomes,
  using canonical tenant/customer/invoice values only.
- P1-007 14-day opaque invoice links created after validation. Bearer URLs are
  sent to the provider but redacted from persisted notification history and
  audit metadata.
- Finance-domain sent/failed/suppressed audit evidence containing template,
  locale, consent event, provider-acceptance status and entity references
  without message bodies, bearer tokens or unnecessary customer data.
- Provider failure evidence that never changes invoice, payment, journal,
  ledger, tax, stock or numbering state.
- Invoice-record UI adoption with explicit recipient confirmation, a fresh
  idempotency key and visible delivery success/failure. Customer consent and
  the provider/domain production gate remain server-enforced.

## Verification evidence

- Guarded local test database preparation, migration application, finance
  integrity controls and reference-data seed: passed against `vaka_test`.
- Focused notification/delivery/document regression suite: 5 files / 13 tests
  passed.
- Clean GitHub Actions PostgreSQL/foundation suite: 62 files / 207 tests passed,
  0 failures, 0 skipped (run `29250114312`).
- Server typecheck: passed locally and in CI.
- Web typecheck: passed locally and in CI.
- Web production build: passed locally and in CI.
- `git diff --check`: passed.

## Migration and production boundary

- Added `server/drizzle/0019_finance_document_delivery.sql` with only:
  - append-only contact communication preference events; and
  - operational finance document delivery claim/outcome records.
- The migration was applied only to the guarded local test database and the
  disposable CI PostgreSQL database.
- No `db:push`, migration, DDL, or other operation was run against the shared
  production Supabase project. Production application requires separately
  authorised, reviewed additive SQL.
- Added non-secret `PUBLIC_APP_URL` configuration for absolute revocable
  customer links. Provider token/from/url remain environment-only.

## Finance and behaviour boundaries

- Issuing, sending, provider acceptance, customer receipt and payment remain
  distinct states. A send creates no journal and changes no invoice amount or
  lifecycle status.
- Payment reminders are explicit one-invoice commands. Draft, void, paid,
  future-due and zero-balance invoices fail closed.
- Customer statements are summary messages, not statutory reports or attached
  statement PDFs. Values remain separate by currency and use exact minor units.
- Platform subscription dunning was not changed and cannot send customer
  receivables communications.
- AI cannot invoke these commands or send autonomously.

## Open risks and gates

1. Email transmission requires approved provider credentials, sender-domain
   configuration, data-processing/privacy review and production deliverability
   evidence. No provider or secret is committed.
2. Delivery is synchronous provider acceptance. Durable queue/outbox recovery,
   retries, webhooks, bounce/delivery state, rate limits, DLQ, reconciliation,
   monitoring and multi-provider failover remain gated.
3. A process interruption can leave an idempotency claim in `PROCESSING`;
   recovery tooling must inspect and reconcile it before production GA.
4. `accounting.post` is the compatibility permission. A future migration should
   introduce narrower `invoices.send`/communications permissions and owner-
   governed delegation.
5. ChiShona and isiNdebele finance templates require qualified native and
   professional review before enablement; English fallback is explicit today.
6. Invoice delivery now has a dedicated confirmation action in the invoice
   record. Statement/reminder confirmation UI, recipient preview and delivery
   history/operations views remain future work.
7. Automatic/bulk dunning, SMS/WhatsApp/push, attachments, customer portal,
   statement PDF and provider analytics are not provided.

## Rollback

Revert the routes, coordinator, catalogues, statement/preference services,
notification redaction extension, schema mapping, tests and documentation.
Existing notifications and share links remain valid. The additive preference
and delivery tables may remain dormant; do not drop them from production
without separately reviewed contract/additive migration. No accounting reversal
or data conversion is required.

## Next mission

P2-006 — read-only statutory report pack export for trial balance, P&L, balance
sheet and aged receivables/payables to PDF/CSV, with professional filing gates.
