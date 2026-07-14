# P9-009 Completion Report

**Date:** 2026-07-14
**Status:** Implementation complete; legacy migration, fresh schema, focused security and full local domain gates passed; remote migration and production release pending

## Delivered

- Added `tenant_ownerships` with one tenant per record, one unique owner user and
  a composite foreign key proving the owner belongs to that same tenant.
- Established ownership and a privacy-minimised
  `security.tenant_ownership_established` audit event inside atomic signup.
- Changed authenticated `isTenantOwner` resolution from mutable role name to
  the explicit tenant/user ownership pair.
- Changed owner-disable protection to the explicit identity record.
- Added idempotent migration `0024` with fail-closed legacy ambiguity detection,
  exact backfill and migration-source audit evidence.
- Extended production runtime-schema readiness checks.
- Added negative tests for role rename, role-name lookalike, cross-tenant owner
  reference and owner disable.
- Updated the session/activity specification, security principles and migration
  operating runbook.

## Verification evidence

- Clean pre-change baseline: 67 files and 227 tests passed on a recreated,
  guarded `vaka_os_test` PostgreSQL database.
- Legacy migration path: 109 existing tenants produced exactly 109 ownership
  records and 109 ownership audit events.
- Migration idempotency: a second run retained the same 109/109/109 counts.
- Migration ambiguity: a temporary tenant with no active system Owner was
  rejected with the required fail-closed exception and then removed.
- Fresh schema: guarded Drizzle schema preparation, finance integrity controls
  and seed completed successfully.
- Runtime schema: deployment-readiness check passed with ownership columns.
- Server TypeScript: passed.
- Focused owner/session/deletion/platform identity suite: 4 files, 13 tests
  passed.
- Complete server suite: 68 files, 230 tests passed, including finance, stock,
  tenant isolation, authentication, MFA, recovery, billing, imports, audit and
  rollback paths.
- Web TypeScript, accessibility negative scanner, 236-token design-system
  conformance, 11 shell tests, 3 invoice-PDF tests and production build passed.
- `git diff --check`: passed.

## Security and abuse review

- A mutable or renamed role cannot remove or grant principal-owner authority.
- An ownership row cannot reference a user from another tenant.
- One user cannot own multiple tenants and one tenant cannot have multiple
  ownership rows.
- New ownership is not client-selectable and no transfer/mutation API exists.
- Migration refuses zero/multiple legacy candidates instead of guessing.
- Ownership stores identifiers/timestamps only; no credential, MFA, device,
  financial or business-record content is added.
- The existing role permission array remains independent, least-privilege
  middleware remains server-side and platform administrators gain no tenant
  scope.

## Finance and product invariants preserved

No journal, tax, currency, stock, billing, invoice, number, report or document
behaviour changed. Owner-approved deletion retains its existing history,
reason, audit and tenant rules. No accounting or stock event is created by this
mission.

## Remaining limits

Controlled ownership transfer/recovery, co-owner policy, step-up for selected
owner actions, refresh-token rotation, bounded activity export and richer
security filters remain separate work. This is not a legal/shareholding claim,
security certification or penetration-test result.

## Release evidence

P9-009 is stacked on safely published P6-012 through P6-008 branches. Production
preflight, backup review, migration application, remote CI, ordered merge,
deployment and explicit owner/non-owner live smoke evidence remain mandatory.
The branch must not be described as live until every gate passes.
