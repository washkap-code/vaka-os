# P3-003 — Completion Report

**Implementation:** Complete for the approved manual-activity and financial-milestone scope
**Technical verification:** Complete
**Availability:** Authenticated tenant CRM surface; provider communication history gated
**Completed on:** 2026-07-13

## Delivered

- Additive, tenant-owned `customer_timeline_events` chronology projection. It
  stores source references and occurrence metadata only; canonical activity
  bodies and financial values remain in their existing tables.
- Typed `activity.recorded` domain fact and P1-005 subscribers for activity,
  invoice issue/void and payment events. Subscribers re-read canonical rows and
  upsert idempotently after commit.
- Lazy customer reconciliation over canonical activities, issued/voided
  invoices, payments and immutable audit evidence, repairing pre-existing or
  process-missed history.
- Manual activity creation now validates bounded input, verifies the
  tenant-owned contact and optional deal, writes `activity.recorded` audit
  evidence atomically and publishes only after commit.
- `GET /contacts/:id/timeline` with verified-JWT tenant scope, `crm.read`, strict
  query/cursor validation, deterministic ordering and private/no-store caching.
- Canonical hydration that returns activity details and invoice/payment amounts
  as integer-cent strings without copying them into the projection.
- Responsive, keyboard-accessible customer timeline from Contacts with focus
  entry/return, Escape/close controls, loading/empty/error/retry/load-more
  states and a `crm.write`-aware activity form.
- Catalogue-backed English fallback copy and an explicit notice that manual
  email activities are not provider delivery confirmation.

## Verification evidence

- Guarded local test database preparation and reference-data seed: passed
  against `vaka_test` after the required explicit test environment was set.
- Focused timeline/event/runtime suite: 3 files / 12 tests passed.
- Full server database-backed suite: 59 files / 193 tests passed, 0 failures,
  0 skipped.
- Server typecheck: passed.
- Web typecheck: passed.
- Web production build: passed.
- `git diff --check`: passed.

Focused evidence covers audited post-commit activity creation, exact-cent
payments, invoice issue/void chronology, lazy repair, idempotency, stable
pagination, invalid cursors, tenant isolation, read/write RBAC and rollback.

## Migration and production boundary

- Added `server/drizzle/0017_customer_timeline_projection.sql` and the matching
  Drizzle schema. The change only creates a rebuildable derived projection and
  additive indexes; it does not create a canonical Customer, Contact, Invoice,
  Payment or Communication master.
- The schema was applied only to the guarded local `vaka_test` database through
  `test:db:prepare`.
- No `db:push`, migration or schema mutation was run against the shared
  production Supabase project. GENFIN tables were not touched.

## Open product and operational gates

1. `email` is a manually recorded CRM activity. There is no mailbox ingestion,
   provider send/delivery evidence, opens/clicks, SMS, WhatsApp or telephony
   history in this mission.
2. P1-005 remains process-local and best-effort. Lazy reconciliation repairs
   canonical history on read, but guaranteed low-latency projection requires a
   durable outbox, replay, retries and operational monitoring.
3. Reconciliation and hydration are intentionally bounded per customer/page;
   high-volume scale, latency SLOs and query-plan evidence remain future work.
4. Activity retention/deletion, communication consent and provider-specific
   privacy rules require dedicated policy and professional review before
   omnichannel expansion.
5. English fallback copy is structured; Shona and Ndebele terminology still
   requires native review before those locales are enabled.
6. No AI summary or context access is enabled.

## Rollback

Revert the event addition/subscribers, activity transaction change, timeline
route/UI, tests and documentation. The derived projection may remain dormant
and rebuildable; do not drop it in a production rollback without a separately
reviewed additive migration. Canonical CRM, invoice, payment, journal, stock and
audit history remains unchanged.
