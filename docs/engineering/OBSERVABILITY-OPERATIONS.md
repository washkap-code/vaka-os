# VAKA pilot observability operations

## Monitor targets

Point the external uptime monitor at the deployed API origin, not the web
origin.

| Endpoint | Purpose | Healthy response | Recommended cadence |
| --- | --- | --- | --- |
| `GET /healthz` | Liveness only: proves the process can answer HTTP. It deliberately performs no dependency checks. | HTTP 200 with service version and process uptime. | Every minute. |
| `GET /readyz` | Readiness: checks a cheap database query, the schema markers for migration 0045, and the configured email transport. | HTTP 200 with each check marked `pass` or non-production `not_required`. Any failed critical check returns HTTP 503. | Every minute, with an alert after three consecutive failures. |

Both routes are unauthenticated so an uptime service can call them. Responses
contain status labels only: they never expose database URLs, SMTP hosts,
credentials, query errors, stack traces or internal paths. The older
`GET /health` compatibility endpoint remains available, but new monitors must
use `/healthz` and `/readyz`.

## Log record contract

The server writes one JSON object per line. Every record includes
`timestamp`, `level`, `message`, `requestId`, `tenantId`, `userId`, `route`,
`status` and `latencyMs`; fields without applicable context are `null`.
Request records use `event=http.request.completed`. The server accepts a safe
`X-Request-Id` supplied by an edge or caller, otherwise generates one, and
returns it in the response header. JSON error responses also contain the
request ID in their body.

At info level, only opaque IDs and operational metadata are allowed. Passwords,
tokens, cookies, request bodies, names, email addresses and recipients are
redacted by the logger. LP-004's operator endpoint remains the permission-gated
place to see actual failed recipients. Full rendered email content is emitted
only by the explicit non-production console transport at debug level; access
to development and staging logs must therefore remain restricted.

## Operator queries

These substrings work in the Vercel runtime-log search and in any line-oriented
JSON collector. Add a time range in the log viewer rather than embedding dates
in the query.

| Question | Query/filter |
| --- | --- |
| Is the API answering? | `"event":"http.request.completed" "route":"/healthz"` |
| Why is the instance not ready? | `"event":"http.request.completed" "route":"/readyz" "status":503` and inspect the corresponding readiness response. |
| Which requests errored? | `"event":"http.request.completed" "level":"error"` |
| What happened in one request? | `"requestId":"<request-id>"` |
| Which emails failed today? | `"event":"email.failed"`; for recipient-level detail use `GET /api/v1/platform/operations/email-failures/today` with `platform.operations.read`. |
| Are event projections failing? | `"event":"event.subscriber_failed"` or `"event":"event.post_commit_publish_failed"` |
| Did the process crash? | `"event":"process.uncaught_exception"` or `"event":"process.unhandled_rejection"` |
| Are error reports reaching the tracker? | `"event":"error_tracking.delivery_failed"` or `"event":"error_tracking.capture_failed"` |

The metrics-lite business events are `auth.login.succeeded`,
`auth.login.failed`, `invoice.posted`, `migration.applied` and `email.failed`.
Here, `migration.applied` means a tenant Migration Hub step was committed; it
does not mean that a numbered Drizzle schema migration ran.

## Baseline alerts

1. **Readiness:** `/readyz` returns 503 three consecutive times. Page the
   operator; distinguish `database`, `migrations` and `smtp` in the response.
2. **HTTP error-rate spike:** `http.request.completed` with status 500–599
   exceeds the normal five-minute baseline. Group by route, then correlate by
   request ID.
3. **Email failures:** any sustained `email.failed` increase, or more than the
   agreed pilot threshold in 15 minutes. Use the permission-gated endpoint for
   the affected recipients.
4. **Database connectivity:** `/readyz` reports the database check failed even
   once; page after three consecutive failures.
5. **Schema readiness:** `/readyz` reports `schema version mismatch`. Do not
   route traffic until migrations through 0045 have been applied and verified.
6. **Process crash:** any `process.uncaught_exception` or
   `process.unhandled_rejection`. Confirm the process manager restarted the
   instance and correlate preceding request IDs.
7. **Disk/host capacity:** configure this at the hosting/database provider.
   The application has no safe portable view of provider disk capacity and
   must not pretend otherwise.
8. **Authentication failures:** alert on an unusual increase in
   `auth.login.failed`, grouped by route and deployment rather than email or
   name (neither is logged).

## Optional error tracking

Set `SENTRY_DSN` to an HTTPS Sentry-compatible project DSN to forward unhandled
request errors, uncaught exceptions and unhandled rejections with opaque
request/user/tenant IDs and route context. When the variable is empty, the
hook is a no-op and local structured logging is unchanged. `APP_VERSION` sets
the release label; Vercel's `VERCEL_GIT_COMMIT_SHA` is used when it is omitted.

No Sentry project, Vercel Drain, alert policy or third-party monitoring account
is created by this code change. Operators must configure those external
surfaces separately and verify receipt with a controlled non-production error.
