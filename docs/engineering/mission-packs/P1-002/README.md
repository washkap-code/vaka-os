# P1-002 — Identity & Audit Adapters

**Status:** In progress
**Programme:** 1 — Platform
**Type:** Infrastructure (adapters, zero behaviour change)
**Branch:** `feature/p1-002-identity-audit-adapters`
**Depends on:** P1-001 (merged)

## Objective

Bridge the existing authentication (`server/src/auth.ts`) and audit (`server/src/lib.ts#audit`) implementations to the Platform Kernel contracts introduced in P1-001, so future modules consume `IdentityServiceContract` and `AuditServiceContract` instead of reaching into Express request state or the raw `audit()` helper.

**No call sites are migrated in this mission.** Existing routes continue to work unchanged. This mission only introduces the adapters, the composition root, and the tests that prove parity and tenant isolation.

## Deliverables

1. **Identity adapter** — `server/src/platform/identity/adapters/`
   - `identityContextFromAuth(auth)` — pure mapping from the `AuthedRequest.auth` shape (structural type, no Express dependency) to `IdentityContext`.
   - `identityServiceForAuth(auth)` — convenience factory returning an `IdentityService` bound to a request's auth snapshot.

2. **Audit adapter** — `server/src/platform/audit/adapters/`
   - `toAuditLogRow(event)` — pure mapping from `AuditEvent` to the exact row shape the legacy `audit()` helper writes (parity guaranteed by test).
   - `createDrizzleAuditSink(insertRow)` — `AuditSink` implementation that appends via an injected writer, keeping the platform layer free of a hard drizzle/db dependency.

3. **Composition root** — `server/src/platform-runtime.ts`
   - `buildPlatformKernel()` — constructs the kernel, registers `IdentityService` (request-scoped provider hook) and `AuditService` (drizzle sink bound to the app database) under typed service tokens.
   - Exported tokens: `IDENTITY_SERVICE`, `AUDIT_SERVICE`.

4. **Tests**
   - Parity: adapter-produced audit rows are field-for-field identical to what legacy `audit()` writes for the same inputs.
   - Tenant isolation: events without a tenant are rejected; identity contexts without a tenant fail `requireTenant()`; permissions never leak across contexts; platform-admin contexts do not implicitly gain tenant scope.
   - Composition: kernel resolves both services; duplicate registration fails closed.

## Forbidden

- Changing `auth.ts` logic, JWT handling, session handling, or middleware behaviour.
- Changing the `audit()` helper or `audit_logs` schema.
- Migrating any existing call site.
- New runtime dependencies.

## Acceptance criteria

- `npm run typecheck` passes (server and web).
- Full existing test suite passes; new platform tests pass.
- Zero production behaviour change.

## Completion report

See `COMPLETION.md` in this folder after merge.
