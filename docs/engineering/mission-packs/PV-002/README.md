# PV-002 — Business verification workflow

**Status:** Ready for implementation (this pack precedes code, per repository rule)
**Programme:** PV — Verify (Master Build Plan Part II §16, Wave 2)
**Depends on:** PV-001, PW-001, FLAG-001/002, P9-011
**Gate:** T + P (verification policy review remains open before tenant enablement)
**Branch:** `feature/pv-002-verification-workflow`
**Migration:** `0047_verification_workflow.sql` (reserved in the session handoff ledger)

## Outcome and users

Tenant Owners and Administrators can assemble active PV-001 evidence into one
frozen verification request and see a safe, reviewer-anonymous status. VAKA
platform verification staff can review the exact submitted evidence, record a
reasoned decision through the kernel ApprovalService, issue a time-bounded
VERIFIED badge, and revoke it immediately when necessary.

The measurable technical outcome is a complete, tenant-isolated and auditable
state machine whose review input cannot change after submission. The policy
meaning of VERIFIED, minimum evidence sets, reviewer operating procedure and
appeals language remain behind the P-gate and must not be marketed as live.

## Current and target behaviour

- Current (PV-001): tenants can register, renew and withdraw version-pinned
  evidence behind `verify.centre`; no workflow or badge asserts verification.
- Target (PV-002): tenants can create and submit one open request; platform
  staff can claim, approve or reject it and can later revoke an issued badge.
- PV-003 remains responsible for directory/marketplace rendering. PV-002
  exposes only the read model that PV-003 can consume later.

## State machine

`DRAFT → SUBMITTED → IN_REVIEW → APPROVED | REJECTED`, with
`APPROVED → REVOKED` as the only later transition.

- One open request per tenant means at most one row in DRAFT, SUBMITTED or
  IN_REVIEW. A database partial unique index enforces it.
- A DRAFT has no snapshot. Submission requires at least one ACTIVE PV-001
  evidence row and atomically inserts the complete evidence snapshot before
  moving the request to SUBMITTED.
- Starting review and every decision are platform mutations protected by the
  new platform permission and a fresh P9-011 step-up proof.
- APPROVE/REJECT outcomes are produced by the kernel ApprovalService. REVOKE
  uses the same kernel segregation evaluator and records a new decision; no
  previous decision is edited.
- Every transition is enforced in service code and by a database transition
  trigger. Invalid or repeated transitions return conflict without partial
  writes.

## Frozen evidence snapshot (PN-001 precedent)

Submission inserts one immutable `verification_request_evidence_snapshots`
row per ACTIVE evidence item. Each row records the evidence id, document id,
pinned document version, evidence type, issuer, reference number, validity
dates and capture time. The reviewer-content endpoint resolves only the
captured document/version pair; a later document version, evidence renewal or
withdrawal cannot alter the reviewed set.

Snapshot rows are append-only and protected against update/delete by a DB
trigger. The request also captures detectable platform feature-toggle actors
for segregation-of-duties evaluation.

## Data model — migration 0047 (additive and idempotent)

### `verification_requests`

Tenant-owned request envelope: `id`, `tenant_id`, `status`, `created_by`,
`submitted_by/at`, `in_review_by/at`, frozen `sod_actor_ids`, timestamps.
Checks couple lifecycle fields to states; a partial unique index enforces one
open request per tenant. The only mutable fields are controlled state-machine
fields.

### `verification_request_evidence_snapshots`

Immutable tenant-owned evidence projection: request/evidence/document ids,
pinned document version and captured PV-001 metadata. Unique per
request/evidence; indexed by tenant and request.

### `verification_decisions`

Append-only APPROVE, REJECT or REVOKE rows with mandatory reason, platform
actor, decision time and a structured SoD evaluation. The evaluation records
the rule, whether detectable actors were available, the actors checked and a
PASS result. Failed SoD attempts create no decision and no state change.

### `verification_badges`

Immutable issue record: tenant, request, approval-decision reference, level
(`VERIFIED` only in v1), issue date/time, expiry, issuing reviewer and the
request id used as the evidence-snapshot reference. Revocation is derived from
the later REVOKE decision/request state, so the badge issue record is never
rewritten.

Snapshot, decision and badge tables receive append-only DB triggers. Request
state receives a transition trigger. No existing table or column is removed
or repurposed.

## Permissions, feature gates and segregation of duties

- Tenant routes: `requireFeature("verify.centre")` then `verify.read` or
  `verify.manage`; tenant identity comes only from authenticated context.
- Platform routes: new `platform.verification.review` permission following the
  `platform_roles` closed-catalogue pattern. Principal and Operations
  Administrators receive it in the idempotent role backfill.
- Platform queue/detail reads require the permission. Start-review,
  approve/reject and revoke also require a fresh step-up proof.
- At submission, the request captures the current `verify.centre` flag actor
  and any tenant feature-toggle actors auditable during the draft-to-submit
  interval. Null/direct-migration actors remain explicitly undetectable.
- ApprovalService receives one segregation rule per detected actor. The
  reviewer/revoker cannot be any captured actor. Successful decisions persist
  the SoD evaluation; the rule fails closed on a detected match.

## API contract

All paths are under `/api/v1`.

Tenant (flag-gated, tenant-scoped):

- `GET /verification/status` (`verify.read`) — latest request/decision and a
  reviewer-anonymous badge projection.
- `POST /verification/requests` (`verify.manage`) — create DRAFT.
- `POST /verification/requests/:id/submit` (`verify.manage`) — freeze every
  ACTIVE evidence row and move DRAFT → SUBMITTED atomically.
- PV-001 evidence endpoints remain unchanged and power the combined tenant UI.

Platform (platform-only):

- `GET /platform/verification/requests?status=...` — authorised queue.
- `GET /platform/verification/requests/:id` — request, immutable snapshot and
  decision history for staff.
- `GET /platform/verification/requests/:id/evidence/:snapshotId/content` —
  protected retrieval of the exact pinned document version.
- `POST /platform/verification/requests/:id/start-review` — step-up-protected
  SUBMITTED → IN_REVIEW.
- `POST /platform/verification/requests/:id/decisions` — step-up-protected,
  reasoned APPROVE or REJECT; optional approval expiry defaults to 12 months.
- `POST /platform/verification/badges/:id/revoke` — step-up-protected,
  reasoned and immediate.

Every endpoint is registered in the tenant-isolation endpoint manifest as
tenant or platform-only as applicable.

## Badge read model and privacy

The tenant status response and exported internal projection contain only:
badge id, `VERIFIED` level, issue date, expiry, evidence-snapshot reference and
derived state (`ACTIVE`, `EXPIRED` or `REVOKED`). Reviewer/issuer identity,
SoD actor ids and platform staff history are never returned to tenant routes.
PV-003 may later consume this projection but must separately pass its privacy
and directory-rendering scope; PN-002 is untouched here.

## Audit contract

Tenant audit actions:

- `verification.request_drafted`
- `verification.request_submitted`
- `verification.request_in_review`
- `verification.request_approved`
- `verification.request_rejected`
- `verification.badge_revoked`

Staff-driven transitions also write platform audit actions with request,
tenant, badge, reason and SoD result as applicable:

- `platform.verification.review_started`
- `platform.verification.request_approved`
- `platform.verification.request_rejected`
- `platform.verification.badge_revoked`

No audit metadata contains document bytes, identity-document numbers beyond
the already governed snapshot, step-up proofs or authentication material.

## Web experience, accessibility and localisation

- Tenant Verification Centre: request/status summary plus the PV-001 evidence
  vault list, expiry badges and add/renew/withdraw controls backed by the
  existing APIs. Navigation requires both `verify.centre` and `verify.read`.
- Platform Verification Review: permission-gated queue, request detail,
  pinned-evidence retrieval, reasoned decisions, configurable expiry and
  reasoned revocation. Consequential controls invoke the shared step-up flow.
- Copy lives in `appEnglish` catalogue keys. Stable machine statuses remain
  separate from labels so Shona and Ndebele catalogues can be added without
  changing business logic.
- Semantic headings, labelled fields, native controls, keyboard-operable
  actions, visible focus, live error/status regions, 44px targets, horizontal
  table regions and small-screen card/stack behaviour are acceptance criteria.
  Verification also includes the repository accessibility conformance scan
  and a WCAG 2.2 AA-focused code review.

## Failure, security, data protection and AI boundaries

- Flag OFF fails before tenant data access with `FEATURE_DISABLED`.
- Missing permission or step-up proof fails before mutation. Cross-tenant ids
  are not-found/forbidden without revealing another tenant's evidence.
- Snapshot, state change, badge/decision and both audit writes commit or roll
  back together.
- Evidence content is returned only to authorised platform staff for a pinned
  snapshot and is never placed in audit metadata or badge projections.
- No AI participates in evidence interpretation, approval, rejection,
  revocation or expiry. All authority remains deterministic and human.

## Verification plan

New PV-002 suite: complete state machine, one-open-request constraint, empty
evidence rejection, snapshot immutability after renew/withdraw/version change,
pinned content, default/custom expiry, ApprovalService use, reason validation,
SoD pass/fail and recorded evaluation, revoke immediacy, decision/snapshot DB
immutability, dual audit evidence, reviewer privacy, tenant isolation,
platform-only isolation, flag-OFF fail-closed, permission gates and step-up.

Required regression: `verification-vault`, `document-workspace`, `critical`,
`feature-flags`, `tenant-isolation-regression`, finance journal balancing,
journal immutability and finance tenant isolation; server and web typechecks;
web production build; navigation-model, accessibility and design-token tests.

## Explicitly out of scope

PV-003 directory/marketplace badge rendering; PN-002 changes; external
registry checks; automated evidence interpretation; appeals; minimum evidence
policy; public verification claims; notifications; scheduled expiry jobs.

