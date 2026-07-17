# LP-005 — Health Endpoints, Structured Logging and Monitoring Hooks

**Status:** Complete locally; ready for pull-request review
**Branch:** `ops/health-logging`
**Completed:** 2026-07-16
**Migration:** None; migration number 0046 remains free

## 1. Files created

- `server/src/observability.ts`
- `server/src/error-tracking.ts`
- `server/src/health.ts`
- `server/tests/observability.test.ts`
- `docs/engineering/OBSERVABILITY-OPERATIONS.md`
- `docs/engineering/mission-packs/LP-005/COMPLETION.md`

## 2. Files modified

- `server/.env.example`
- `server/src/app.ts`
- `server/src/config.ts`
- `server/src/email-transport.ts`
- `server/src/index.ts`
- `server/src/platform-runtime.ts`
- `server/src/platform/events/adapters/publisher.ts`
- `server/src/platform/events/tests/publisher.test.ts`
- `server/src/platform/notifications/adapters/email-gateway.ts`
- `server/src/routes.ts`
- `server/src/seed.ts`
- `server/tests/config.test.ts`
- `server/tests/email-transport.test.ts`
- `server/tests/tenant-isolation-endpoint-manifest.ts`
- `server/tests/tenant-isolation-regression.test.ts`
- `docs/engineering/mission-packs/LP-003/COMPLETION.md` (post-merge status reconciliation only)

## 3. Behaviour changes

- `GET /healthz` is an unauthenticated, dependency-free liveness endpoint. It
  returns the application version and integer process uptime without querying
  the database, migration state or email configuration.
- `GET /readyz` performs bounded checks of database connectivity, the schema
  markers introduced through migration 0045, and SMTP configuration presence.
  It returns per-check detail with HTTP 200 when ready and HTTP 503 when a
  critical check fails, without returning connection details or exceptions.
- One application logger now emits JSON lines with timestamp, level, message,
  request ID, tenant ID, user ID, route template, status and latency. Sensitive
  keys and values are recursively redacted. Production never logs rendered
  email content; the existing development console transport remains available
  only through an explicitly sensitive debug method.
- Request context is propagated with `AsyncLocalStorage`, so nested operations
  inherit opaque request, tenant and user identifiers. A safe inbound
  `X-Request-Id` is accepted; otherwise a UUID is generated. Every response
  carries the ID header and every JSON error response also carries it in the
  body. Route templates are logged instead of raw token- or ID-bearing URLs.
- Runtime `console.log`, `console.error` and `console.debug` calls under
  `server/src` were replaced by the single logger. Test mode is silent unless
  a test injects a sink, keeping test output deterministic.
- `SENTRY_DSN` optionally enables a dependency-free Sentry-compatible envelope
  hook. With no DSN it is a no-op. Reports contain only a generic error value,
  scrubbed stack and opaque request context; they exclude request bodies,
  names, email addresses, cookies and credentials.
- Uncaught exceptions and unhandled rejections are logged at `fatal`, offered
  to the error hook with any active request context, then terminate the process
  with exit code 1 after a bounded capture attempt.
- Existing LP-004 email events now use the same logger and redaction policy.
  Login outcomes, posted invoices and committed tenant Migration Hub steps now
  emit metrics-lite events after the relevant operation succeeds or fails.
- No monitoring infrastructure, queue, schema, package or migration was added.
  Migration 0046 was not reserved.

### Structured event vocabulary

- HTTP/process lifecycle: `server.started`, `http.request.completed`,
  `http.request.unhandled`, `process.uncaught_exception`,
  `process.unhandled_rejection`, `seed.completed`.
- Business metrics: `auth.login.succeeded`, `auth.login.failed`,
  `invoice.posted`, `migration.applied`.
- Email delivery: `email.queued`, `email.retried`, `email.sent`,
  `email.failed`; `email.console_rendered` is non-production debug only.
- Internal delivery/projection health: `event.subscriber_failed`,
  `event.post_commit_publish_failed`, `error_tracking.capture_failed`,
  `error_tracking.delivery_failed`.

`migration.applied` means that an existing tenant Migration Hub step committed;
it is not a numbered Drizzle schema-migration event.

### Environment variables added

- `APP_VERSION` — optional release label; falls back to
  `VERCEL_GIT_COMMIT_SHA`, then the package release.
- `SENTRY_DSN` — optional HTTPS Sentry-compatible public project DSN; empty is
  an explicit no-op.

## 4. Tests executed

- Focused health, configuration, security, email transport, notification,
  event-publisher and observability suite: 6 files / 48 tests passed.
- Fresh disposable PostgreSQL replay: every migration 0000 through 0045
  applied transactionally with zero errors, zero manual steps and zero
  structural drift.
- Runtime-schema check after seeding the fresh database: passed with gated
  features disabled.
- Dedicated tenant-isolation regression: 13/13 tests passed.
- Full server suite against that same freshly migrated database: 96 files /
  454 tests passed.
- Server typecheck: passed.
- Web typecheck: passed.
- Web production build: passed; Vite retained the existing large-chunk warning.
- `git diff --check`: passed.

The first clean-room run exposed that the endpoint inventory helper discovered
only `routes.ts`, so it did not account for the new app-level health routes.
The inventory was strengthened to discover both app and API registrations,
the public-exception count was reconciled, and the final clean-room run above
passed. Two preliminary focused invocations also stopped during import because
the manual command omitted required test-only environment variables; no test
assertion ran in those files, and the complete isolated configuration passed
unchanged.

## 5. Verification status

- All LP-005 acceptance criteria have implementation and automated-test
  evidence. The final verification was run after the request-context and
  redaction implementation was complete.
- Repository search found no remaining runtime `console.*` use under
  `server/src`.
- Health responses and production log/error reports were tested for internal
  detail, token, email, name and credential redaction.
- No production or shared database, live SMTP service, Sentry project, Vercel
  monitor, DNS record or external alert policy was accessed or changed.
- This branch is complete locally but has not been pushed or opened as a pull
  request in this mission; GitHub-hosted quality, security, CodeQL and preview
  gates remain the merge gate.

## 6. Risks and human decisions

1. Production still lacks migrations 0042–0045. Until the owner applies them
   in order, `/readyz` will correctly report a schema mismatch and return 503.
2. The readiness marker intentionally describes migration 0045 through schema
   sentinels. The next schema mission must update `EXPECTED_MIGRATION` and its
   marker query as part of that migration's deployment contract.
3. SMTP readiness proves configuration presence, not network reachability or
   inbox delivery. The operator must still provision SMTP and validate SPF,
   DKIM, DMARC and representative mailboxes under the LP-004 runbook.
4. `SENTRY_DSN` is optional and no live compatible endpoint was exercised.
   Operators must choose the service, store the DSN, trigger a controlled
   non-production error and verify receipt before relying on it.
5. Logs are written to standard output/error. Retention, access control,
   dashboards and the documented alert queries must be configured in the
   hosting provider; the code does not create external monitoring accounts.
6. Disk-capacity alerts remain a hosting/database-provider concern because the
   application cannot measure provider storage safely or portably.
7. The web build retains its pre-existing 500 kB chunk warning; LP-005 did not
   change the web bundle.

## 7. Recommended next mission

Proceed to **LP-006 — Backup and Restore Scripts** on `ops/backup-restore`.
It should reuse this mission's JSON event vocabulary for `backup.succeeded`
and `backup.failed`, while preserving the production-database safety rail and
without modifying the observability contract.
