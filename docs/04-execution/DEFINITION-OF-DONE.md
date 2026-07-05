# VAKA Definition of Done

**Status:** Mandatory execution standard
**Owner:** Product and Engineering

## 1. Non-negotiable definition

A task is done only when all applicable conditions are evidenced.

### Behavior

- Acceptance criteria are satisfied.
- Existing functionality still works.
- No unrelated behavior changed.
- Failure, empty, loading, retry, permission, and offline states are handled where relevant.

### Code and build

- TypeScript/type checks pass.
- Production builds pass.
- Formatting/lint checks pass.
- No unjustified `any`, dependency, duplication, or dead code is introduced.
- Database changes use versioned migrations.

### Tests

- Automated tests pass.
- New/changed logic has proportionate unit/integration/E2E coverage.
- Regression tests cover fixed defects.
- Flaky or skipped tests are not hidden; exceptions have owner and expiry.

### Responsive and accessible

- Mobile, tablet, laptop, and desktop behavior is verified where applicable.
- Keyboard, focus, semantics, contrast, zoom, and reduced motion are considered.
- WCAG 2.2 AA issues introduced by the change are resolved.

### Localisation

- No hard-coded user-facing strings are introduced.
- Copy uses typed localisation catalogues.
- English fallback works.
- Text expansion is considered.
- Shona/Ndebele changes receive required native review before enablement.

### Tenant, permissions, and audit

- Tenant isolation is preserved and tested.
- Permissions are enforced server-side.
- Cross-tenant failures do not leak existence/data.
- Audit-sensitive actions are logged with tenant, actor, action, entity, time, and appropriate reason/metadata.

### Security and privacy

- Inputs are validated and outputs are safe.
- Secrets and sensitive data are not exposed in code, logs, analytics, prompts, or errors.
- Threat/abuse cases are considered.
- Data retention/export/deletion impact is documented.
- Dependency/provider risks are reviewed.

### Data integrity

- Financial, stock, payroll, and document invariants remain intact.
- Authoritative calculations use exact representations.
- Consequential retries are idempotent where needed.
- Migrations, backfills, reversals, and reconciliation are tested.

### AI

- AI is optional and fails safely.
- Tenant/permission scope is enforced per tool.
- Facts, inferences, and recommendations are distinguishable.
- Consequential actions require approved confirmation/audit.
- Evaluation thresholds pass for changed AI behavior.

### Operations and release

- Observability is sufficient to detect failure.
- Rollback steps, triggers, owner, and data consequences are documented.
- Feature flags/kill switches exist where risk requires them.
- Support/runbooks are updated.

### Documentation

- User, product, API, architecture, operations, and legal documentation are updated as applicable.
- Availability labels accurately reflect live/preview/planned state.
- Decision Log and Changelog are updated when required.

## 2. Evidence checklist

Each completed task should link:

- acceptance evidence;
- test/build results;
- screenshots or API examples where useful;
- security/tenant/permission evidence;
- accessibility/responsive evidence;
- migration/rollback evidence;
- documentation changes; and
- approvals.

## 3. Exceptions

An exception must include:

- unmet criterion;
- reason;
- risk;
- compensating control;
- owner;
- expiry date; and
- approval.

Critical tenant-isolation, permission, financial-integrity, secret, or data-loss criteria cannot be waived for production.
