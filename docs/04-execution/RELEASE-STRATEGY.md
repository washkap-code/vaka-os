# VAKA Release Strategy

**Status:** Controlled release standard
**Owner:** Engineering, Product, Security, and Operations

## 1. Principles

- Release small, reversible changes.
- Separate deployment from availability through feature flags where risk justifies it.
- Preserve backward compatibility during rollout.
- Never combine unrelated high-risk migrations/features.
- Observe before expanding.
- Availability claims follow deployed reality.

## 2. Environments

### Local

Fast development with synthetic data.

### CI

Isolated, repeatable builds/tests/scans.

### Staging

Production-like configuration without production data/secrets; migration, integration, accessibility, performance, and rollback rehearsal.

### Pilot

Selected Zimbabwean tenants under explicit support, consent, flags, and monitoring.

### Production

Controlled customer availability with on-call, support, backups, and incident response.

## 3. Release types

| Type | Examples | Approval |
|---|---|---|
| Documentation | Policy/spec clarification | Document owner |
| Low-risk patch | Copy/style/isolated bug | Engineering + applicable product review |
| Standard feature | Additive module capability | Product + Engineering + gates |
| High-risk | Auth, permissions, finance, stock, payroll, migration | Product, Engineering, Security, Operations, professional review as required |
| Emergency | Active incident/vulnerability | Incident commander; retrospective required |

## 4. Versioning

- Public APIs/events use explicit versions and deprecation windows.
- Web application may release continuously when gates pass.
- Mobile apps use semantic versions and supported-client windows.
- Database migrations have ordered immutable identifiers.
- Product releases use release identifiers/dates even if package versions differ.

## 5. Standard release flow

1. Define scope, owner, risk, acceptance, rollback.
2. Pass ready-for-implementation gate.
3. Implement behind compatible boundary/flag where needed.
4. Pass CI and all applicable quality gates.
5. Deploy to staging.
6. Run migration/rollback and acceptance rehearsal.
7. Complete go/no-go review.
8. Deploy progressively.
9. Run production smoke and reconciliation.
10. Observe defined window.
11. Expand availability or roll back.
12. Publish changelog and close evidence.

## 6. Progressive delivery

Use as appropriate:

- internal users;
- synthetic/demo tenants;
- selected pilot tenants;
- percentage/tenant cohort;
- country/language/module flags;
- read-only before write;
- preview before general availability.

Flags are permission-checked server-side for sensitive behavior, have owners/expiry, and do not become permanent hidden architecture.

## 7. Database releases

- Expand/migrate/contract.
- Backward-compatible application during transition.
- Backup/recovery impact reviewed.
- Backfills are restartable, observable, idempotent, and tenant-safe.
- Destructive contraction follows evidence and retention window.
- Financial/stock/payroll migrations include reconciliation.
- Rollback may mean forward fix/restoration rather than unsafe reverse migration.

## 8. AI releases

- Internal synthetic evaluation first.
- Read-only tenant pilot.
- Explicit Preview label.
- Per-tenant/user limits.
- Monitoring and kill switch.
- Tool/action enablement separately gated.
- Model/prompt/tool changes rerun evaluations.
- AI outage never blocks deterministic VAKA workflows.

## 9. Localisation releases

- English source approved first.
- Shona/Ndebele catalogues enabled independently after native review.
- Per-locale fallback/disable.
- Metadata, documents, accessibility, mobile expansion, and support readiness checked.
- Do not combine new locale and high-risk domain behavior in one uncontrolled release.

## 10. Rollback

Every release defines:

- decision owner;
- triggers;
- maximum decision time;
- application rollback;
- feature disablement;
- migration/data recovery approach;
- queue/event handling;
- cache invalidation;
- reconciliation;
- customer/support communication; and
- post-rollback verification.

Never “roll back” posted financial, stock, or payroll history by deleting it. Use domain reversals/compensation.

## 11. Go/no-go criteria

Go only when:

- quality gates pass;
- known risks are accepted by correct owners;
- observability and alerts are live;
- backups/restore and rollback are ready;
- capacity/support/on-call are ready;
- documentation/changelog match the release;
- availability claims are accurate.

No-go for:

- tenant leakage;
- permission bypass;
- financial/stock/payroll corruption;
- missing production secret/security control;
- untested destructive migration;
- unrecoverable data risk;
- critical accessibility block in core workflow;
- unapproved legal/regulatory claim.

## 12. Post-release

- Verify health, errors, latency, queues, database, and key workflows.
- Reconcile affected financial/stock/payroll records.
- Review support feedback.
- Record incidents and decisions.
- Remove/advance flags deliberately.
- Hold retrospective for high-risk/emergency releases.

## 13. Pilot-to-production launch

Production launch requires:

- successful pilot outcomes;
- security and professional sign-offs;
- tested restore within RTO/RPO;
- monitored capacity;
- support and incident readiness;
- approved legal/privacy documents;
- only reviewed locales enabled;
- AI state accurately labelled;
- staged rollout and rollback rehearsal.
