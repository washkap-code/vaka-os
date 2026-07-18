# LP-007 — Completion report

**Status:** COMPLETE — merged to `main` via PR #95 (`77b1822`), all hosted
gates green. Delivered 2026-07-18.

**Commits:** `b83ae1e` (PG-17 pin + `test:full` + CI wiring + skip audit) and
`b70263a` (PR #95 — postgresql-client-17 in CI).

## What changed

1. **Production-major pin (task 1):** both quality-gate service containers
   moved `postgres:16` → `postgres:17`, matching the dedicated `vaka-os-prod`
   project (PostgreSQL 17.x). The pin is documented in the workflow.
2. **Single command (task 6):** `npm run test:full` (root and `server/`) =
   migration-chain replay with schema-drift verification → reference-data
   seed → the entire vitest suite. The CI `verify` job runs it as one step;
   the LP-006 backup round trip, typecheck, conformance scanners and web
   build follow in the same job. The branch-protection-required
   `Tenant isolation regression` job independently replays migrations and
   runs the LP-002 suite on the same pinned major.

## Failure triage (tasks 2–3)

Initial run on the pinned major surfaced **one environment/config defect and
zero product or test defects**: the ubuntu-latest runner preinstalls
`pg_dump` 16, which aborts with "server version mismatch" against the
postgres:17 service, failing the LP-006 backup round trip. Fixed in PR #95 by
installing `postgresql-client-17` from PGDG and prepending
`/usr/lib/postgresql/17/bin` to `PATH`.

(For completeness: the immediately preceding PV-002 merge lane had already
fixed, under hosted gates, one product-adjacent defect — schema drift from
`uniqueIndex()` composite-FK targets, resolved as UNIQUE constraints — and one
test defect — composite-FK column cross-multiplication in the isolation
suite's introspection. Both fixes are on `main` and exercised by `test:full`.)

## Flakiness (task 4)

No intermittent failures were observed across the four hosted runs executed
during this mission (two PR runs each for #94 and #95 plus the `main` push
runs). No retries are configured anywhere in the workflow.

## Skipped-test audit (task 5)

Zero `.skip` / `.todo` / `xit` / `xdescribe` tests. Four environment-guarded
tests (`it.skipIf(!PLATFORM_ADMIN_PASSWORD)` in platform-admin-analytics,
blackbook ×2, feature-flags; `describe.skipIf(!seedDir)` for the real
Zimbabwe seed dataset) exist as local-convenience guards only; CI always
provides the guarded environment, so every one of them executes in CI.

## Results (task 7)

Evidence: PR #95 run — all 11 checks green on `postgres:17`, including
`Type, build, tests, and AI foundations` (full `test:full` + backup round
trip, ~5 min) and `Tenant isolation regression` (~39 s):
<https://github.com/washkap-code/vaka-os/actions/runs/29636748713>

## Readiness statement

**Engineering gates for pilot are met.** The complete DB-backed suite runs
green on the production PostgreSQL major, via one documented command, enforced
by CI on every pull request and `main` push. Remaining launch items are
operational and human (LP-006 operator drill, monitoring/alerts, accountant
and legal sign-off, staging acceptance, controlled onboarding) — none are
diffs in this repository.

## Process note

The first LP-007 commit (`b83ae1e`) reached `main` by direct push: the work
branch had inherited `origin/main` as its upstream and GitHub Desktop pushed
there. The subsequent `main`-push CI run validated it (and exposed the
pg_dump defect, fixed via proper PR #95). Future branches created from
`origin/main` must set their upstream to their own name before pushing —
`git config branch.<name>.merge refs/heads/<name>` — as PR #95's branch did.
