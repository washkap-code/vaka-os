# PD-002 — Document approvals + retention

**Programme:** PD — Documents · **Status:** DONE (2026-07-15)
**Flag:** `documents.workspace` · **Migration:** `0044_document_approvals.sql`
(adds `document_approvals` + `retention_until` on workspace_documents)

## Approvals (second-person rule)

- `POST /documents/:id/approvals` (documents.manage) — pins the document's
  CURRENT version into the request; one PENDING approval per document
  (partial unique index; 409 on duplicates); archived documents refused.
- `POST /documents/approvals/:approvalId/decide` (documents.manage) —
  APPROVED/REJECTED with optional note. **The requester can never decide
  their own request** — enforced in the service AND by DB CHECK
  (`decided_by <> requested_by`), same segregation-of-duties posture as
  procurement/payroll. Decided approvals are immutable (409 on re-decide;
  DB CHECK ties decided fields to non-PENDING status).
- `GET /documents/approvals/list?status=` (documents.read).
- All events audited: approval_requested / approved / approval_rejected.

## Retention

- `PUT /documents/:id/retention` (documents.manage, audited with previous
  value) sets or clears `retentionUntil` (YYYY-MM-DD or null).
- **A document under retention cannot be archived** until the date passes
  (guard wired into the PD-001 archive path). PD-001 has no delete at all,
  so retention + append-only versions give a complete keep-until story.

## Verification (scratch Postgres, 2026-07-15)

document-approvals 4/4 — request + duplicate 409; requester self-decide
409; second admin (created via createTenantUser) approves, re-decide 409,
list filter works; retention blocks archive until cleared. Regression
document-workspace + critical 21/21; typecheck clean.

## Follow-ups

Approval outcomes surfaced in the task centre (PW-003 rule) and
attach-to-object (link documents to invoices/contacts) as the next PD slice.
