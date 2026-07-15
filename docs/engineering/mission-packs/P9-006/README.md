# P9-006 — CI security scanning and software bill of materials

**Status:** Approved for implementation  
**Priority:** P0 production hardening  
**Authority:** VAKA Constitution; VAKA Coding Standards; repository `AGENTS.md`

## Outcome

Prevent high-risk dependency and source-security regressions from reaching
`main`, and produce a reviewable CycloneDX inventory of software components for
every pull request and push to `main`.

Success means:

- the server and web lockfiles are audited independently and high or critical
  findings fail the workflow;
- both TypeScript workspaces pass their existing `typecheck` scripts;
- Gitleaks scans the Git history selected for the workflow event using its
  default rules;
- CodeQL analyses JavaScript and TypeScript and uploads results to GitHub code
  scanning; and
- a CycloneDX JSON SBOM covering the repository is retained as a workflow
  artifact.

## User and business problem

**User:** VAKA engineering, security reviewers, release owners and incident
responders.

**Problem:** dependency vulnerabilities, committed credentials and unsafe
source patterns can otherwise enter review without a consistent automated
gate. Responders also lack a reproducible component inventory when assessing a
new vulnerability.

**Measurable result:** the new workflows are valid, contain the required
pull-request and `main` push triggers, fail at the requested audit threshold,
run both workspace typechecks, contain no database-backed test step, and define
an uploaded CycloneDX artifact.

## Scope

1. Add a security workflow with per-workspace clean installation, dependency
   audit and typecheck jobs.
2. Add Gitleaks with full checkout history and the default ruleset.
3. Add CycloneDX JSON SBOM generation through Anchore's SBOM action and retain
   the result as a build artifact.
4. Add a separate CodeQL advanced-setup workflow for
   `javascript-typescript` in build mode `none`.
5. Trigger both workflows on pull requests and pushes to `main`.
6. Grant only the workflow permissions required for checkout and CodeQL result
   upload.

## Deliberate exclusions

- PostgreSQL services, schema preparation, seeding and DB-backed tests.
- Changes to application code, workspace manifests or lockfiles.
- Runtime/container image scanning and deployment changes.
- Automatic dependency upgrades or vulnerability remediation.
- Repository, organisation or GitHub Advanced Security configuration.

## Security and operational rules

- `npm audit --audit-level=high` is run separately from each committed
  workspace lockfile, so high and critical findings fail while lower severities
  remain visible.
- Dependency lifecycle scripts are not executed during CI installation.
- Secret findings are never allowlisted without a narrow, reviewed false-
  positive justification. No allowlist is created by default.
- The Gitleaks action may require a `GITLEAKS_LICENSE` repository secret when
  VAKA is hosted by a GitHub organisation; no credential is committed.
- CodeQL receives `security-events: write`; other jobs remain read-only.
- The SBOM is evidence, not proof that every component is safe or licensed for
  use. Findings still require triage.

## Failure behaviour

- A high/critical audit finding, secret finding, type error or CodeQL workflow
  failure blocks its required status check.
- The two workspace matrix legs continue independently so both results are
  visible.
- Missing external GitHub entitlements or Gitleaks licensing fail visibly and
  must be resolved in repository settings; they must not be bypassed in code.
- SBOM generation or artifact upload failure fails the SBOM job.

## Verification

- inspect triggers, permissions and action inputs;
- parse both workflow files as YAML;
- run server and web typechecks without invoking tests;
- run `git diff --check`;
- confirm no `npm test`, database service, schema preparation or seed command
  exists in either new workflow; and
- verify the final diff contains only mission-authorised paths.

## Rollback

Revert the two new workflow files and this mission pack. Workflow runs and
uploaded artifacts already retained by GitHub remain historical evidence under
repository retention policy.
