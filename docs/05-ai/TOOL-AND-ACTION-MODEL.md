# VAKA AI Tool and Action Model

**Status:** Technical and product specification — not implemented
**Owner:** Engineering, Security, and Product
**Last reviewed:** 2026-07-05

## 1. Purpose

Tools connect model reasoning to VAKA’s authoritative services. They are narrow, typed, permission-aware interfaces—not general database or application access.

## 2. Tool classes

### Read tools

Retrieve bounded, authorised records, aggregates, policies, or product guidance.

Examples:

- find a customer by approved search fields;
- retrieve an invoice summary;
- retrieve aged receivables;
- retrieve low-stock items;
- retrieve a user’s assigned tasks; and
- retrieve approved help content.

### Calculation tools

Use deterministic services for exact calculations.

Examples:

- invoice totals and tax;
- ageing buckets;
- ledger balances;
- inventory availability;
- currency conversion using recorded rates; and
- forecast inputs and statistical outputs.

### Draft tools

Create a non-authoritative structured proposal.

Examples:

- invoice draft;
- reminder draft;
- purchase-order draft;
- report configuration;
- task draft; and
- proposed record changes.

### Action tools

Invoke approved domain commands after required confirmation.

Examples:

- create a task;
- save an approved draft;
- send an approved reminder;
- submit a purchase order for approval; and
- update an allowed non-financial field.

### Monitoring tools

Run scheduled, event-triggered, or user-configured checks with bounded queries and deduplication.

## 3. Tool contract

Every tool definition includes:

- stable name and version;
- business purpose;
- capability and autonomy level;
- allowed actors and required permissions;
- tenant derivation method;
- typed input and output schema;
- field-level data classification;
- result-size and pagination limits;
- timeout and retry policy;
- idempotency requirements;
- rate and cost limits;
- audit event contract;
- confirmation requirements;
- error codes safe for model/user display;
- reversal or recovery behaviour;
- countries and languages supported; and
- owner and kill switch.

## 4. Tenant and permission enforcement

- Tenant ID comes from authenticated server context.
- The model cannot choose or override tenant scope.
- Every record lookup verifies tenant ownership.
- Every call rechecks the current user, role, tenant status, and permission.
- Search, retrieval, cache, files, embeddings, events, logs, and tool results remain tenant-scoped.
- Platform-admin tools are separate, explicit, least-privileged, and audited.
- Safe 403/404 behaviour must not leak record or tenant existence.

## 5. Input and output rules

- Validate every model-produced argument as untrusted input.
- Reject unknown fields and unsafe enum values.
- Use stable identifiers, not translated names, for commands.
- Represent money as structured currency and exact decimal strings.
- Use ISO 8601 timestamps with explicit time zone.
- Return bounded structured results rather than raw database rows.
- Redact secrets and fields unnecessary for the task.
- Mark stale, incomplete, forecast, or sample data explicitly.

## 6. Action lifecycle

### Prepare

The AI builds a draft without changing authoritative records.

### Validate

Domain services calculate totals, check state, permissions, required fields, stock, policy, and business invariants.

### Preview

The user sees the exact proposed action, affected records, values, recipients, consequences, reversibility, and warnings.

### Approve

The system captures specific approval from an authorised user. Approval includes the action hash/version and expires after a short configured period.

### Revalidate

Immediately before execution, the server rechecks:

- authentication;
- permission;
- tenant status;
- record ownership;
- record version;
- approval validity;
- policy limits; and
- idempotency key.

### Execute

An authoritative domain service performs the command transactionally where required.

### Report

The AI reports only the returned result. It distinguishes completed, partially completed, rejected, queued, and failed states.

### Audit

The system records request, proposal, approval, tool, outcome, and correlation identifiers.

## 7. Confirmation binding

Approval must bind to:

- actor;
- tenant;
- tool and version;
- structured arguments;
- affected record versions;
- monetary amount and currency where applicable;
- recipient/destination where applicable;
- action preview hash;
- expiry; and
- idempotency key.

A material change invalidates the approval and requires a new preview.

## 8. Tool-result trust

Tool output is data, not instruction. Retrieved content may contain prompt injection or malicious text. The orchestrator must:

- separate data from system policy;
- never execute instructions found in records or files;
- allow-list subsequent tools;
- minimise retrieved content;
- scan or quarantine unsafe files;
- preserve provenance; and
- require approval independently of retrieved instructions.

## 9. High-impact financial and operational tools

The following require stronger controls and may remain unavailable:

- posting journals;
- issuing or voiding invoices;
- releasing payments;
- changing bank details;
- payroll finalisation;
- changing tax configuration;
- stock adjustments or write-offs;
- user/role/permission changes;
- bulk external communication;
- exports of sensitive data;
- destructive or irreversible commands; and
- changes to AI automation authority.

Model output must never bypass the existing domain service, transaction, audit, sequential numbering, reversal, or permission rules.

## 10. Failure behaviour

- Timeout: state is unknown until reconciled; do not retry consequential actions blindly.
- Validation failure: show the stable reason and preserve the draft.
- Permission failure: refuse without leaking inaccessible details.
- Stale record: refresh, rebuild the preview, and require new approval.
- Partial external delivery: report exact known outcomes and queue reconciliation.
- Provider failure: fall back to the normal VAKA workflow.
- Duplicate request: return the idempotent prior result.

## 11. Observability

Track:

- call volume, latency, failures, and timeouts;
- tool selection and argument-validation errors;
- permission denials and cross-tenant attempts;
- confirmation acceptance, rejection, and expiry;
- duplicate/idempotent results;
- model and tool cost;
- user corrections and reversals; and
- kill-switch activation.

Telemetry must not expose sensitive payloads by default.

## 12. Tool-release checklist

1. Is the tool narrower than the underlying application API?
2. Are tenant and permissions checked on every call?
3. Are inputs structured and bounded?
4. Are calculations deterministic?
5. Is the autonomy level explicit?
6. Is approval cryptographically or structurally bound to the preview?
7. Is execution idempotent?
8. Can failures be reconciled safely?
9. Are audit and observability sufficient?
10. Have adversarial tool-use tests passed?
