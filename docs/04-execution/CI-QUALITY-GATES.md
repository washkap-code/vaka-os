# VAKA CI Quality Gates

**Status:** Implemented foundation
**Owner:** Engineering and Security
**Last reviewed:** 2026-07-05

## 1. Purpose

The repository CI workflow provides a reproducible baseline for type checking, production build verification, PostgreSQL integration tests, and VAKA AI foundation evidence.

Workflow:

```text
.github/workflows/quality.yml
```

It runs on pull requests and pushes to `main`.

## 2. Environment

- GitHub-hosted Ubuntu runner
- Node.js 22
- PostgreSQL 16 service
- Dedicated test database
- CI-only database credentials
- CI-only JWT secret
- CI-only platform administrator password

These values are not production credentials.

## 3. Dependency installation

Server and web dependencies use their committed lockfiles:

```bash
cd server && npm ci --workspaces=false --ignore-scripts
cd web && npm ci --workspaces=false --ignore-scripts
```

Lifecycle scripts are disabled during installation. Any dependency that later requires an approved installation script must receive an explicit security review.

## 4. Database setup

CI creates a disposable PostgreSQL service for each job.

Current schema setup uses:

```bash
npm run db:push -- --force
```

This is acceptable only for the disposable CI database. Production must use reviewed, versioned migrations. Replacing `db:push` with migration execution remains a repository-health task.

The seed command creates required subscription plans and a CI-only platform administrator.

## 5. Gates

### Type gate

```bash
npm run typecheck
```

Checks server and web TypeScript.

### Build gate

```bash
npm run build
```

Builds the production web application.

### Test gate

```bash
npm test
```

Runs server tests sequentially against PostgreSQL. Sequential file execution prevents global billing/time simulations from racing with other shared-database integration fixtures.

Coverage currently includes:

- financial and stock invariants;
- signup and tenant setup;
- cross-module trade cycle;
- overselling rollback;
- multi-currency posting;
- billing lifecycle;
- tenant isolation;
- business-summary exactness and permissions;
- AI evaluation contracts; and
- evaluation-runner failure behaviour.

## 6. AI evaluation evidence

CI generates JSON and Markdown reports from the provider-independent example candidate.

The example intentionally:

- covers only one scenario;
- has outstanding human review; and
- exits with status `1`.

CI asserts this expected failed release gate. A status of `0` would mean the example unexpectedly became release-ready; status `2` would mean the runner failed.

Reports are retained for 30 days as:

```text
vaka-ai-evaluation-<run-id>
```

This evidence does not approve any model or AI release.

## 7. Security

- Workflow permissions are read-only for repository contents.
- No production secrets or tenant data are used.
- Test data is synthetic and uniquely named per run.
- Provider/model credentials are absent.
- Generated artifacts contain synthetic evaluation content only.
- Jobs have a 20-minute timeout.
- Concurrency cancels superseded runs on the same ref.

## 8. Local commands

Without PostgreSQL:

```bash
npm run typecheck
npm run build
npm run test:ai-evaluation
```

With an appropriately configured PostgreSQL test database:

```bash
cd server
npm run db:push -- --force
node --import tsx src/seed.ts
cd ..
npm test
```

Never point destructive test setup at production or shared client data.

## 9. Known limitations

- CI has not yet run on GitHub; local validation cannot prove hosted runner behaviour.
- Versioned migrations are not yet committed.
- Test cleanup relies primarily on disposable CI infrastructure and unique fixture identifiers.
- No lint or formatting command exists yet.
- No frontend component/E2E test suite exists yet.
- Dependency audit currently reports moderate development-tool findings in the Drizzle/esbuild chain.
- Evaluation artifacts are not signed or persisted beyond the configured retention period.

## 10. Next step

Push the workflow to GitHub and confirm the first run. If PostgreSQL schema creation, seeding, or tests fail in the hosted environment, preserve the logs/artifacts and correct the reproducible setup before adding further AI capability.
