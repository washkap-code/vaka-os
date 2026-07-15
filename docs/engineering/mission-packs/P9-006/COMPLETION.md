# P9-006 — Completion report

**Branch:** `codex/p9-006-ci-security`
**Status:** Implementation complete; local static checks passed; first GitHub
Actions run pending.

## Files created

| File | Change |
| --- | --- |
| `.github/workflows/security.yml` | Per-workspace dependency audit and typecheck matrix, Gitleaks scan, and CycloneDX SBOM artifact generation |
| `.github/workflows/codeql.yml` | CodeQL advanced setup for JavaScript and TypeScript |
| `docs/engineering/mission-packs/P9-006/README.md` | Mission definition, controls, failure behaviour and rollback |
| `docs/engineering/mission-packs/P9-006/COMPLETION.md` | Verification and delivery evidence |

No `.gitleaks.toml` was added. The workflow intentionally uses the Gitleaks
default configuration, and no reviewed false positive justified an allowlist.

## Workflow checks

Both workflows run on every pull request and push to `main`.

- Server and web are installed independently from their committed lockfiles
  with lifecycle scripts disabled.
- `npm audit --workspaces=false --audit-level=high` fails on high or critical
  vulnerabilities in either workspace.
- `npm run typecheck` runs in both workspaces.
- Gitleaks scans checked-out Git history with its default rules.
- CodeQL analyses `javascript-typescript` in build mode `none` and uploads code
  scanning results.
- Anchore generates `cyclonedx-json` and uploads
  `vaka-source-sbom-<commit>.cdx.json` for 30 days.

Neither new workflow defines PostgreSQL, `DATABASE_URL`, schema preparation,
seeding, Drizzle execution or any test command.

## Local verification

- Server typecheck: passed.
- Web typecheck: passed.
- Server dependency audit: exited successfully at the high threshold; reported
  four moderate `esbuild`-chain findings and no high or critical finding.
- Web dependency audit: passed with zero vulnerabilities.
- Both workflow files parsed successfully as YAML.
- Scan for database and test commands in the new workflows: no matches.
- `git diff --check`: passed for mission files.

## Verification pending in GitHub

- Gitleaks action execution and any organisation-level `GITLEAKS_LICENSE`
  requirement.
- CodeQL result upload; the repository must have code scanning available.
- Anchore/Syft SBOM generation and GitHub artifact retention.
- Clean `npm ci` on GitHub's Ubuntu runner.

No workspace dependency, manifest, lockfile, application, migration or
production database change was made.
