# PW-002 — Configurable approval policies (thresholds, permission, second person)

**Status:** Implemented
**Programme:** PW — Workflow (Master Build Plan Part II, Wave 1)
**Depends on:** PW-001 kernel ApprovalService; P4-002 procurement; P2-009 payroll

## Outcome

A tenant Owner/Admin can configure one optional approval policy per subject
type — **purchase orders** and **payroll runs** — consisting of an amount
threshold in the tenant base currency (0 = always), an extra permission the
actor must hold, and/or a second-person rule (the actor must differ from the
subject's creator/preparer). Policies are evaluated by the kernel
`ApprovalService.evaluatePolicy` inside the domain's own transaction and
violations return the domain's standard 409 conflict.

**No policy configured = behaviour identical to before this mission.** The
`approval_policies` table (migration 0037) ships empty.

## Design

- Fail closed: when a second-person rule applies but the subject's preparer
  cannot be established, the evaluation throws rather than silently passing.
- A policy must require *something* (permission, second person, or both) —
  an empty policy row is rejected at validation.
- `requiredPermission` is validated against the RBAC catalogue in `lib.ts`.
- Purchase orders evaluate on the base-currency amount
  (`total × rateToBase`); payroll runs on `grossTotal`.
- Configuration endpoints (`GET/PUT/DELETE /settings/approval-policies…`)
  require `settings.manage` and audit `approval_policy.updated|removed`.
- Payroll posting had no SoD before this mission; a tenant can now enforce
  preparer ≠ poster by policy. Procurement's hard-coded SoD (PW-001) remains
  and policies stack on top.
- API-first: the settings UI panel ships with the later settings-surface
  mission; platform behaviour is complete without it.

## Verification

`server/tests/approval-policies.test.ts`: kernel evaluation unit tests
(threshold boundaries, missing permission, second person, unknown-preparer
fail-closed, null policy no-op); settings CRUD with permission gate,
validation and audit; PO approval blocked/allowed around the threshold;
payroll preparer blocked from posting own run under policy while a second
poster succeeds; removal restores prior behaviour. Existing procurement and
payroll suites re-run green (defaults unchanged).
