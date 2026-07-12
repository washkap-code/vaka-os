# Book Nineteen - Testing and Quality Assurance

**Version:** 1.0  
**Definition:** Accepted verification system  
**Implementation:** Critical backend/platform/finance and CI foundations; frontend E2E and several gates remain incomplete

## 1. Quality doctrine

Testing provides evidence about a named risk and release; it does not prove the absence of defects. Quality begins with an outcome, canonical model, invariants, permission/audit/failure design and testable acceptance criteria. A green build alone is insufficient.

## 2. Test layers

- Static: TypeScript, lint/format, schemas/contracts, architecture and documentation links.
- Unit/property: deterministic rules, calculations, validators, state transitions and edge cases.
- Contract: API/event/provider/client compatibility, errors and versioning.
- Integration: database transactions, adapters, queues, storage, search and provider sandboxes.
- End-to-end: representative user journeys across browser/mobile/client and modules.
- Specialist: finance/stock/payroll/tax/currency, security/privacy, migration/concurrency, performance/resilience, accessibility/mobile/localisation and AI.
- UAT/pilot/production: customer process, operational readiness, smoke/reconciliation and outcome observation.

## 3. Cross-cutting mandatory suites

Tenant isolation covers ID lookup, filters, joins, files, exports, caches, search, events, jobs, integrations, AI, admin/support and deletion/retention. Permission suites test allowed, denied, lifecycle, step-up/approval, segregation and UI/API parity. Audit suites test catalogue, actor/tenant/reason, success/failure, minimization, ordering and export.

## 4. Finance, stock and payroll

Use exact fixtures for balance, invalid/unbalanced rejection, idempotency, concurrency, period lock, numbering, FX/cost/tax snapshots, reversals, AR/AP allocation, reconciliation, oversell rollback, append-only enforcement, payroll calculation/correction and report tie-outs. Qualified reviewers approve representative statutory fixtures.

## 5. Migration and data

Test schema upgrade/rollback or forward-fix, backfill restart/idempotency, representative volume, tenant/legal-entity ownership, mapping/transformation, invalid/duplicate input, dry run, exception recovery, reconciliation, cutover and exports. Tests use disposable environments and synthetic/anonymized data under policy.

## 6. Security, performance and resilience

Threat-model-based tests cover authentication/session, authorization, enumeration, injection, files, webhooks/replay, rate/abuse, SSRF/path, secrets/logs, supply chain, AI injection/tool misuse and admin paths. Performance defines user-flow latency/throughput, database/query budgets, scale profile and regression threshold. Resilience exercises provider/database/queue/storage/model latency/failure, retry storms, partial results, recovery and data consistency.

## 7. Experience and language

Automated and manual accessibility, responsive widths/devices, touch/keyboard/screen reader, zoom/reflow, contrast/motion, loading/empty/error/retry/offline/conflict and visual regression cover core workflows. Locale tests cover English fallback, Shona/Ndebele reviewed scope, text expansion, formatting, documents and AI language behavior.

## 8. AI evaluation

Datasets and thresholds are versioned per use case/language/autonomy. Score facts, calculations, citations, permission/tenant isolation, injection, unsafe actions, uncertainty, tone/usefulness, latency, cost and failure. Provider/model/prompt/tool/retrieval/policy changes trigger reruns. Human review is required where automated scoring cannot establish business/professional correctness.

## 9. Evidence and flake control

Record commit/artifact, environment/config, dataset/fixture, command, timestamps, result, failures/skips, coverage, logs/screenshots/reports and approver. Flaky tests are quarantined only with owner, issue, risk assessment and expiry; retries never convert an unexplained failure into evidence.

## 10. Gate matrix

Apply `docs/04-execution/QUALITY-GATES.md`. No-go includes tenant leakage, permission bypass, financial/stock/payroll corruption, missing critical security/config, untested destructive migration, unrecoverable data risk, critical core accessibility block or unapproved legal/regulatory claim.

Target 95% unit coverage is a Platform-service risk target, not an excuse to omit integration/invariant tests. Coverage thresholds are introduced package by package with a baseline and no regression.

## 11. Current verification note

As of this blueprint build, TypeScript and web production build pass, and isolated Platform tests pass. The full local backend suite requires a correctly provisioned disposable PostgreSQL role/database; a missing local role is an environment block, not a passing suite. CI remains the intended complete database environment.
