# PW-003 — Tenant task centre + opt-in event automation

**Status:** Implemented
**Programme:** PW — Workflow (Master Build Plan Part II, Wave 1)
**Depends on:** P1-005 event bus; PW-001/002 approval engine

## Outcome

Every tenant has one operational task list (`tenant_tasks`), fed three ways:
manually by users, by opt-in automation rules that turn domain events into
tasks, and (in later missions) by approvals and AI recommendations. Tasks are
work items only — creating or closing a task **never** writes to any
financial table.

Automation rules come from a closed, code-defined catalogue and are disabled
until a tenant enables them (`automation_rules`, no row = OFF). Launch
catalogue:

- `procurement-approval-task` — a task when a purchase approval is requested
  (`procurement.approval_requested`).
- `supplier-bill-review-task` — a task when a supplier bill posts
  (`supplier_bill.posted`).

A partial unique index dedupes OPEN automation tasks per
(tenant, rule, subject): a re-fired event can never create a duplicate open
task; closing the task allows a future event to raise it again.

## API

- `GET /tasks?status=OPEN|DONE|DISMISSED|ALL` (authenticated, tenant-scoped)
- `POST /tasks` (manual; optional tenant-validated assignee; audited)
- `POST /tasks/:id/close { outcome: DONE|DISMISSED }` (open tasks only; audited)
- `GET/PUT /settings/automation-rules[/:key]` (`settings.manage`; audited
  `automation_rule.enabled|disabled`)

## Explicit non-scope

Workbench task widget and navigation surface (PW-004); assignment
notifications; scheduled/recurring tasks; SLA timers.

## Verification

`server/tests/task-automation.test.ts`: manual lifecycle (create → close,
double-close conflict, invalid assignee), automation disabled by default,
enabled rule creates exactly one task per subject (dedupe proven by double
event), rules catalogue CRUD + permission gate + audit, tenant isolation.
Migration 0038 idempotency proven by double-apply. Procurement/critical
regression green.
