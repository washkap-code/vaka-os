# OPS-010 — Super Admin control centre and in-product user guide

**Status:** Implemented; focused and browser verification passed; full suite environment-blocked
**Programme:** Operations and launch readiness
**Type:** Feature, operations and documentation
**Branch:** Current working branch
**Depends on:** P1-002, architecture-freeze ADRs, Book Twenty-Two

## Objective

Give authorised VAKA platform administrators one safe, truthful control surface for aggregate operating signals, frozen-product and kernel implementation status, tenant review and an in-product operating guide. This mission does not add unrestricted tenant-data access, tenant lifecycle mutation, secret exposure, professional approval, infrastructure automation or a claim that planned capabilities are live.

## Users and outcome

- User: authenticated VAKA platform administrator with no tenant context.
- Problem: the existing console exposes only aggregate analytics and a tenant list, with no consolidated operating state or embedded instructions.
- Outcome: an administrator can understand runtime health, operating risk signals, exact capability status and the approved operating procedure without leaving the console.

## Deliverables

1. A platform-admin-only control-centre API returning privacy-minimised runtime signals, the active Architecture Freeze and truth-preserving product/kernel status.
2. Focused backend tests proving the frozen catalogue is complete and planned products are not described as implemented.
3. Platform Admin navigation for Overview, Tenants, Operations and User Guide.
4. Operations UI with runtime signal cards, capability status and explicit limitations.
5. Searchable in-product guide sourced directly from one comprehensive Markdown file, plus a Markdown download action.
6. Explicit confirmation before the existing global billing-cycle action.
7. Tenant audit review using the existing platform-authorised, read-only endpoint; no new tenant mutation.
8. Documentation, completion evidence and relevant catalogue/status updates.

## Security, privacy and audit boundary

- Every new API route uses server-enforced `requirePlatformAdmin`.
- Runtime signals are aggregate and must not contain passwords, tokens, secrets, routine business records or AI context.
- The control centre must not manufacture a tenant scope for the platform administrator.
- Existing consequential billing behavior remains server-controlled and gains a UI confirmation step; this mission does not alter billing rules.
- Read-only console access does not itself create a new material tenant event. Existing billing and tenant-management write paths retain their audit obligations.

## Mobile and localisation

- Navigation and status tables remain usable at mobile widths.
- New user-facing strings are centralised in the current English catalogue. Complete Shona/Ndebele runtime localisation remains a separately tracked platform gap; this mission must not hard-code market logic.

## Failure behaviour

- If control-centre loading fails, the console shows the error and does not infer healthy status.
- Planned or unverified capability entries remain visibly planned/unverified.
- A cancelled billing confirmation performs no request.

## Forbidden

- Schema changes, finance/tax behavior changes, automatic suspension or deletion.
- Cross-tenant business-record search, impersonation, secret display or unrestricted metadata display.
- Marking backups, disaster recovery, security, professional review or launch gates as passed without evidence.
- Adding a Markdown-rendering dependency or executing guide HTML.

## Acceptance criteria

- Server and web typecheck pass.
- Focused control-centre, platform-runtime, audit-facade and localisation tests pass.
- Web production build passes.
- Platform administrators can open every new tab and search/download the guide.
- Tenant users receive 403 from the control-centre API.
- The frozen product and kernel names appear exactly once in the status catalogue.
- The guide and UI disclose current limitations and consequential-action safeguards.
- Full-suite result is recorded exactly; an environment-blocked suite is not described as passed.

## Rollback plan

Revert the additive API module/route, console tabs, styles and guide. No schema or data migration is involved. Existing analytics, tenant list and billing endpoints remain intact.
