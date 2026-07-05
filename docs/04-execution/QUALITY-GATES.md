# VAKA Quality Gates

**Status:** Mandatory release gates
**Owner:** Engineering, Product, Security, and Operations

## Gate 0 — Ready for implementation

- Outcome, user, scope, and acceptance criteria defined.
- Dependencies and affected modules identified.
- Security, privacy, tenant, permission, audit, localisation, accessibility, mobile, AI, data, migration, and rollback impacts assessed.
- Availability claim approved.
- No unresolved decision blocks implementation.

## Gate 1 — Repository health

- Clean/reproducible dependency install.
- Format/lint/type checks pass.
- Builds pass.
- Existing automated tests pass.
- No unexplained generated or unrelated changes.
- CI configuration passes.

**Fail closed:** A red baseline cannot be ignored; record and isolate pre-existing failure before proceeding.

## Gate 2 — Functional correctness

- Acceptance tests pass.
- Negative/failure paths pass.
- Existing workflows still pass.
- API contracts remain compatible or have an approved version/migration.
- Loading, empty, error, retry, and unavailable states work.

## Gate 3 — Tenant, permission, and audit

- Direct and indirect cross-tenant tests pass.
- Server-side permission tests pass for allowed and denied roles.
- Platform-admin scope is explicit.
- Audit-sensitive success and failure behavior is correct.
- Exports, files, search, cache, events, and AI context are tenant-safe.

**Fail closed:** No production exception for known tenant leakage or permission bypass.

## Gate 4 — Data integrity and migrations

- Exact financial/quantity calculations pass.
- Ledger, stock, payroll, and document invariants pass where affected.
- Transaction rollback and concurrency behavior pass.
- Idempotency is verified.
- Migration and backfill are tested on representative data.
- Rollback/recovery and reconciliation are documented.

## Gate 5 — User experience

- Required responsive widths and representative devices pass.
- Keyboard/focus/semantic checks pass.
- Contrast, zoom, screen-reader labels, and reduced motion are checked.
- No horizontal overflow or inaccessible interaction.
- No new hard-coded user-facing strings.
- English fallback and text expansion pass.

## Gate 6 — Security and privacy

- Threat model/security checklist complete.
- Dependency, secret, static, and applicable dynamic scans pass.
- Authentication/session/CORS/CSRF/rate/file controls tested where affected.
- Sensitive data is absent from logs/errors/analytics/prompts.
- Provider/data-processing review complete.
- Critical/high findings resolved or explicitly blocked from release.

## Gate 7 — AI

Applies to AI changes:

- Approved use case and provider.
- Tenant/permission isolation passes.
- Prompt-injection and unsafe-action tests pass.
- Groundedness/correctness/tone thresholds pass.
- Costs, rate limits, timeouts, fallback, monitoring, and kill switch work.
- Human confirmation/audit works for any approved action.
- Language-specific evaluation completed before language enablement.

## Gate 8 — Operational readiness

- Structured logs/metrics/alerts exist for material failure.
- Runbooks/support ownership updated.
- Backups/recovery impact reviewed.
- Feature flag and rollback tested where required.
- Staging smoke/acceptance passes.
- Release notes/changelog/decision log/documentation updated.

## Gate 9 — Pilot/production go-no-go

- Definition of Done satisfied.
- Product, Engineering, Security, Operations, and required professional approvals recorded.
- Known risks have owners and accepted disposition.
- Capacity, support, incident response, RPO/RTO, and rollback are ready.
- Marketing/availability claims match deployed capability.
- Post-release verification and observation window defined.

## Required evidence matrix

| Change risk | Minimum evidence |
|---|---|
| Documentation only | Link/format checks, consistency review |
| Low-risk UI | Build, interaction, responsive, accessibility, localisation, visual regression |
| API/domain | Type/build, unit/integration, contract, tenant, permission, audit |
| Database | Migration, rollback, backup impact, integrity, concurrency, reconciliation |
| Financial/stock/payroll | Specialist fixtures/review, exactness, transaction, audit, reversal |
| Auth/security | Threat model, abuse/negative testing, security review |
| AI | AI Gate plus provider/privacy/evaluation evidence |
| Production infrastructure | Staging, observability, restore/rollback, incident readiness |

## Enforcement

- Gates are binary unless an approved time-limited exception exists.
- Gate evidence travels with the change.
- The author cannot self-approve high-risk security, financial, payroll, migration, or AI gates.
- Repeated exceptions indicate roadmap work, not a permanent process shortcut.
