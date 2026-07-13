# P1-004 — Completion Report

**Implementation:** Complete for the approved adapter scope
**Verification:** Complete — guarded full database-backed suite passed
**Availability:** Internal platform foundation; no product workflow adopted
**Completed on:** 2026-07-13

## Delivered

- `NOTIFICATION_SERVICE` composition-root token and routing service for email, in-app, SMS and WhatsApp channels.
- Provider-neutral HTTPS email adapter with injected test transport and production configuration validation.
- Persisted in-app notifications and persisted non-transmitting SMS/WhatsApp intent. Placeholder channels do not claim external delivery.
- Additive `notifications` table and `0014_notifications.sql` migration with tenant/time indexing, tenant-scoped dedupe uniqueness, channel/status constraints and delivery evidence.
- Tenant-scoped `listNotifications()` read helper that omits recipient data from its result.
- Tenant-scoped dedupe, provider response evidence, failed-attempt persistence and material audit events without recipient PII in audit metadata.
- Kernel, adapter, configuration, persistence, tenant-isolation, dedupe and audit tests.

No invoice, statement, reminder or other existing product call site was rewired. No financial, inventory, authentication, permission, lifecycle or production database behaviour changed.

## Verification evidence

- Guarded test database preparation: passed against local `vaka_test`; schema sync, finance integrity controls and reference-data seed all completed.
- Focused P1-004 verification: 4 files / 12 tests passed.
- Full server suite: 52 files / 165 tests passed, 0 failures.
- Server typecheck: passed.
- Web typecheck: passed.
- Web production build: passed.
- `git diff --check`: passed.

## Migration and production boundary

- Added `server/drizzle/0014_notifications.sql`; it creates only the notification table, constraints and indexes.
- The migration was applied only to the isolated local test database through `test:db:prepare`.
- No `db:push` or schema mutation was run against the shared `vaka-platform` production project. Production application requires a separately authorised additive SQL application.

## Open release and adoption gates

1. Select/configure an approved email provider and complete deliverability, consent, retry, timeout, monitoring, failover and data-processing review.
2. Adopt invoice/statement/reminder delivery only through P7-001 with user confirmation, template, permission and audit requirements.
3. Keep SMS and WhatsApp unavailable until provider, consent, opt-in and operational missions are approved.
4. Build the in-app notification UI separately under P6-002; the read/persistence foundation does not itself expose a menu.

## Rollback

Revert the P1-004 code and composition changes. The additive table may remain dormant; do not destructively drop notification evidence after production use without a separately approved retention/migration plan.
