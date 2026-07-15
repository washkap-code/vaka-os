# PW-001 — One approval engine: kernel ApprovalService extraction

**Status:** Implemented
**Programme:** PW — Workflow (Master Build Plan Part II, Wave 1)
**Priority:** High — PW-002 policies, PD-002 document approvals and PN
moderation all build on this
**Depends on:** P1-001 kernel; P4-002 procurement lifecycle (the donor
implementation)

## Outcome

Approval decision semantics live in exactly one place: the kernel
`ApprovalService` (`server/src/platform/workflow/approvals.ts`, token
`APPROVAL_SERVICE`). It owns APPROVE/REJECT outcome mapping, the decision
timestamp, segregation-of-duties enforcement with domain-exact messages, and
canonical audit action naming (`<subject_type>.approved|rejected`). It
performs **no I/O** — each domain keeps its own tables and transactions, which
is what makes this a behaviour-preserving extraction.

Procurement is the first consumer: `decidePurchaseRequisition` and
`approvePurchaseOrder` now obtain their outcome (status, `approvedAt`
timestamp, audit action) and SoD enforcement from the service. Policy
violations map to the same 409 conflict responses with byte-identical
messages:

- "A requester cannot approve or reject their own purchase requisition"
- "A purchase-order creator cannot approve their own purchase order"
- "A requisition requester cannot approve its purchase order"

## Explicitly unchanged

Status transitions, document numbering, audit metadata shapes, permission
requirements, API responses, and every existing procurement test. No schema
change, no migration, no feature flag needed (pure internal extraction).

## What PW-002 adds next

Configurable approval policies (amount thresholds, role routing) evaluated by
this same service, consumed first by procurement and payroll posting.

## Verification

`server/tests/workflow-approvals.test.ts` (service semantics: outcomes,
timestamps, audit naming, SoD violations, skipped null rules) plus the
existing `procurement-lifecycle` suite re-run as the parity proof.
