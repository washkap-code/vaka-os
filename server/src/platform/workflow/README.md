# Workflow Platform Contract

The workflow namespace now exposes two compatible seams:

- the P1-001 named in-process runner (`register` / `run`); and
- the P1-003 durable approval engine (`start` / `approve` / `reject`).

Durable definitions are versioned and tenant-scoped. Each step names one role
routing label and one authoritative permission. `WorkflowService` enforces the
permission through a request-bound `IdentityService`, records the action and
instance transition through an injected store, writes `workflow.*` audit
events through `AuditService`, and publishes the matching `workflow.started`,
`workflow.approved`, `workflow.rejected` and `workflow.completed` events on the
EventBus.

Steps run sequentially. An optional exact-decimal `amount-threshold` condition
includes a step only when the supplied object amount is strictly greater than
the configured value. The amount must be re-derived from the protected object
for each action; definitions and instances intentionally do not copy business
record values.

The first adopter is the existing invoice issue command. Its one-step
`invoice.issue.approval` definition requires `accounting.post`. Workflow rows,
workflow audits, queued events, invoice numbering, journals, stock movements
and invoice state all share the existing invoice database transaction; a
posting rollback therefore leaves no workflow evidence or published event.
The public request and response remain unchanged.

The event adapter remains best-effort and process-local after commit. Durable
cross-process delivery, retries, dead-letter handling, timers, delegation,
parallel approvals and a workflow designer remain future work.
