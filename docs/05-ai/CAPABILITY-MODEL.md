# VAKA AI Capability Model

**Status:** Product specification — not implemented
**Owner:** Product and Engineering
**Last reviewed:** 2026-07-05

## 1. Purpose

The capability model defines what VAKA AI may understand, produce, and coordinate over time. Capabilities mature independently by module and language.

A higher capability level does not grant higher autonomy. For example, Executive Intelligence may remain read-only, while a narrowly bounded Operator workflow may execute with explicit approval.

## 2. Level 1 — Assistant

### Outcome

Help users find information, understand VAKA, and complete ordinary tasks correctly.

### Capabilities

- answer product and workflow questions;
- explain fields, statuses, reports, and permissions;
- search company information the user is authorised to access;
- summarise a customer, invoice, purchase order, or stock item;
- guide a user through a task;
- explain validation or workflow errors; and
- link to the correct record or screen.

### Boundaries

- no unrestricted search;
- no cross-tenant or unpermitted existence disclosure;
- no authoritative professional advice;
- no record mutation;
- no claim that unavailable information is zero or absent; and
- no external communication.

### Minimum evidence to release

- permission-filtered retrieval tests;
- source links or record references;
- answerability and refusal evaluation;
- English tone and accuracy thresholds;
- latency and cost limits; and
- kill switch.

## 3. Level 2 — Analyst

### Outcome

Turn authorised business records into clear, decision-relevant analysis.

### Capabilities

- analyse revenue, costs, margin, cash, receivables, payables, stock, pipeline, and operations;
- compare periods and segments;
- identify trends and anomalies;
- explain financial and operational reports;
- forecast when sufficient and appropriate data exists;
- identify data quality limitations;
- rank risks and opportunities; and
- recommend actions.

### Analysis rules

- deterministic services perform authoritative calculations;
- every analysis identifies its period and data coverage;
- forecasts state assumptions, horizon, method, and uncertainty;
- anomalies identify the baseline and threshold;
- recommendations link back to evidence;
- late or incomplete records are disclosed; and
- correlation is not presented as causation.

### Boundaries

- no silent write-back;
- no guarantee that forecasts will occur;
- no invented benchmark;
- no legal, tax, audit, or investment conclusion without approved authority; and
- no recommendation that bypasses product controls.

## 4. Level 3 — Operator

### Outcome

Reduce administrative effort by preparing and coordinating structured work.

### Capabilities

- draft invoices and quotations where supported;
- draft payment reminders and customer messages;
- prepare purchase orders;
- prepare reports;
- create tasks;
- propose record updates;
- prepare workflow transitions; and
- initiate approved workflows through bounded tools.

### Required stages

1. Understand the request and intended outcome.
2. Retrieve only authorised context.
3. Prepare a structured draft.
4. Validate the draft through deterministic services.
5. Show a human-readable preview and consequences.
6. Obtain the required approval.
7. Recheck permission and record version.
8. Execute idempotently.
9. Report the actual result.
10. Write the audit event.

### Boundaries

- models never write directly to the database;
- drafts do not become authoritative records silently;
- approval is specific, fresh, and attributable;
- external messages remain drafts until authorised;
- financial posting follows domain services; and
- partial failure is not reported as success.

## 5. Level 4 — Executive Intelligence

### Outcome

Continuously surface the most important authorised risks, opportunities, and decisions.

### Capabilities

- prepare morning or scheduled briefings;
- monitor cash-flow signals;
- monitor debtors and collections;
- monitor inventory availability and replenishment risk;
- monitor deadlines, approvals, and expiring opportunities;
- identify unusual activity;
- connect signals across modules;
- prioritise recommended actions; and
- learn which categories of insight are useful without learning unsafe authority.

### Prioritisation model

Each item should consider:

- business impact;
- urgency and deadline;
- confidence and data quality;
- reversibility;
- user role and responsibility;
- dependency on another action;
- whether the item is new, changed, or already acknowledged; and
- notification fatigue.

### Boundaries

- monitoring scope follows the recipient’s current permissions;
- briefings do not reveal inaccessible records;
- silence is not approval;
- recurring recommendations must avoid harassment or alert flooding;
- unusual activity is a signal, not an accusation; and
- high-impact action remains governed by autonomy rules.

## 6. Capability matrix

| Capability | Assistant | Analyst | Operator | Executive Intelligence |
|---|---:|---:|---:|---:|
| Product explanation | Yes | Yes | Yes | Yes |
| Authorised record search | Yes | Yes | Yes | Yes |
| Deterministic report explanation | Limited | Yes | Yes | Yes |
| Trend/anomaly detection | No | Yes | Yes | Yes |
| Forecasting | No | Conditional | Conditional | Conditional |
| Draft records/messages | No | Recommend | Yes | Recommend/prepare |
| Execute tools | No | No | Approval-dependent | Approval-dependent |
| Continuous monitoring | No | User-requested | Workflow-specific | Yes |
| Prioritised briefing | No | On request | On request | Yes |

“Yes” means allowed by this model, not implemented or automatically enabled.

## 7. Module maturity

Each module receives a maturity state:

- `not-designed`;
- `designed`;
- `sandbox`;
- `internal-preview`;
- `tenant-pilot`;
- `generally-available`;
- `suspended`; or
- `retired`.

State is tracked separately for:

- capability level;
- autonomy ceiling;
- tenant cohort;
- country;
- language;
- channel; and
- model/provider.

## 8. Promotion criteria

Promotion requires:

- a defined business outcome;
- adequate source data quality;
- approved tools and permissions;
- safety and privacy review;
- language-specific evaluation;
- acceptable factual and hallucination performance;
- failure and rollback behaviour;
- cost and latency targets;
- user evidence of usefulness; and
- operational ownership.

No capability advances because a model demo appears convincing.
