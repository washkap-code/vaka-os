# VAKA Finance Mission 2B - Test Infrastructure

## Purpose

Record the current PostgreSQL test execution requirements and the safety decisions for running Mission 2 finance invariant tests.

## Current Infrastructure Assessment

| Area | Current State | Risk | Decision |
|---|---|---|---|
| Database engine | Application and tests require PostgreSQL through Drizzle ORM and `pg`. | Replacing PostgreSQL with SQLite would not verify production-like constraints, types, or SQL behavior. | Keep PostgreSQL as the only accepted finance test database. |
| Runtime default | `server/src/config.ts` defaults non-production `DATABASE_URL` to `postgresql://jonomi:jonomi_dev@localhost:5432/jonomi_platform`. | Finance tests could accidentally target the development database if `DATABASE_URL` is omitted. | Mission 2 finance tests now run a guard requiring `NODE_ENV=test` and an explicit test-named PostgreSQL `DATABASE_URL`. |
| Drizzle config | `server/drizzle.config.ts` also defaults to the development database when `DATABASE_URL` is absent. | Schema preparation could push to the development database. | Added `npm run test:db:prepare`, which runs the finance database guard before `drizzle-kit push`. |
| Local PostgreSQL | PostgreSQL is now listening on `127.0.0.1:5432` and `[::1]:5432`. The `psql` client still was not visible on PATH, so setup used the Node `pg` driver. | Test execution depends on the local service remaining available. | Use the dedicated `vaka_os_test` database only; rerun guarded prep before finance baseline checks. |
| Homebrew PostgreSQL | Homebrew service discovery did not show a named PostgreSQL service in this shell, even though PostgreSQL is listening locally. | Start/stop automation is environment-specific. | Do not add unproven Homebrew lifecycle commands. |
| Docker PostgreSQL | No `docker` binary or Docker Desktop application was found. | Docker-based test database cannot be started here. | Do not add Docker commands or compose files until Docker is available and verified. |
| Schema preparation | Existing migrations live in `server/drizzle/`; `npm run db:push` uses the current Drizzle schema. | Direct schema push must never run against production or development by accident. | Use `NODE_ENV=test DATABASE_URL=... npm run test:db:prepare` only after the guard passes. |
| Test isolation | Mission 2 finance tests create unique tenant subdomains/emails with a per-run suffix and do not rely on cross-test ordering. | Data can accumulate in the test database across runs. | Accept additive test data for now; add isolated database reset only after a safe PostgreSQL test service is available. |
| Route-level tests | Previous Supertest execution failed with `EPERM listen` in this sandbox, including existing repository tests. | Route-level tenant-isolation verification cannot be forced through HTTP listeners here. | Mission 2 finance tests remain service/database-level. Route-level coverage remains separately blocked by listener restrictions. |

## Safe Commands

Use a clearly test-named PostgreSQL database. The repository includes `server/.env.test.example` as a safe shape, not as live credentials.

```bash
cd server
NODE_ENV=test DATABASE_URL="postgresql://vaka_test:vaka_test@127.0.0.1:5432/vaka_os_test" npm run test:db:guard
NODE_ENV=test DATABASE_URL="postgresql://vaka_test:vaka_test@127.0.0.1:5432/vaka_os_test" npm run test:db:prepare
NODE_ENV=test DATABASE_URL="postgresql://vaka_test:vaka_test@127.0.0.1:5432/vaka_os_test" PLATFORM_ADMIN_PASSWORD="local-test-admin-password-2026" npm run seed
NODE_ENV=test DATABASE_URL="postgresql://vaka_test:vaka_test@127.0.0.1:5432/vaka_os_test" npm run typecheck
NODE_ENV=test DATABASE_URL="postgresql://vaka_test:vaka_test@127.0.0.1:5432/vaka_os_test" npm run test:finance
```

These commands are safe to run only when the referenced PostgreSQL database exists and is dedicated to tests.

## Current Mission 2B Result

Mission 2B infrastructure recovery succeeded after PostgreSQL became available locally. A dedicated test role/database was created, guarded schema preparation passed, seed data was installed, all 17 Mission 2 finance tests passed, the existing accounting-oriented tests passed, and the broader server suite passed.

## Commands Executed In Mission 2B

| Command | Exit Result | Tests Passed | Tests Failed | Tests Skipped | Infrastructure Failures |
|---|---:|---:|---:|---:|---|
| `npm run test:db:guard` | 1 | 0 | 0 | 0 | Guard rejected missing `NODE_ENV=test`, as designed. |
| `NODE_ENV=test DATABASE_URL="postgresql://vaka_test:vaka_test@127.0.0.1:5432/vaka_os_test" npm run test:db:guard` | 0 | 0 | 0 | 0 | None; credentials were masked. |
| Create `vaka_test` role and `vaka_os_test` database through local PostgreSQL admin connection | 0 | 0 | 0 | 0 | None. |
| `NODE_ENV=test DATABASE_URL="postgresql://vaka_test:vaka_test@127.0.0.1:5432/vaka_os_test" npm run test:db:prepare` | 0 | 0 | 0 | 0 | None. |
| `NODE_ENV=test DATABASE_URL="postgresql://vaka_test:vaka_test@127.0.0.1:5432/vaka_os_test" PLATFORM_ADMIN_PASSWORD="local-test-admin-password-2026" npm run seed` | 0 | 0 | 0 | 0 | None. |
| `npm run typecheck` | 0 | 0 | 0 | 0 | None. |
| `NODE_ENV=test DATABASE_URL="postgresql://vaka_test:vaka_test@127.0.0.1:5432/vaka_os_test" npm run test:finance` | 0 | 17 | 0 | 0 | None. |
| Existing accounting-oriented Vitest command | 0 | 17 | 0 | 0 | None. |
| `NODE_ENV=test DATABASE_URL="postgresql://vaka_test:vaka_test@127.0.0.1:5432/vaka_os_test" npm test` | 0 | 86 | 0 | 0 | None. |
