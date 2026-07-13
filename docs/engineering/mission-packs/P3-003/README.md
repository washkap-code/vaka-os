# P3-003 — Customer Activity and Communication Timeline

**Status:** Ready for implementation; communication-provider coverage gated
**Programme:** 3 — CRM and sales
**Type:** Tenant-scoped derived timeline, event subscriber, read API and responsive customer view
**Depends on:** P1-002 identity/audit; P1-005 event bus; canonical CRM and invoicing records

## Outcome

An authorised CRM user can open a canonical customer and see one chronological
timeline of manually recorded calls, emails, meetings, notes and tasks alongside
issued/voided invoices and recorded payments. The chronology is maintained by
P1-005 post-commit subscribers and repaired from canonical records when read.

This mission does not add another Customer, Contact, Invoice, Payment or
communication master. A small rebuildable projection stores chronology and
source references only; protected content and money are hydrated from the
existing canonical tables at read time.

## Current behaviour

- Canonical customers are `contacts` with `is_customer = true`; finance invoices
  already reference those contacts.
- The existing contact detail API returns separate arrays for activities,
  deals and invoices, but the current web contact list has no detail/timeline
  interaction.
- Manual CRM activities use the existing `activities` table and require
  `crm.write`, but creation is not yet transactional/audited and emits no event.
- P1-005 publishes `invoice.issued`, `payment.recorded` and `invoice.voided`
  after commit through a process-local, best-effort bus.
- No mailbox, inbound-email ingestion, SMS history or governed WhatsApp
  provider is live. An activity whose type is `email` is a manual CRM record,
  not proof of transmission.

## Target behaviour

1. Add an additive `customer_timeline_events` projection table containing only
   tenant, customer, event kind, source type/source ID, occurrence time, actor
   reference and projection timestamps.
2. The table is explicitly derived and rebuildable. Canonical activity bodies,
   invoice values and payment values are not copied into it.
3. Add typed `activity.recorded` to the P1-005 event catalogue. Create a manual
   activity and its audit event atomically, then publish only after commit.
4. Subscribe to `activity.recorded`, `invoice.issued`, `payment.recorded` and
   `invoice.voided`. Every subscriber re-reads the tenant-owned canonical source
   before idempotently upserting a projection row.
5. Never trust an event payload as record authority. An invoice void subscriber
   resolves its customer from the canonical invoice because that payload does
   not contain a customer identifier.
6. Lazily reconcile the requested customer from canonical activities, issued or
   voided invoices and payments before serving the timeline. This repairs
   pre-existing rows and events missed during process downtime.
7. Expose `GET /contacts/:id/timeline` behind `crm.read`, with strict zod
   validation for `limit` and an opaque cursor. Tenant and actor come only from
   verified authentication context.
8. Hydrate each result from its canonical source and return stable facts:
   activity type/body/due/completed state; invoice number/status/currency/total;
   or payment amount/currency/reference and related invoice number.
9. Use integer-cent strings for returned invoice/payment money. UI formatting
   converts only at the presentation boundary.
10. Add a responsive customer detail/timeline view from the existing Contacts
    page, including loading, empty, error and “load more” states. Activity entry
    remains permission-aware and uses the existing canonical write path.

## Timeline event contract

| Kind | Canonical source | Occurred at | Returned facts |
|---|---|---|---|
| `activity.recorded` | `activities` | activity `created_at` | type, body, due/completed dates |
| `invoice.issued` | `invoices` | invoice `issue_date` | number, status, currency, total cents |
| `invoice.voided` | `invoices` | projection/event time | number, status, currency, total cents |
| `payment.recorded` | `payments` + invoice | payment `date` | amount cents, currency, reference, invoice number |

The projection uniqueness key is tenant + event kind + source ID. Subscriber
redelivery and reconciliation are therefore idempotent. Ordering is occurrence
time descending, then projection ID descending; the cursor contains both.

## User and measurable business result

- **User:** Sales, customer-service and finance-adjacent staff with `crm.read`.
- **Problem:** Customer interactions and financial milestones are split across
  unrelated arrays/screens, making follow-up context incomplete.
- **Result:** One customer view explains recent manually recorded interactions,
  invoice lifecycle and receipts without duplicating canonical records.
- **Measure:** Cross-tenant/permission tests reveal no forbidden facts;
  post-commit events appear once; rollback publishes/projects nothing;
  reconciliation finds pre-existing canonical history; pagination is stable.

## Permissions, audit and tenant isolation

- Timeline reads require `crm.read`; manual activity creation requires
  `crm.write`. Financial APIs retain their existing finance permissions.
- Route params never replace tenant scope. Customer, projection and every
  hydrated source are filtered by the verified tenant.
- A cross-tenant customer/source returns a safe not-found or is omitted without
  revealing existence.
- `activity.recorded` audit is written in the same transaction as the activity.
  Existing invoice/payment money and lifecycle audit requirements remain intact.
- Timeline reads add no audit noise because they do not mutate or export data.

## Privacy, retention and failure behaviour

- The projection minimises personal and financial data by retaining source
  references rather than copied content.
- Activity bodies remain subject to the canonical activity record's retention,
  tenant export and future deletion policy. This mission adds no provider data.
- Subscriber failure is isolated under P1-005 and cannot roll back a committed
  business operation. Lazy reconciliation repairs current canonical history.
- There is still no durable outbox, replay queue or cross-process delivery SLA.
  Alerting/operations for guaranteed delivery remains separate work.
- If a referenced canonical source is unavailable, the unsafe row is omitted;
  other timeline items continue to load.

## Localisation, mobile and accessibility

- New user-facing copy lives in the typed application copy catalogue with an
  English fallback. Shona and Ndebele terminology requires native review before
  those locales are enabled; stored event kinds remain stable machine values.
- The timeline uses semantic headings, buttons and ordered-list structure, with
  readable status text that does not depend on colour.
- The customer view and activity form stack at narrow widths, avoid hover-only
  controls and preserve keyboard operation and visible focus.
- Dates and currencies use locale-aware formatters already available to the web
  application. Text expansion is allowed by flexible layouts.

## Scope

- Additive derived projection migration and Drizzle schema.
- Timeline reconciler, canonical hydrator and P1-005 subscribers.
- Post-commit audited manual-activity write path and typed event.
- Validated tenant-scoped cursor API.
- Responsive customer timeline and permission-aware activity entry.
- Unit/integration coverage for event, reconciliation, idempotency, tenant,
  permission, rollback, money and pagination boundaries.
- Event catalogue, programme status, mission index, changelog and completion
  evidence updates.

## Out of scope

- New canonical Customer/Contact/Company/Invoice/Payment/Communication tables.
- Mailboxes, inbound or outbound email proof, opens/clicks, SMS, WhatsApp,
  telephony, attachments, consent automation or provider delivery receipts.
- Editing/deleting posted financial history; timeline comments/reactions;
  activity workflow automation; AI summaries or model context.
- Durable event delivery, distributed consumers, outbox/replay/dead-letter
  infrastructure, full-text timeline search or bulk timeline export.
- A claim that all historical/customer communication is complete.

## Acceptance criteria

- Mission pack is committed before implementation.
- No canonical customer, invoice or communication master is introduced.
- Projection migration is additive and is applied only to local/CI databases.
- Manual activity creation validates input, checks `crm.write`, verifies the
  tenant-owned customer/deal, audits atomically and emits after commit.
- Subscribers re-read canonical tenant-owned sources and are idempotent.
- Existing canonical records appear after lazy reconciliation.
- Tenant A and users without `crm.read` cannot view Tenant B/forbidden history.
- Money is returned as integer-cent strings and formatted only in the UI.
- Timeline ordering/cursors remain deterministic for equal timestamps.
- Responsive/loading/empty/error/load-more behaviour is present and copy is
  catalogue-backed.
- Full guarded DB suite, server/web typechecks and web production build pass.

## Rollback

Revert the route, subscriber registration, event producer, UI, tests and
documentation. The derived projection table may remain dormant and rebuildable;
do not drop it during a production rollback without a separately reviewed
additive migration. Canonical activities, invoices, payments, journals and
audit history remain unchanged.

## Release boundary

After technical verification, label this as a customer timeline of VAKA-recorded
manual activities and financial milestones. Do not market it as complete email,
SMS, WhatsApp or omnichannel communication history until provider ingestion,
consent, retention, delivery evidence and professional privacy review pass.
