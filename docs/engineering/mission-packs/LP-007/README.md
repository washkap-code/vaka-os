# LP-007 — Full DB-Backed Suite: Run Green on Production-Like Database

**Branch:** `test/full-suite-green`

**Priority:** Critical — final engineering gate before staging acceptance.

**Prerequisite:** LP-001 through LP-006 merged (satisfied 2026-07-18).

## Objective

Run the entire test suite — every DB-backed integration test, the
tenant-isolation suite (LP-002) and the backup round trip (LP-006) — against a
PostgreSQL database of the same major version as production, fix every
failure, and make the whole thing a single documented, CI-enforced command.

## The single command

```bash
# from the repository root
npm run test:full
# or inside server/
npm run test:full
```

`test:full` chains, in order:

1. `test:db:migrations` — replays the complete migration chain
   (`0000`–`0047`) into the target database and fails on any structural drift
   against the current Drizzle model (LP-001 gate).
2. Reference-data seed (`src/seed.ts`).
3. The entire vitest suite (`npm run test`) with `--fileParallelism=false` —
   all DB-backed integration tests enabled, no mocked-DB shortcuts.

### Requirements for a local run

- A **fresh, empty** PostgreSQL **17.x** database (production major —
  `vaka-os-prod` runs PostgreSQL 17.x). The migration-chain verifier asserts
  the target is empty and refuses production-looking URLs.
- Environment: `DATABASE_URL`, `JWT_SECRET`, `CAPTURE_ENCRYPTION_KEY`,
  `MFA_ENCRYPTION_KEY`, `PAYNOW_ENCRYPTION_KEY`, `PLATFORM_ADMIN_PASSWORD`,
  `NODE_ENV=test` (see `.github/workflows/quality.yml` for the CI reference
  values).

## CI enforcement

`.github/workflows/quality.yml` (required on every PR and `main` push):

- Both jobs' service containers are pinned to `postgres:17` — the production
  major. CI must not drift from the production major again (it previously ran
  `postgres:16`).
- The `verify` job runs `npm run test:full` as one step, followed by the
  LP-006 backup round trip, typecheck, conformance scanners and the web build.
- The `tenant-isolation` job independently replays migrations and runs the
  LP-002 isolation suite; it is the branch-protection-required check.

## Skipped-test audit (task 5)

There are **no** `.skip`, `.todo`, `xit` or `xdescribe` tests. Four
`it.skipIf(!PLATFORM_ADMIN_PASSWORD)` / `describe.skipIf(!seedDir)` guards
exist (`platform-admin-analytics`, `blackbook` ×2, `feature-flags`); they are
local-convenience guards only — in CI the guarded environment is always
provided, so all of them execute. No test is ever skipped in CI.
