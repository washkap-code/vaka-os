# LP-002 — Automated tenant-isolation regression suite

**Status:** Complete; all pull request checks green  
**Branch:** `test/tenant-isolation-suite`  
**Pull request:** #88 (`test/tenant-isolation-suite` → `main`)  
**Completed:** 2026-07-16  
**Migrations:** None

## Files created

- `server/tests/tenant-isolation-endpoint-manifest.ts`
- `server/tests/tenant-isolation-regression.test.ts`
- `docs/engineering/mission-packs/LP-002/COMPLETION.md`

## Files modified

- `.github/workflows/quality.yml`
- `server/package.json`
- `server/src/auth.ts`
- `server/src/migration-accounting.ts`
- `server/src/routes.ts`
- `docs/engineering/SESSION-HANDOFF.md`

## Endpoint coverage

| Access class | Endpoints | Control |
| --- | ---: | --- |
| Tenant-authenticated | 199 | Tenant fixtures, list/search/filter checks, direct-object probes, foreign-key rejection, aggregate assertions and database ownership pass |
| Shared authenticated | 7 | Explicit projection tests and documented justification per endpoint |
| Platform-only | 24 | Every endpoint rejects a tenant user before route processing |
| Public/unauthenticated | 10 | Explicit allow-list with a justification per endpoint |
| **Total** | **240** | **240 manifested and covered** |

The suite parses the Express registrations at test time and compares the exact
method/path set with the maintained manifest. A new or removed endpoint fails
CI until its isolation vector or public justification is added. Every one of
the 230 authenticated endpoints is also exercised without credentials; all
must return `401`.

### Public allow-list

1. `GET /health` — liveness only; no tenant data.
2. `POST /api/v1/auth/signup` — creates the first tenant context.
3. `POST /api/v1/auth/login` — credential exchange.
4. `POST /api/v1/auth/refresh` — refresh-token exchange.
5. `POST /api/v1/auth/password-reset/request` — pre-authentication recovery.
6. `POST /api/v1/auth/password-reset/complete` — single-use reset completion.
7. `POST /api/v1/auth/mfa/verify-login` — completes the pre-session MFA challenge.
8. `GET /api/v1/public/invoices/:token/pdf` — capability-token document view.
9. `GET /api/v1/public/workspaces/:subdomain/holding` — published holding-page projection.
10. `POST /api/v1/public/payments/paynow/result` — provider callback with provider-payload verification.

The seven authenticated shared exceptions are Black Book list/detail, the
published business-directory list/detail/enquiry, the payment-provider
availability view, and the plan catalogue. Each has a manifest justification.
The directory tests prove that tenant IDs, contact details not opted into the
published snapshot, and post-publication draft edits are not disclosed.

## Isolation defects found and fixed

| # | Defect | Exposure | Minimal repair | Regression proof |
| ---: | --- | --- | --- | --- |
| 1 | A validly signed access token was accepted when its `tenantId` claim was absent or differed from the authenticated user's stored tenant. | Tenant context was derived from the user, so no direct leak was reproduced, but token/identity disagreement was not rejected as required. | Require a string subject, require the tenant claim to exist, and compare it exactly with the current user row before resolving permissions or tenant state. | Absent and forged cross-tenant claims now return generic `401` responses. |
| 2 | Tenant override attempts in `X-Tenant-Id`, top-level query data, or top-level request bodies were silently ignored. | No data leak was reproduced because server context remained authoritative, but tampering was not fail-closed and could hide unsafe future handler assumptions. | Reject the header with `403`; reject query/body overrides with `400`, preserving established route-validation behavior. Platform users remain unaffected. | Header, query, body and platform path-param tampering are all rejected without Tenant B identifiers or content in the response. |
| 3 | Role lookup used only the global role UUID and did not also require the role's tenant to match the user. | A corrupted or incorrectly assigned cross-tenant `roleId` could grant permissions from another tenant's role. No API path that creates this corruption was found. | Scope role resolution by both `role.id` and `role.tenantId`; a mismatch yields no permissions. | The suite deliberately assigns Tenant B's Owner role to Tenant A's user and proves the request fails `403`, then restores the fixture. |
| 4 | `POST /deals` accepted any existing contact UUID without verifying tenant ownership. | Tenant A could create a deal whose foreign key pointed to Tenant B's contact, creating a cross-tenant integrity edge and exposing the foreign identifier in Tenant A's deal data. | Validate the contact inside the same transaction by ID, tenant and non-deleted state before inserting the deal. | Cross-tenant deal creation returns generic `404`; the Tenant A deal count and all stored contact references remain unchanged. |
| 5 | Migration-project reconciliation returned `400` for an unknown or foreign project while the rest of the object surface uses generic `404`. | No content leak was reproduced, but the cross-tenant failure mode was inconsistent. | Change only the missing-project error from `badRequest` to `notFound`. | Cross-tenant reconciliation now returns generic `404` with no project content. |

No defect required a schema change, migration, destructive operation, or API
contract change for legitimate same-tenant requests.

## Test infrastructure and behavior covered

The fixture provisions two complete, feature-enabled tenants through supported
APIs. Each owns a user, customer, supplier, product, warehouse, deal, issued
invoice, payment, journal postings, invoice share link, document folder and
document, task, bank account, capture, migration project and business profile.
Tenant A and Tenant B use deliberately different financial values and private
markers.

The suite covers:

- unauthenticated denial for every protected endpoint and tenant-user denial
  for every platform endpoint;
- GET, POST, PUT, PATCH and DELETE direct-object attempts with Tenant B IDs;
- list, search, filter and limited/paginated responses across CRM, inventory,
  procurement, accounting, workflow, documents, payroll, migration and billing;
- cross-tenant foreign keys for deals, activities, invoices, opening stock,
  tasks and document folders;
- exact Tenant A-only trial-balance, profit-and-loss, dashboard and receivable
  values;
- generic `403`/`404` object denials that contain none of Tenant B's IDs or
  private marker values;
- every table with a `tenant_id` having a real tenant owner, plus every
  tenant-to-tenant foreign key having matching ownership. The intentional
  directory-enquiry sender relationship is checked against `from_tenant_id`
  rather than the recipient's `tenant_id`.

## CI control

The quality workflow now has a dedicated check named **Tenant isolation
regression**. On every pull request and push to `main`, it creates a fresh
PostgreSQL service, replays and drift-checks all migrations, seeds standard
reference data, and runs `npm run test:tenant-isolation`. The existing full
server suite also discovers the test normally; it was not excluded or weakened.
GitHub branch protection on `main` now requires the **Tenant isolation
regression** context with strict up-to-date-branch checking. No review rule,
admin enforcement or repository restriction was added.

## Tests executed

- Fresh local migration replay `0000` through `0045`: passed transactionally
  with zero manual steps and zero structural drift.
- `npm run test:tenant-isolation`: **13/13 passed**.
- Complete server suite on a fresh database with CI-equivalent environment:
  **94 files / 430 tests passed** at the existing 15-second timeout.
- Server typecheck: passed.
- Web typecheck: passed.
- Runtime schema check with enabled gated features: passed.
- Web production build: passed. The existing large-chunk warning remains; the
  build completed successfully.
- `git diff --check`: passed.
- GitHub quality run `29489585340`: dedicated tenant-isolation job passed in
  39 seconds; full type/build/conformance/migration/test/AI job passed in
  4 minutes 12 seconds.
- GitHub CodeQL JavaScript/TypeScript analysis: passed.
- Server and web high/critical dependency audit and typecheck gates: passed.
- Gitleaks: passed with no leak finding.
- CycloneDX SBOM generation and artifact upload: passed.
- Vercel preview deployment and preview comments: passed.

An earlier diagnostic full-suite pass used a repeatedly seeded database and
reported one timeout plus two fixture/validation failures. The affected files
were rerun independently, the validation compatibility was corrected, and the
decisive clean-database full pass above completed with all 430 tests green.

## Remaining risks and human decisions

1. The manifest recognises the repository's current route-registration style
   (`api.get/post/put/patch/delete` with literal paths plus `/health`). A future
   router abstraction must update the discovery logic in the same change.
2. The suite proves application-level and relational tenant ownership against
   PostgreSQL. It does not replace production RLS review, secret protection,
   or the planned CORS/configuration hardening in LP-003.
3. The required-check setting is external GitHub repository state rather than
   a versioned file. Repository administrators must preserve **Tenant isolation
   regression** when changing branch rules in future.
4. No migration number was taken. The next free migration remains `0046`.
5. No human decision is required to merge this test-only mission once all PR
   checks are green.

## Recommended next mission

Merge PR #88 as LP-002's single programme merge, then proceed to **LP-003 —
CORS and Configuration Hardening**. The quality, security, CodeQL and Vercel
checks are green and the branch-protection context is confirmed.
