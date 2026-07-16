# VAKA OS — Pilot Readiness Codex Missions

**Programme:** Pilot Launch Readiness
**Repository:** vaka-os
**Execution order:** LP-001 → LP-007. Do not run missions in parallel. Each mission is one branch, one PR, one merge.
**Standing rules for every mission:** No architecture changes. No scope expansion. No new runtime dependencies unless the mission explicitly permits it. Existing tests must pass before and after. Every mission ends with the standard completion report.

**REPO-SPECIFIC RULES (from docs/engineering/SESSION-HANDOFF.md — binding):**
- Read `docs/engineering/SESSION-HANDOFF.md` and `AGENTS.md` before starting any mission.
- Migrations 0042–0044 exist on `main` but are NOT yet applied to production (see the migration ledger). LP-001's job is to verify them on a fresh database and fix defects — actual application to production is done by the owner via the Supabase SQL editor / VAKA-scoped MCP, not by Codex.
- New migrations continue from 0045; check SESSION-HANDOFF.md for the current highest number first. NEVER `drizzle-kit push` against production.
- The sandbox has no push credentials: commit locally; the owner pushes via GitHub Desktop.

Copy each mission below into Codex verbatim, one at a time, after the previous mission's PR is merged.

---

## MISSION LP-001 — Verify and Repair Migrations 0042–0044

```
MISSION ID: LP-001
BRANCH: fix/migrations-0042-0044
PRIORITY: Critical — blocks all other pilot-readiness missions.

OBJECTIVE
Prove that migrations 0042, 0043 and 0044 apply cleanly, in order, on a fresh
database, and that the resulting schema exactly matches what the application
code (Drizzle models) expects. Fix any defects found.

READ FIRST
- The migrations directory and journal/metadata files.
- The Drizzle schema definitions for every table touched by 0042–0044.
- Any prior migration that 0042–0044 depends on.

TASKS
1. Stand up a completely fresh, empty database (local/test — never production).
2. Apply ALL migrations from 0001 through 0044 in order. Record any failure,
   warning, or manual intervention required.
3. Diff the resulting schema against the Drizzle schema definitions
   (drizzle-kit check / introspection). List every mismatch: missing columns,
   type differences, missing indexes, missing constraints, missing FKs.
4. Fix defects by adding NEW forward migrations only. Do not edit an already-
   numbered migration file if there is any chance it has been applied anywhere.
   If 0042–0044 have never been applied to any shared environment, you may
   repair them in place — state explicitly which approach you took and why.
5. Verify every migration in 0042–0044 is transactional or documents why it
   cannot be (e.g. CREATE INDEX CONCURRENTLY).
6. Re-run the full fresh-database apply from scratch to prove the fix.
7. Add or update an automated CI check that applies all migrations to a fresh
   database and fails the build on schema drift, if one does not already exist.

DO NOT
- Modify production or any shared database.
- Change table structures beyond what is needed for schema/code agreement.
- Add destructive migrations (DROP of data-bearing objects) without flagging
  them in the report for human approval.

ACCEPTANCE CRITERIA
- Fresh database migrates 0001→0044 with zero errors and zero manual steps.
- drizzle-kit check (or equivalent) reports zero drift.
- All existing tests pass.
- CI migration check exists and passes.

COMPLETION REPORT
1. Files created  2. Files modified  3. Defects found in 0042–0044 and how
each was fixed  4. Whether repairs were in-place or forward migrations, and why
5. Tests executed  6. Remaining risks  7. Anything requiring human decision.
```

---

## MISSION LP-002 — Automated Tenant-Isolation Regression Suite

```
MISSION ID: LP-002
BRANCH: test/tenant-isolation-suite
PRIORITY: Critical — this is a launch-gating security control.

OBJECTIVE
Build a permanent, automated test suite that proves no tenant can read, write,
enumerate, or infer another tenant's data through any API surface. This suite
must run in CI on every merge, forever.

READ FIRST
- Tenant model, authentication middleware, and tenant-context resolution.
- Every API route module. Build a complete inventory before writing tests.
- Existing test helpers for creating tenants/users/fixtures.

TASKS
1. Create test infrastructure that provisions TWO complete tenants (Tenant A,
   Tenant B), each with users, customers, suppliers, products, invoices,
   journals, payments, and documents — realistic seeded data on both sides.
2. Enumerate every HTTP endpoint in the application (list them in a generated
   or maintained manifest file). The suite must fail if a new endpoint is added
   that is not covered by an isolation test or explicitly allow-listed as
   public/unauthenticated.
3. For every authenticated endpoint, as a Tenant A user, attempt:
   a. Direct object reference to Tenant B resources (IDs harvested from
      Tenant B fixtures) — GET, PUT, PATCH, DELETE where applicable.
   b. List/search endpoints — assert zero Tenant B records appear in results,
      including via filters, search terms and pagination.
   c. Create operations that reference Tenant B foreign keys (e.g. create an
      invoice against a Tenant B customer ID) — assert rejection.
   d. Aggregate/report endpoints — assert totals equal Tenant A-only values.
4. Test the failure mode responses: cross-tenant access must return 404 or 403
   consistently (pick the existing convention) and must never leak the
   existence or content of the other tenant's record in the error body.
5. Test tenant context tampering: forged/absent tenant identifiers in tokens,
   headers or params must be rejected.
6. Add a database-level assertion pass: after the API test run, verify no rows
   in any tenant-scoped table have mismatched tenant IDs.
7. Wire the suite into CI as a required check.
8. FIX any isolation defect the suite finds. Each defect fix must be minimal,
   must not change API contracts for legitimate same-tenant use, and must be
   listed individually in the completion report.

DO NOT
- Weaken any test to make it pass.
- Skip endpoints because they "obviously" scope by tenant.

ACCEPTANCE CRITERIA
- Endpoint manifest exists; unmapped new endpoints fail CI.
- Suite passes with zero cross-tenant leaks.
- Suite runs in CI on every PR.
- All pre-existing tests still pass.

COMPLETION REPORT
Standard report PLUS: total endpoints enumerated, endpoints covered, endpoints
allow-listed as public (with justification), and a table of every isolation
defect found and fixed. Isolation defects found are the most important output
of this mission — report them prominently, never bury them.
```

---

## MISSION LP-003 — CORS and Configuration Hardening

```
MISSION ID: LP-003
BRANCH: hardening/cors-config
PRIORITY: High

OBJECTIVE
Make the application safe to expose on the public internet: strict CORS,
fail-fast configuration validation, secure headers, and zero secrets or
permissive defaults in code.

READ FIRST
- Server bootstrap, middleware stack, CORS setup, any .env.example,
  config loading code, session/cookie configuration.

TASKS
1. CORS: replace any wildcard or reflective origin handling with an explicit
   allow-list driven by an environment variable (comma-separated origins).
   Credentials mode only for allow-listed origins. Preflight handled correctly.
   In production mode, the server must REFUSE TO START if the allow-list is
   empty or contains "*".
2. Configuration validation: create a single config module that validates ALL
   required environment variables at boot (zod or equivalent already in the
   repo — do not add a new library if one exists). Missing or malformed
   required config in production = process exits with a clear error listing
   every missing key. Document every variable in .env.example with comments.
3. Secrets hygiene: scan the repository for hardcoded secrets, default
   passwords, default JWT/session secrets, or fallback values like
   "changeme"/"secret". Remove every fallback for secret values — in
   production, absence must be a fatal boot error, never a silent default.
   Report (do not commit) anything that looks like a real leaked credential.
4. Cookies/session: Secure, HttpOnly, SameSite set appropriately for
   production; secure flags must not be disableable by accident in prod mode.
5. Security headers: add or verify HSTS, X-Content-Type-Options,
   X-Frame-Options/frame-ancestors, and a baseline Content-Security-Policy.
   Use the repo's existing middleware approach; helmet is acceptable if
   already present or trivially added.
6. Rate limiting: verify a basic rate limit exists on authentication and
   password-reset endpoints. Add a minimal in-process limiter if absent.
7. Error responses: production error handler must never return stack traces
   or internal paths to clients.
8. Add tests for: boot failure on missing config, boot failure on wildcard
   CORS in prod, CORS rejection of a non-allow-listed origin, presence of
   security headers, sanitised production errors.

DO NOT
- Introduce infrastructure dependencies (Redis etc.) for rate limiting.
- Break local development ergonomics — dev mode may keep relaxed defaults,
  clearly separated from production behaviour.

ACCEPTANCE CRITERIA
- Server refuses to start in production mode with unsafe/missing config.
- All new tests pass; all existing tests pass.
- .env.example is complete and documented.

COMPLETION REPORT
Standard report PLUS the full list of environment variables now required in
production, and any suspected leaked credentials found (keys named, values
redacted).
```

---

## MISSION LP-004 — Email Delivery Integration

```
MISSION ID: LP-004
BRANCH: feature/email-delivery
PRIORITY: High

OBJECTIVE
Production-grade transactional email delivery behind the existing
NotificationService/email abstraction: real provider transport, retries,
failure visibility, and safe non-production behaviour.

READ FIRST
- Existing email/notification code and every call site that sends email.
- The platform NotificationService abstraction if present.

TASKS
1. Implement an SMTP transport (nodemailer or the repo's existing mail
   library) configured entirely from environment variables: host, port,
   auth, from-address, from-name, TLS. This keeps the provider swappable
   (any SMTP provider works). Do NOT hardcode a specific vendor SDK.
2. Environment behaviour:
   - production: real send; missing SMTP config = fatal boot error.
   - staging/dev: default to a console/JSON transport that logs the full
     rendered message; real send only if explicitly enabled.
   - test: in-memory transport with assertion helpers.
3. Reliability: send attempts get bounded retry with backoff (max 3),
   then are recorded as failed. Every send attempt (queued, sent, failed,
   retried) is persisted or structured-logged with message ID, recipient,
   template name, and correlation/request ID — never log message bodies
   containing personal data at info level.
4. Add a dead-simple failure surface: an internal endpoint or log query
   pattern that lets an operator answer "which emails failed today?".
5. Sender identity: from-address and reply-to via config. Add a short
   docs page describing the DNS the operator must set up (SPF, DKIM, DMARC)
   for the sending domain — documentation only, no code.
6. Route ALL existing email call sites through this transport. Remove any
   direct/ad-hoc mail code.
7. Tests: unit tests for retry/failure paths; integration tests using the
   in-memory transport for at least: user invitation, password reset, and
   one business document email (e.g. invoice send) if such flows exist.

DO NOT
- Build campaign/bulk email features. Transactional only.
- Add a queue system (BullMQ etc.). In-process retry is sufficient for pilot.

ACCEPTANCE CRITERIA
- All email flows work through the single transport.
- Failed sends are visible and queryable.
- Tests pass, including existing suite.

COMPLETION REPORT
Standard report PLUS list of every email-sending call site migrated, and the
SMTP-related environment variables added.
```

---

## MISSION LP-005 — Health Endpoints, Structured Logging and Monitoring Hooks

```
MISSION ID: LP-005
BRANCH: ops/health-logging
PRIORITY: High

OBJECTIVE
Make the running system observable: health endpoints an uptime monitor can
poll, structured JSON logs an operator can search, and error tracking hooks.

READ FIRST
- Server bootstrap, existing logging approach, existing middleware.

TASKS
1. Health endpoints:
   - GET /healthz — liveness: process is up. No dependencies checked.
     Returns 200 + version + uptime. Unauthenticated.
   - GET /readyz — readiness: checks database connectivity (cheap query),
     migration status (schema at expected version), and SMTP config presence.
     Returns 200 with per-check detail, 503 if any critical check fails.
     Unauthenticated but must not leak connection strings or internals.
2. Structured logging:
   - Single logger (pino or the repo's existing logger) emitting JSON in
     production: timestamp, level, message, requestId, tenantId, userId
     (IDs only — never names/emails at info level), route, status, latencyMs.
   - Request-ID middleware: accept inbound X-Request-Id or generate one;
     include it in all logs for that request and in error responses.
   - Replace console.log/console.error in server code with the logger.
3. Error tracking: add an optional Sentry (or compatible) hook enabled only
   when its DSN env var is present. Unhandled exceptions and rejections are
   captured with request context. No DSN = no-op, zero behaviour change.
4. Metrics-lite: log a structured event for key business operations that
   already exist (login success/failure, invoice posted, migration applied,
   email failed) so alerts can be built from log queries alone.
5. Crash discipline: unhandled rejections/exceptions log fatally and exit
   non-zero (so the process manager restarts) rather than continuing in an
   unknown state.
6. Tests: health endpoints (200/503 paths), request-ID propagation,
   log redaction of sensitive fields.
7. Docs: one page listing what to point an uptime monitor at, which log
   queries answer "is it healthy / who errored / which emails failed", and
   the recommended baseline alerts (readyz failing 3x, error-rate spike,
   email failure spike, disk/db connectivity).

DO NOT
- Add Prometheus/Grafana/OpenTelemetry infrastructure. Logs + health
  endpoints + optional Sentry only. Pilot-scale, not platform-scale.

ACCEPTANCE CRITERIA
- /healthz and /readyz behave as specified.
- Production logs are JSON with request IDs; no PII at info level.
- All tests pass.

COMPLETION REPORT
Standard report PLUS the list of structured event names emitted (this becomes
the alerting vocabulary).
```

---

## MISSION LP-006 — Backup and Restore Scripts

```
MISSION ID: LP-006
BRANCH: ops/backup-restore
PRIORITY: High

OBJECTIVE
Scripted, repeatable database backup and restore, with verification, suitable
for a nightly cron and for the launch-gating restore drill.

READ FIRST
- Database connection/config code; deployment/hosting assumptions in docs;
  uploaded-files/document storage location (files need backing up too).

TASKS
1. scripts/backup.sh (or .ts):
   - pg_dump custom-format dump of the VAKA database, filename containing
     UTC timestamp + git SHA of the running app if available.
   - Optional encryption with a symmetric key from env (openssl/age) —
     enabled when the key is set.
   - Optional upload to S3-compatible storage when configured; always keeps
     a local copy; prunes local copies older than N days (configurable).
   - Also archives the uploaded-documents directory if file storage is local.
   - Exits non-zero on any failure and emits a structured log line
     (backup.succeeded / backup.failed) so it can be alerted on.
2. scripts/restore.sh (or .ts):
   - Restores a named dump into a TARGET database given by explicit argument.
   - HARD SAFETY RAIL: refuses to run if the target database name matches the
     configured production database name, unless --i-know-this-is-production
     is passed. Prints what it is about to do and requires confirmation
     (with a --yes flag for automation).
   - After restore: runs migration-status check and prints row counts for the
     10 most important tables as a quick sanity signature.
3. scripts/verify-backup.sh:
   - Takes a dump file, restores it into a throwaway database
     (created and dropped by the script), runs the migration check and the
     sanity signature, exits 0/1. This is the automated heart of the
     restore drill.
4. Document all three scripts in docs/ops/backup-restore.md: cron example
   for nightly backup, retention recommendation, where the encryption key
   lives, and the manual restore-drill procedure reference.
5. Tests: a CI-runnable test that backs up a seeded test database, restores
   it to a second database, and asserts the sanity signature matches.

DO NOT
- Touch production data or credentials.
- Depend on a specific cloud vendor SDK beyond optional S3-compatible upload.

ACCEPTANCE CRITERIA
- Backup → verify-backup round trip passes in CI against a seeded database.
- Restore script safety rail proven by a test.
- Documentation complete.

COMPLETION REPORT
Standard report PLUS exact commands an operator runs for: nightly cron,
manual backup, restore drill.
```

---

## MISSION LP-007 — Full DB-Backed Suite: Run Green on Production-Like Database

```
MISSION ID: LP-007
BRANCH: test/full-suite-green
PRIORITY: Critical — final engineering gate before staging acceptance.
PREREQUISITE: LP-001 through LP-006 merged.

OBJECTIVE
Run the ENTIRE test suite — including all DB-backed integration tests, the
tenant-isolation suite (LP-002), and the backup round-trip test (LP-006) —
against a production-like PostgreSQL database (same major version as
production), and fix every failure until the suite is fully green with zero
skipped tests that were previously passing.

TASKS
1. Confirm the test database uses the same PostgreSQL major version planned
   for production. If the version is not pinned anywhere, pin it (docker
   compose file / CI config) and document it.
2. Run the complete suite with database-backed tests ENABLED (no mocked-DB
   shortcuts). Capture the full failure list before fixing anything.
3. Triage every failure into: (a) product defect, (b) test defect,
   (c) environment/config defect. Fix all three categories. Product defects
   get minimal fixes plus a regression test if one didn't exist.
4. Eliminate flakiness: any test that fails intermittently must be made
   deterministic (proper awaits, isolated fixtures, no shared mutable state,
   no time-of-day dependence). Do not solve flakiness with retries.
5. Audit skipped/disabled tests: list every .skip/.todo/commented-out test.
   Re-enable those that can pass; for any that must stay skipped, add a
   comment with reason + owner and list them in the report.
6. Make "full DB-backed suite" a single documented command
   (e.g. npm run test:full) and wire it into CI as the required gate for
   the release branch.
7. Record final results: total tests, pass/fail/skip counts, runtime.

DO NOT
- Delete or weaken failing tests to achieve green.
- Broaden scope into refactoring beyond what specific failures require.

ACCEPTANCE CRITERIA
- test:full is green, zero unexplained skips, on the pinned PG version.
- CI enforces it.

COMPLETION REPORT
Standard report PLUS: initial failure count by category, final counts,
every remaining skipped test with justification, and a one-line readiness
statement: "Engineering gates for pilot are met / not met because X."
```

---

## After LP-007

Engineering gates are done. The remaining launch items are operational and human, not diffs in the repo: dedicated database provisioning, production secrets, the executed restore drill (using LP-006's scripts per the runbook), monitoring/alert configuration in the hosting provider, accountant and legal sign-off, staging acceptance, and controlled tenant onboarding.
