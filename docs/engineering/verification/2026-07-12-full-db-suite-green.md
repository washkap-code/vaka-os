# Verification Evidence — Full DB-backed suite is GREEN

**Date:** 2026-07-12
**Branch verified:** `codex/vaka-architecture-freeze-admin`
**Verifier:** VAKA Architecture Office (Cowork)
**Outcome:** ✅ Typecheck clean · **50 test files / 156 tests pass** · 0 real failures

## Why this document exists

Prior runs (Codex sandbox and the Cowork sandbox's default) reported ~34
failures. Those were **environment failures, not code defects**:

- `connect EPERM 127.0.0.1:5432` — no PostgreSQL reachable
- `listen EPERM 0.0.0.0` — the sandbox blocked port binding
- `Unknown plan: Growth` — the `plans` reference data was not seeded because the
  CI seed step (`node --import tsx src/seed.ts`) had not been run

This run reproduced the CI procedure in a Linux workspace that **can** bind
localhost and run a real database, proving the branch is green.

## Environment

- Userland PostgreSQL 16 via `embedded-postgres` (linux-arm64), TCP on
  `127.0.0.1:5433`, database `vaka_test`.
- Fresh `npm install` of `server/` inside Linux (the mounted `node_modules` were
  macOS-native — esbuild/rolldown mismatch — so a clean install was required).
- `NODE_ENV=test`, `DATABASE_URL=postgresql://…/vaka_test`,
  `PLATFORM_ADMIN_PASSWORD` set.

## Procedure (matches `.github/workflows/quality.yml`)

1. `npm run test:db:prepare` → guard passed, `drizzle-kit push --force` applied
   the schema, finance integrity controls applied. **Exit 0.**
2. `node --import tsx src/seed.ts` → seeded plans + platform admin. **Exit 0.**
   *(This step was the missing piece in the earlier failing runs.)*
3. `npx vitest run --fileParallelism=false` across the whole suite, executed in
   groups (the sandbox reaps background processes between calls, so each group
   restarted the Postgres process against the persistent data dir).

## Results

| Group | Files | Tests | Result |
|---|---:|---:|---|
| `tests/finance/` | 9 | 19 | ✅ pass |
| `src/platform/**` | 16 | 43 | ✅ pass |
| imports / bank / capture | 7 | 12 | ✅ pass |
| integration (critical, business-summary, settings, sessions, …) | 8 | 34 | ✅ pass |
| platform-admin / ai / referrals / security / config | 10 | 48 | ✅ pass |
| **Total** | **50** | **156** | **✅ all pass** |

`npx tsc --noEmit` (server): **exit 0**. Web typecheck + build previously green.

## Conclusion

The `codex/vaka-architecture-freeze-admin` branch is **code-complete and green**.
The remaining blockers to merge are operational, not technical:

1. **Run the seed step in CI/verification** — always run `src/seed.ts` after
   `test:db:prepare`. Consider folding it into `test:db:prepare` so no future
   run repeats the "Unknown plan" false failure.
2. **PR/merge** — was blocked by Codex GitHub auth + usage limit (until
   2026-07-18). Merge can be done via GitHub Desktop (verified working) whenever
   ready; this branch merges cleanly on top of the pushed `main`.

No source changes were required to reach green; this is verification only.
