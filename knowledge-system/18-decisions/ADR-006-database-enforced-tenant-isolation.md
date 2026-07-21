# ADR-006 — Database-enforced tenant isolation (RLS Option A) as defence-in-depth

**Status:** Proposed
**Date:** 2026-07-20
**Owner:** Dr. Washington Kapapiro

## Context

VAKA OS enforces tenant isolation in the **application layer**: every tenant-scoped
query filters by `tenant_id`, and correctness is guarded by the LP-002 tenant-isolation
regression suite (a manifest of ~240 HTTP endpoints with a launch gate, per
`docs/engineering/mission-packs/LP-002/`). Row Level Security (RLS) is currently
**disabled** on all public tables in `vaka-os-prod`.

A 2026-07-20 security review (Cowork) confirmed the practical consequence: because
RLS is off, the Supabase `anon`/`authenticated` roles reachable with the public
anon key can read/write every table directly, *bypassing the application layer
entirely*. The application-layer manifest protects the API surface, but it does not
protect the database if the anon key is ever used against PostgREST. Additionally,
application-layer isolation has a structural weakness: a single query that omits its
`tenant_id` predicate leaks cross-tenant data, and nothing at the database stops it.

The platform uses **custom authentication** (own `users`/`user_sessions`, no Supabase
Auth), so `auth.uid()`-based RLS (the Supabase default pattern) does not apply. The
backend reaches Postgres over a privileged/direct connection that bypasses RLS.

This ADR records the decision on whether — and how — to add database-enforced
tenant isolation on top of the existing application-layer model.

## Decision

Adopt **RLS Option A**: enable RLS on all tenant-scoped tables and enforce isolation
through a session variable set per request. A dedicated non-privileged Postgres role
(`vaka_app`) carries tenant request traffic and sets `app.current_tenant` (and
`app.current_user_id`) via transaction-local `set_config(...)`; RLS policies read
`current_setting('app.current_tenant')`. Admin/system/migration paths continue on the
existing privileged (BYPASSRLS) connection. This is **additive defence-in-depth**: it
does not replace the LP-002 application-layer manifest, it backstops it.

Rollout is staged and low-risk:
1. Apply RLS enablement + policies (safe: policies are scoped `TO vaka_app`; the
   current privileged backend is unaffected, and the anon-key exposure closes
   immediately because those roles get no policy).
2. Cut tenant request handling over to the `vaka_app` role, activating enforcement.

Reference implementation and the staged runbook are staged in the owner's Cowork
outputs (`vaka-support-system/13-RLS-optionA-app-current-tenant.sql`,
`14-RLS-optionA-backend-integration.md`, `09-RLS-FIX-RUNBOOK.md`). If accepted, this
becomes a mission (reserve the next free migration for the policy DDL) with the
standard hosted-gate verification, including a new RLS-isolation test alongside the
existing LP-002 suite.

## Alternatives considered

- **Keep application-layer only (status quo).** Rejected as the sole control: it
  leaves the anon-key database exposure open and offers no backstop against a query
  that forgets its tenant predicate. (The RLS enablement half of Option A is worth
  doing regardless, purely to close the anon exposure — see ADR consequence below.)
- **RLS keyed on `auth.uid()` (Supabase default).** Rejected: VAKA does not use
  Supabase Auth, so `auth.uid()` is always NULL and such policies would deny the
  `authenticated` role wholesale while doing nothing useful.
- **Enable RLS with zero policies only (Phase 1).** This closes the anon exposure
  with zero app change and is the minimum viable fix. It does **not** add
  per-tenant DB enforcement (the backend still bypasses via its privileged role).
  Retained as the fallback if Option A's connection cutover is deferred.
- **Force-tenant via a Postgres role per tenant.** Rejected: role explosion and
  connection-pool complexity at multi-tenant scale.

## Consequences

Easier:
- Cross-tenant leakage becomes structurally hard — a forgotten `WHERE tenant_id`
  no longer leaks, because the database filters.
- The anon-key exposure is closed.
- Strengthens the cyber-insurance posture (access-control/least-privilege controls).

Harder / must change:
- Every tenant request must run through a `withTenant()` wrapper that opens a
  transaction and sets the session variable (documented Drizzle adapter in
  `16-BACKEND-STACK-AND-INTEGRATION.md`). Small but pervasive change to request
  handling.
- **New governance rule:** every new tenant-scoped table must ship an RLS policy or
  it fails closed under `vaka_app`. Add "RLS policy present" to the definition of
  done for new tables (complements the LP-002 manifest rule).
- Connection topology: a second (`vaka_app`) connection path plus the existing
  privileged path; care needed with transaction-pooled connections (use
  `set_config(..., true)` / `SET LOCAL`, never a session `SET`, to prevent
  cross-request leakage).
- One migration for the policy DDL (reserve next free number at implementation time).

## Rollback

Fully reversible. Per table: `ALTER TABLE public.<t> DISABLE ROW LEVEL SECURITY;`
or drop the `vaka_app` policies; revert tenant request handling to the privileged
connection. Because Option A is applied staged and the policies are scoped
`TO vaka_app`, the privileged backend continues working throughout, so rollback
carries no data risk. Cost is limited to reverting the connection-role change and
the DDL.
