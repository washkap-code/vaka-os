# P9-009 — Explicit Tenant Ownership Foundation

**Status:** Approved for implementation
**Programme:** 9 — Security, assurance and platform operations
**Type:** Identity security hardening, additive schema migration and authority correction
**Depends on:** P1-002 identity/audit adapters; P9-008 account security; P3-004 owner-approved deletion; USER-SESSION-ACTIVITY-SPEC

## Outcome

Every tenant has exactly one explicitly recorded accountable principal owner,
and owner-only server authority is derived from that tenant-scoped identity
record rather than the mutable display name of a role. New workspaces establish
ownership atomically; existing workspaces migrate only when one unambiguous
legacy Owner exists.

This mission closes an identified security-foundation gap. It does not add
ownership transfer, delegation, impersonation, support access or a claim of
security certification.

## Current behaviour and risk

- `isTenantOwner` is currently inferred from `role.name === "Owner"` during
  authentication.
- Owner-only user/session visibility, user administration and contact-deletion
  approval therefore depend on a mutable role label rather than explicit
  accountable identity.
- The user/session specification requires explicit ownership and says ordinary
  Administrators must not inherit it through broad permissions.

## Target behaviour

1. Add one `tenant_ownerships` record per tenant, with one unique owner user.
2. Enforce at the database boundary that the owner user belongs to the same
   tenant.
3. Establish ownership inside the existing all-or-nothing signup transaction
   and record a privacy-minimised audit event.
4. Derive authenticated `isTenantOwner` only from the explicit ownership row;
   role permissions remain independent and unchanged.
5. Prevent disabling the explicit owner even if a role name changes.
6. Backfill only tenants with exactly one legacy user assigned the system
   `Owner` role; abort migration on zero or multiple candidates rather than
   silently selecting one.
7. Extend runtime-schema readiness and security/tenant tests.

## User, business problem and measurable result

- **User:** The accountable company owner and every user whose authority must
  not be confused with ownership.
- **Problem:** Mutable role naming is too weak a control for principal-owner
  security, deletion approval and company-wide session/activity visibility.
- **Result:** Owner authority remains stable if role labels change and cannot be
  obtained by renaming or assigning an ordinary role.
- **Measure:** Signup always creates one matching ownership row; owner-only
  endpoints allow the explicit owner and deny role-name lookalikes; cross-
  tenant owner references fail; owner disable fails; full server suite passes.

## Authority, tenant, audit and data protection

- Authentication still derives user and tenant from verified server context.
- `tenant_ownerships.tenant_id` is unique/primary; `owner_user_id` is unique;
  a composite foreign key enforces matching user tenancy.
- The ownership row contains identifiers and timestamps only—no passwords,
  tokens, MFA secrets, device data or business records.
- Signup records `security.tenant_ownership_established`; backfill records a
  migration-source audit event without exposing credentials.
- No client-supplied tenant or ownership identity is trusted.
- No ordinary API permits ownership insert, update, delete or transfer.

## Failure, migration and operational behaviour

- Signup remains atomic: tenant, roles, user, ownership, accounts, warehouse,
  subscription and audit all commit or roll back together.
- Migration performs an ambiguity preflight and raises an exception if any
  existing tenant lacks exactly one legacy Owner candidate.
- Migration is additive and idempotent. Runtime deployment must not precede
  schema readiness.
- Production preflight, backup review, migration application, remote tests,
  staged deployment and live owner/non-owner smoke checks remain release gates.

## Finance and domain invariants

- No accounting, journal, tax, currency, stock, billing, numbering or document
  behaviour changes.
- Owner-only contact deletion approval retains its existing soft-delete/history
  preservation and audit rules; only the source of owner authority changes.
- Posted finance and stock history remains append-only and reversal-only.

## Finance Readiness Questions

1. **Accounting event:** None.
2. **Journal:** None.
3. **Legal entity:** Tenant ownership is an accountable workspace identity, not legal-entity ownership or a statutory shareholding claim.
4. **Currency:** Not applicable.
5. **Tax:** Not applicable.
6. **Audit:** Ownership establishment is recorded; existing owner actions retain audit.
7. **Reversal:** Ownership transfer/recovery is not implemented in this mission.
8. **Explanation:** `/me` retains an explicit owner boolean derived server-side.
9. **AI:** No AI is involved.
10. **Permission:** Ownership is an identity invariant, independent of broad role permission arrays.

## Localisation, mobile and accessibility

No new user-facing workflow or copy is added. Existing English, ChiShona,
isiNdebele, mobile and accessibility gaps are unchanged. API error copy remains
safe and localisation-ready work stays separately governed.

## Scope

- Additive ownership table and migration/backfill.
- Atomic signup ownership establishment and audit.
- Authentication and owner-disable authority resolution.
- Runtime-schema check, focused security/tenant tests and current-state docs.

## Out of scope

- Ownership transfer, co-owners, succession/recovery, delegated Security Owner,
  invitations, role editor, step-up changes, refresh-token rotation,
  impersonation or support grants.
- Legal/shareholding/beneficial-ownership claims.
- UI redesign, APIs for ownership mutation, production data repair, database
  cutover or dedicated-database migration.

## Acceptance criteria

- Mission Pack is committed before implementation.
- Schema and migration enforce one owner per tenant, one tenant per owner and
  same-tenant membership.
- New signup creates ownership and audit atomically.
- Owner role renaming does not remove authority; a non-owner role named Owner
  does not gain authority; cross-tenant references and owner disable fail.
- Runtime schema, server typecheck, focused negative/security tests, complete
  227+ server suite, web regressions, migration review and `git diff --check`
  pass before remote release gates.

## Rollback

Code may temporarily return to legacy role-name resolution only through an
explicit emergency rollback reviewed as a security regression. The additive
ownership table and audit evidence should remain until a controlled migration
rollback is approved; do not destructively drop accountable identity evidence
as an automatic application rollback.
