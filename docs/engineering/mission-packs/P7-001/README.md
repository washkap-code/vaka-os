# P7-001 — Finance Document Notification Delivery

**Status:** Approved for bounded implementation
**Programme:** 7 — Business communications and document delivery
**Type:** Consent-gated commands, templates and notification-service adoption
**Depends on:** P1-004 notifications; P1-007 documents; issued invoice snapshots

## Outcome

An authorised finance user can explicitly send an issued invoice, a
currency-separated customer statement summary, or an approved payment reminder
to the customer’s verified email address through the Platform Kernel
`NOTIFICATION_SERVICE`. Every command also creates a persisted in-app outcome
notice for the initiating user and complete, minimised audit evidence.

This turns the email/in-app adapter into a real finance workflow. It does not
claim email receipt, automatic dunning, durable provider retry, multilingual
financial translations, a customer portal, or WhatsApp/SMS delivery.

## Current behaviour

- P1-004 composes email and persisted in-app gateways, tenant-scoped dedupe and
  generic notification audit evidence. Email transmission requires
  environment-provided provider configuration; SMS/WhatsApp do not transmit.
- P1-007 resolves the exact issued invoice PDF and existing opaque expiring
  share-link workflow behind the document service.
- Invoice issue, PDF download and share-link management exist, but there is no
  provider-managed finance send command or finance-specific delivery history.
- Customer contacts have email addresses but no append-only consent/opt-out or
  preferred-locale evidence.
- Aged receivables are exact and currency-separated. There is no customer
  statement send workflow and no automatic customer-invoice dunning engine.
- Platform subscription dunning is VAKA’s own billing workflow and is not a
  customer receivables communication source.

## Target behaviour

1. Add append-only `contact_communication_preference_events` for EMAIL consent
   state (`CONSENTED` or `OPTED_OUT`), requested locale, evidence source, reason,
   actor and time. The latest tenant/contact/channel event is authoritative.
2. Add validated authenticated commands to record/list a customer’s email
   preference. Writes require `crm.write`, verify the canonical tenant-owned
   contact and create an audit record in the same transaction.
3. Add typed, versioned finance catalogues for:
   - issued invoice delivery;
   - customer statement delivery;
   - payment reminder; and
   - in-app send success/failure outcomes.
4. Treat `en-ZW` as the only reviewed finance-message locale in this mission.
   `sn-ZW` and `nd-ZW` preferences are retained, but delivery resolves to the
   documented English fallback until qualified terminology review enables
   their catalogues. Audit evidence records requested/resolved locale.
5. Add explicit `POST` commands:
   - `/invoices/:id/send` for `ISSUED` or `PARTIAL` invoices;
   - `/contacts/:id/statements/send` for an as-at date; and
   - `/invoices/:id/payment-reminders/send` for overdue `ISSUED`/`PARTIAL`
     invoices with a positive exact outstanding balance.
6. Require `accounting.post`, a validated `Idempotency-Key`, explicit
   confirmation, a tenant-owned customer email and current `CONSENTED` EMAIL
   preference for every send.
7. Resolve all recipient, invoice, customer, balance, date and currency values
   from canonical tenant-scoped records. Never accept recipient, tenant, amount,
   status, document number or balance from the request body.
8. Invoice sends create a 14-day opaque invoice share link only after consent
   and state validation. The email receives the secure relative document link,
   never document bytes or a permanent public object URL.
9. Statement templates use an exact, read-only customer receivables view. USD
   and ZWG totals remain separate; the template never combines currencies.
10. Payment reminders are manual, one-invoice commands. They do not change the
    invoice, post a journal, infer collection authority, or start an autonomous
    schedule.
11. Send EMAIL first through `NOTIFICATION_SERVICE`, then persist an IN_APP
    outcome notice for the initiating user through the same service. Provider
    failure records a failed email attempt and an in-app failure notice.
12. Record domain audit evidence for sent, deduplicated, failed and suppressed
    attempts with contact/invoice reference, channel, template version,
    requested/resolved locale, consent-event ID and provider-acceptance status.
    Audit metadata excludes message bodies, secure tokens and unnecessary
    customer data.

## User and measurable business result

- **User:** Owner, Administrator, Accountant or other user with
  `accounting.post`; preference administrators also need `crm.write`.
- **Problem:** Users can issue/download invoices but cannot deliver finance
  communications through governed VAKA infrastructure or prove consent and
  send outcome.
- **Result:** One explicit command creates a tenant-safe, idempotent, audited
  provider attempt plus an in-app outcome without changing finance records.
- **Measure:** Parity and integration tests prove correct template/recipient,
  consent/opt-out enforcement, tenant isolation, permissions, exact values,
  idempotency, provider failure evidence and no ledger mutation.

## Finance and accounting boundaries

- Sending is a communication event, not an accounting event; it creates no
  journal and does not change invoice status, amount paid or outstanding value.
- Invoice financial values come from the immutable issue snapshot/current
  canonical status. The notification layer performs no tax or money
  calculation.
- Statements and reminders use exact integer-minor-unit arithmetic and keep
  currencies separate.
- A reminder requires an already-overdue invoice with positive outstanding
  balance. Paid, void, draft, future-due and zero-balance invoices fail closed.
- Corrections remain reversal/credit/debit-note work outside this mission.
- AI cannot invoke these send commands or send autonomously.

## Consent, privacy and security

- An email address alone is not consent. Missing preference evidence fails
  closed; `OPTED_OUT` always suppresses delivery.
- Preference history is append-only. A new event supersedes prior state without
  deleting it; reason/source/actor/time remain explainable.
- Recipient and tenant identity are derived server-side. Cross-tenant resource
  IDs return safe not-found responses.
- Provider credentials remain environment-only and existing transport redaction
  rules apply. No secret, share token, document bytes, tax identifier, note,
  line-item detail or message body enters audit metadata.
- Idempotency is tenant-, command-, entity- and channel-scoped. Same-key replay
  returns prior delivery evidence and does not create another secure link.
- The in-app recipient is the authenticated initiating user, not an unverified
  customer portal identity.

## Templates and localisation

- Stable template keys and versions are code-owned and typed; request bodies
  cannot choose arbitrary provider templates.
- Variables are allowlisted per template and use canonical strings/ISO dates.
- English fallback is explicit. ChiShona and isiNdebele preference values are
  stored but their finance copy remains disabled pending native/professional
  review; no invented translation is shipped.
- Provider acceptance means sent to provider, not delivered, opened, read or
  paid. User-facing/in-app wording must preserve that distinction.

## Failure and operational behaviour

- Missing provider configuration or provider rejection persists a failed EMAIL
  notification, audits the failure, creates an in-app failure outcome where
  possible and returns a safe failure to the command caller.
- Same-key replay is deterministic. A reused idempotency key with different
  command inputs fails with conflict.
- This first release calls the synchronous P1-004 gateway. Notifications and
  idempotency evidence persist, but guaranteed retry, webhook delivery/bounce
  state, queue/outbox recovery, rate limiting and dead-letter operations remain
  production gates.
- A provider failure never changes invoice/payment/ledger state.

## Scope

- Mission documentation and additive consent-preference migration.
- Append-only preference application service and validated routes.
- Typed finance notification template/locale catalogues.
- Tenant-scoped exact statement read model.
- Invoice, statement and payment-reminder delivery coordinator and routes.
- Notification-service email/in-app adoption, secure invoice-link handoff,
  idempotency and domain audit evidence.
- Focused consent, permission, tenant, exactness, endpoint, provider success,
  failure and replay tests.
- Product/technical documentation, programme status, changelog and Completion
  Report.

## Out of scope

- Automatic/scheduled/bulk dunning, AI sending or campaigns.
- Platform subscription billing/dunning changes.
- Provider selection, credentials, sender-domain setup or production secrets.
- Delivery/open/bounce webhooks, queue workers, retries, outbox, DLQ, analytics,
  rate limits or multi-provider failover.
- SMS, WhatsApp or push transmission.
- Customer portal identity, authenticated statement download, statement PDF,
  attachments or permanent public document URLs.
- Enabling unreviewed ChiShona/isiNdebele financial copy.
- Invoice template redesign or accounting/statutory behaviour.

## Acceptance criteria

- Mission pack is committed before implementation.
- All finance sends consume `NOTIFICATION_SERVICE`; no provider call or parallel
  notification service is introduced in the finance module.
- Preference writes are zod-validated, RBAC-protected, tenant-scoped,
  append-only and audited atomically.
- Invoice/statement/reminder commands require `accounting.post`, confirmation,
  idempotency, customer email and current consent.
- Opt-out, missing consent, missing email, cross-tenant IDs and invalid finance
  states send nothing and fail safely.
- Templates are typed/versioned; locale fallback is explicit and audited.
- Statement/reminder values are exact and currency-separated.
- Same-key replay does not duplicate email, in-app notice or secure link.
- Provider failure produces persisted/audited failure evidence and no finance
  mutation.
- Migration is additive and applied only to local/CI test databases.
- Full guarded DB suite, server/web typechecks and web production build pass.

## Rollback

Revert routes, coordinator, statement read model, catalogues, schema mapping,
tests and documentation. Existing notification/share-link records remain valid.
The append-only preference-events table may remain dormant; do not drop it from
production without separately reviewed additive/contract migration. No finance
record requires reversal because sends never mutate accounting state.
