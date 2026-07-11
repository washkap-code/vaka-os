# P1-003 — First call-site migration to kernel services

**Status:** Implemented — verification partial
**Programme:** 1 — Platform
**Type:** Infrastructure (migration, zero behaviour change)
**Depends on:** P1-002 (merged)

## Objective

Prove the kernel path end-to-end by having real code resolve audit through the kernel's `AUDIT_SERVICE` instead of importing the legacy `audit()` helper — starting with one low-risk, well-tested surface. This validates the composition root under real usage while guaranteeing byte-identical audit rows (already proven by P1-002 parity tests).

Scope is deliberately tiny: introduce a **kernel-backed audit facade** that other modules can adopt incrementally, and demonstrate it with a focused test that drives an audit through the kernel and asserts the persisted row shape. No existing route changes behaviour.

## Deliverables

1. `server/src/platform/audit-facade.ts` — `recordAudit(event)` helper that resolves `AUDIT_SERVICE` from the process-wide `platformKernel()` and records. This is the adoption seam for modules.
2. Test proving the facade writes the exact legacy `audit_logs` row shape via an injected writer (composition parity under real resolution).
3. Doc note in `PLATFORM-KERNEL.md` describing the adoption pattern for future modules.

## Forbidden

- Changing `auth.ts`, the `audit()` helper, the `audit_logs` schema, or any route behaviour.
- Migrating multiple modules at once (this mission establishes the seam only).

## Acceptance criteria

- Typecheck + full suite pass; new facade test passes.
- Zero production behaviour change.

The full-suite criterion remains open until the database-backed suite runs in
an approved test database. Focused platform verification has passed; see
`COMPLETION.md` for the exact evidence and environment limitation.

## Rollback

Revert the merge commit; additive only.
