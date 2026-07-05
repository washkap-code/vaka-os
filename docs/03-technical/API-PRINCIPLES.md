# VAKA API Principles

**Status:** Technical standard
**Owner:** Engineering
**Last reviewed:** 2026-07-04

## 1. API-first

VAKA’s web client, future mobile apps, portals, integrations, automations, and AI tools depend on stable server APIs.

Business rules must not be implemented only in a client.

## 2. API boundaries

- Public marketing APIs
- Authentication/session APIs
- Tenant business APIs
- Customer/supplier portal APIs
- Platform-admin APIs
- Integration/webhook APIs
- Internal job/event APIs
- AI tool APIs

Each boundary has explicit authentication, authorisation, rate, audit, and data-exposure rules.

## 3. Versioning

- Use a documented version prefix for externally consumed APIs.
- Prefer compatible additive changes.
- Deprecations include notice, metrics, migration guidance, and removal date.
- Event and webhook payloads are versioned.
- Mobile-client compatibility windows are longer than web deployments.

## 4. Tenant context

- Tenant context comes from authenticated identity/session.
- Do not authorise using request-body/query tenant IDs.
- Every resource lookup checks tenant ownership.
- Platform cross-tenant access is explicit and audited.
- External portal identities are scoped to their customer/supplier relationship.

## 5. Permissions

- Enforce role permissions server-side per operation.
- Separate read, create, approve, post, reverse, export, administer, and impersonate capabilities.
- Sensitive operations may require step-up authentication or approval.
- Return safe 403/404 behavior without cross-tenant leakage.
- AI tools call the same permission-aware services.

## 6. Contracts

- Define typed request, response, error, pagination, and event schemas.
- Validate all untrusted inputs.
- Generate or share client types where practical.
- Document OpenAPI for HTTP APIs.
- Do not expose raw database rows accidentally.
- Stable machine values remain separate from translated labels.
- Dates use ISO 8601 with explicit time zone.
- Exact money values use strings/structured money, not floating point.

## 7. Resource and command design

Use resource endpoints for ordinary CRUD and explicit commands for business state transitions.

Examples:

- `POST /invoices`
- `POST /invoices/{id}/issue`
- `POST /invoices/{id}/void`
- `POST /purchase-orders/{id}/receive`
- `POST /payroll-runs/{id}/approve`

Command endpoints:

- validate current state;
- enforce permissions;
- use transactions;
- require reason/confirmation where appropriate;
- support idempotency;
- create audit events; and
- return the resulting state.

## 8. Errors

Return a stable structure:

```json
{
  "error": {
    "code": "INVOICE_ALREADY_ISSUED",
    "message": "Only draft invoices can be issued.",
    "requestId": "..."
  }
}
```

- Codes are stable and translation-ready.
- Messages are safe and concise.
- Validation identifies fields without exposing internals.
- 500 responses never leak stack traces, SQL, secrets, or provider payloads.
- Retriable errors are distinguishable.

## 9. Pagination and filtering

- Cursor pagination for growing collections.
- Explicit limits and maximums.
- Stable sort order.
- Typed filters.
- Search is tenant-scoped.
- Exports use asynchronous jobs when datasets are large.

## 10. Idempotency and concurrency

Require idempotency for retry-prone commands:

- payments;
- POS sales;
- invoice issue;
- payroll finalisation;
- stock adjustments/imports;
- webhook processing; and
- AI-confirmed actions.

Use conflict responses for stale state and optimistic concurrency where useful.

## 11. Security and privacy

- TLS only in production.
- Secure session/token handling.
- CORS allow-list.
- Rate limits and abuse controls.
- Payload size limits.
- File validation/scanning.
- Data minimisation.
- Sensitive-field redaction.
- Security headers at the application/edge.
- Audit sensitive access and exports.

## 12. Mobile and offline clients

APIs for future mobile apps should:

- minimise round trips and payloads;
- support conditional requests/caching;
- expose sync cursors/timestamps where justified;
- define offline-capable resources;
- use idempotency for queued writes;
- return conflict information;
- tolerate older clients through version policy; and
- never move authoritative financial rules onto the device.

## 13. Localisation

- Requests may declare locale preference.
- Stable response codes and values are language-neutral.
- User-facing messages use translation keys/catalogues.
- Numbers, currencies, and dates retain canonical values.
- English fallback is guaranteed.
- English, ChiShona, and isiNdebele are supported through reviewed catalogues.

## 14. Events and webhooks

Webhooks/events are:

- versioned;
- signed where external;
- tenant-scoped;
- idempotent;
- retryable;
- observable;
- minimal in sensitive data; and
- replayable according to policy.

Never assume delivery order unless explicitly guaranteed.

## 15. AI tools

AI tool APIs are narrower than general application APIs.

- Structured inputs/outputs
- Permission check per call
- Bounded result size
- No raw SQL
- No unrestricted search
- Explicit action preview and confirmation
- Audit/correlation ID
- Timeouts and cost/rate limits

## 16. Observability

Every request should support:

- request/correlation ID;
- structured logs;
- duration and status metrics;
- tenant-safe diagnostic context;
- trace propagation;
- dependency timing; and
- alerting for critical error/latency rates.

Do not include secrets or unnecessary personal data in telemetry.

## 17. Testing

Test:

- contracts and validation;
- authentication;
- permission combinations;
- tenant isolation;
- idempotency;
- concurrency;
- pagination;
- error safety;
- rate limits;
- backward compatibility;
- webhooks/retries; and
- mobile/offline conflict behavior.
