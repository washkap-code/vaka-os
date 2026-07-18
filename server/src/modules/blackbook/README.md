# Black Book Core

P11-001 adds a structured, global directory of government organisations,
contact points, and public services. It complements the existing PB-001
country-pack registry; it does not replace, mutate, or weaken that registry's
versioned import controls.

## Trust boundary

- The four P11 tables intentionally have no `tenant_id`. Their content is
  platform reference data and every authenticated tenant reads the same
  country projection.
- Tenant identities cannot write. Mutations require an active platform user
  whose platform role contains `blackbook:editor`; the service rechecks this
  invariant inside the database transaction as well as the route middleware.
- Every effective create, update, retirement, or delete writes a full
  `blackbook_revisions` before/after record and a `platform_audit_logs` event
  in the same transaction. An idempotent PUT that changes nothing performs no
  database write and therefore creates no false revision.
- Organisations are retired by setting `status = dissolved`, preserving their
  identity and hierarchy. Contact points and services may be deleted, with
  the removed record retained in revision history.
- `verified_at = NULL` is explicitly unverified. API responses return
  `review_due: true` for null dates or content whose one-year verification
  anniversary has passed.

## Shared read path

`GET /api/v1/blackbook/organisations`, organisation detail, and
`GET /api/v1/blackbook/services` are authenticated shared-reference reads.
They do not accept or expose a tenant id. Structured organisations and
services are also registered as `government_organisation` and
`government_service` SearchService types; universal search derives the
country from the authenticated tenant and selects active organisations only.

## Seed safety

`npm run seed:blackbook --workspace server` adds an idempotent Zimbabwe
structure using names already present in the repository country pack. It does
not seed phone numbers, addresses, email addresses, fees, requirements,
processing times, official forms, or service URLs. Placeholder contact values
and all verification dates are null. Editorial and qualified professional
review remain required before VAKA presents regulatory details as current or
authoritative.

## Migration coordination

P11-001 reserves migration 0053 because 0048-0052 belong to unmerged parallel
missions. `migration-reservations.json` makes those exact reservations
explicit without importing their code or schema into this independent branch.
Apply production migrations in numeric order; do not apply 0053 before the
reserved predecessors have merged and passed their hosted gates.
