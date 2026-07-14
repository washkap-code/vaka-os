# P4-004 — Completion Report

**Implementation:** Complete for supplier performance and spend analytics  
**Technical verification:** Static/local gates complete; hosted DB-backed gate pending  
**Availability:** Authenticated tenant Procurement workspace and read API  
**Production migration:** None  
**Completed on:** 2026-07-14

## Delivered

- Added a strictly validated, `private, no-store` supplier analytics endpoint
  for an inclusive period, exposure as-at date and optional canonical supplier
  filter. Access accepts existing `procurement.read`, `accounting.read` or
  `reports.read` authority and every source query derives tenant scope from the
  verified JWT.
- Added exact posted-bill spend by canonical supplier/original currency. Base
  gross comes from the immutable AP journal source; per-line base net/tax uses
  snapshotted bill rates and exact integer/rate arithmetic, with an explicit
  source-difference check.
- Added completed-PO delivery performance. The final receipt UTC date is
  compared to the expected UTC date, orders without expected dates remain
  disclosed/excluded, and rates are returned as integer basis points.
- Reused the deterministic P4-003 evaluator for current draft bill exceptions
  and exposed exact draft price variance at the PO rate. Posted variance remains
  zero under strict matching. Rolled-back posting attempts are explicitly not
  presented as persisted history.
- Added open GRNI source exposure from receipt value less posted matched bill
  net value at the immutable PO rate, plus supplier-bill AP source exposure.
  Both retain original currency and show tenant source schedule, control
  balance, difference and tie status. AP remains labelled as an incomplete
  open-item subledger until payments/allocations exist.
- Added a responsive Supplier Analytics section to Procurement with catalogue-
  owned copy, labelled date/supplier controls, explicit run/retry behavior,
  loading/error/empty states, summary metrics, keyboard-scrollable tables and
  textual reconciliation/disclosure states at 320, 640 and desktop layouts.
- Added DB-backed acceptance coverage for FX/original-currency trace, spend/AP
  source tie-out, partial billing/open GRNI, on-time completion, current price
  and quantity blocks, tenant/RBAC isolation, invalid periods, unallocated AP
  control differences and zero report-write side effects.

## Files changed

- Mission and governance:
  `docs/engineering/mission-packs/P4-004/README.md`, this completion report,
  `CHANGELOG.md`, the master build plan and authoritative finance architecture.
- Server: `server/src/supplier-analytics.ts` and the authenticated report route
  in `server/src/routes.ts`.
- Web: the Procurement workspace, typed English catalogue, responsive styles
  and accessibility-conformance contract.
- Verification: `server/tests/supplier-analytics.test.ts`.

## Behaviour and control evidence

- The report creates no journal, stock movement, number, audit record, domain
  event or operational row.
- Supplier filtering revalidates the vendor role under tenant scope; a foreign
  supplier identifier returns safe not-found behavior.
- All money aggregation uses exact `bigint` minor units. Quantity evidence uses
  exact thousandths and rate multiplication parses six-decimal strings into
  integers before round-half-up conversion.
- Canonical live reads remain authoritative. Existing P1-005 events keep source
  discovery/search current but are not treated as a guaranteed financial
  balance because delivery remains process-local and best-effort.
- Base currency, original currency, immutable rate basis, period/as-at basis,
  provisional legal-entity scope and professional-review blockers are explicit
  in the API response.

## Verification evidence

- Conflict-copy scan: passed before implementation; no matching iCloud
  conflict-copy files were present.
- Server typecheck: passed.
- Web typecheck: passed.
- Web production build: passed; Supplier Analytics remains in the code-split
  Procurement workspace. The existing main-bundle size advisory remains a
  non-failing optimisation notice.
- Design-token conformance: passed (236 governed tokens).
- Accessibility conformance and negative self-test: passed, including labelled
  report controls, named keyboard-scrollable regions, textual reconciliation
  states and responsive contracts.
- Shell/navigation tests: 16 passed, 0 failed.
- `git diff --check`: passed during implementation review.
- Guarded `test:db:prepare`, focused supplier analytics tests and the full
  serial DB-backed server suite: pending the hosted pull-request PostgreSQL
  gate because this workstation has no `DATABASE_URL`, PostgreSQL executable or
  Docker runtime. No unsafe fallback database was used.
- No production database, shared Supabase or GENFIN command was run.

## Production migration

P4-004 adds no table, column, index, constraint, enum, backfill or seed change.
There is no production DDL to hand-apply for this mission.

Do not run `drizzle-kit push` or `db:push` against the shared production
Supabase project. The separately pending P4-001 through P4-003 migrations
remain outside this mission and require their already documented authorised
hand-application.

## Risks and release gates

- AP exposure is a posted supplier-bill source schedule, not a complete open-
  item subledger. Payment allocation and supplier statement reconciliation are
  future controlled work.
- Match-block reporting is a current deterministic re-evaluation. P4-003
  intentionally records no side effect for a rejected posting attempt, so
  historical attempt analysis requires a future approved evidence design.
- The report executes canonical live queries and sequential draft match checks.
  Query plans, pagination/projection and performance SLO evidence are required
  before very high-volume GA.
- Tenant remains the provisional legal-entity surrogate. Qualified accounting
  review is required before assurance, statutory or complete-AP claims.
- P1-005 remains best-effort/process-local; this report does not depend on it
  for correctness. A durable outbox/projection is a separate platform mission.

## Rollback

Revert the report route/service, Procurement analytics section, tests and
governance updates together. No data rollback, journal reversal, schema change
or production DDL is required because P4-004 is read-only and schema-free.

## Next mission

After the newly reported invoice customer-selection and invoice-workspace
repair is isolated, continue with P5-003 weighted-average inventory valuation
feeding COGS through the existing journal service.
