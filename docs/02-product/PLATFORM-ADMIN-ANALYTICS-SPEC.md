# VAKA Platform Administration and Management Analytics

**Status:** Approved product direction; partial platform console exists
**Owner:** VAKA Leadership, Product, Finance, Operations, Security, and Engineering
**Last reviewed:** 2026-07-05

## Outcome

Give authorised VAKA leadership a reliable view of growth, revenue, customer
health, adoption, security and service quality without routine access to
customer business content.

## Current implementation

The live platform console provides platform-admin authentication, a tenant list
with company/status/plan/user count and dates, plus a manual billing action.

It does not yet provide reliable current-login counts, management analytics,
analytics exports, scheduled reports, cohorts, product instrumentation or a
dedicated `/admin` route.

## Access

Platform administrators sign in at `https://www.vakaos.com/`. The server
recognises an approved platform-admin identity and opens the console. Passwords
must never be published or shared. Named accounts, MFA, recovery controls and
immutable admin auditing are required.

## Users and sessions

“Logged on” must use server-side session evidence, not `lastLoginAt`.

Show registered/enabled users, users with valid sessions, total sessions,
active-now users (initially a five-minute window), recently active users,
inactive valid sessions, client type and failed/revoked sessions.

Platform dashboards use privacy-safe aggregates. Named tenant-user session
access belongs to the tenant Owner except for approved, audited security/support
cases.

## Management analytics

### Growth and commercial

- companies by lifecycle, package, country and acquisition source;
- trials, activations, paid conversions, retention and cohorts;
- MRR, ARR, collected revenue, average revenue and package mix;
- upgrades, downgrades, cancellations and failed collections;
- provider/variable costs and margin indicators; and
- referral and Professional Partner contribution.

### Adoption and customer health

- active companies/users by approved period;
- CRM, invoicing, finance, inventory and reporting adoption;
- import success, error and review rates;
- mobile/document-capture usage;
- invoice issue/send/download/payment funnel;
- integration, localisation and VAKA AI adoption when live;
- onboarding state, usage decline, support burden and limit pressure.

### Reliability and security

- availability, latency, error and job health;
- database/storage growth and backup/restore evidence;
- integration failure/retry queues;
- privileged accounts, MFA and security events;
- tenant-isolation test status; and
- incidents and control exceptions.

## Reports

Provide daily operations, weekly growth, monthly management, subscription
revenue/collections, retention, package adoption, partner performance,
reliability/security and import-quality reports.

Support authorised CSV/XLSX/PDF exports. Every metric/report states definition,
freshness, filters and calculation basis. Financial reporting distinguishes
billed, collected, refunded, deferred and recognised values.

## Architecture and privacy

- Use versioned, minimal analytics events and an outbox.
- Exclude secrets, document contents and unnecessary customer data.
- Build reconciled aggregates rather than scanning operational tables.
- Base financial metrics on authoritative billing/payment records.
- Track late events, corrections, backfills and data freshness.
- Enforce least privilege, MFA, step-up authentication and audit.

Platform roles should separate Super Admin, Operations, Finance, Security,
Executive Viewer and Support. Super-admin status does not grant routine access
to tenant invoices, contacts, payroll, messages, files or ledgers.

## Implementation order

1. Named admin roles, MFA and admin-session hardening.
2. Server-side sessions and privacy-safe presence aggregates.
3. Metric dictionary and report definitions.
4. Billing, tenant and user aggregate endpoints.
5. Executive dashboard and filters.
6. Export and scheduled management packs.
7. Product event/outbox and adoption analytics.
8. Reliability, security, integrations and partner reporting.
9. Forecasting and VAKA AI briefing after data-quality gates.

## Acceptance criteria

- Session counts distinguish active-now, signed-in users and total sessions.
- Metrics reconcile to authoritative records and have named definitions.
- Dashboards do not expose routine tenant business content.
- Exports are bounded, permission-checked and audited.
- Administrators use named identities with MFA.
- Cross-tenant and role-boundary tests pass.
- Delayed, partial and unavailable states are visible.

