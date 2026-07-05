# VAKA AI Proactive Intelligence

**Status:** Product and operational specification — not implemented
**Owner:** Product, Engineering, and Operations
**Last reviewed:** 2026-07-05

## 1. Purpose

Proactive Intelligence is VAKA AI’s ability to monitor approved business signals and surface material risks, opportunities, deadlines, and next actions without waiting for a user to formulate every question.

It is not unrestricted surveillance, continuous model access to all data, or permission to act.

## 2. Target experiences

### Morning briefing

A concise, role-specific summary of what materially changed and what requires attention.

### In-workflow insight

A relevant observation shown beside the record or task where a user can evaluate it.

### Scheduled review

An approved daily, weekly, monthly, or period-end analysis.

### Event-triggered signal

A bounded check triggered by a deterministic event such as an invoice becoming overdue or stock crossing a configured threshold.

### Exception alert

A high-priority notification when a configured risk threshold is met.

## 3. Initial monitoring domains

### Cash flow

- projected inflows and outflows where supported;
- cash concentration;
- near-term obligations;
- material variance from plan or recent pattern; and
- missing data that weakens the view.

### Debtors

- newly overdue invoices;
- ageing movement;
- concentration by customer;
- broken payment promises where recorded;
- customers with changed payment patterns; and
- recommended follow-up order.

### Inventory

- low or out-of-stock items;
- unusual movement;
- slow-moving stock;
- stockout risk using approved methods;
- purchase orders that may not cover demand; and
- discrepancies requiring investigation.

### Deadlines

- due invoices and approvals;
- expiring quotations or opportunities;
- purchase-order and delivery dates;
- configured compliance or payroll dates; and
- assigned tasks at risk.

### Unusual activity

- material deviations from an approved baseline;
- duplicate or unexpected records;
- unusual access or workflow patterns when security policy permits; and
- cross-module inconsistencies.

An unusual signal is not proof of fraud, error, or misconduct.

## 4. Briefing format

Each briefing item includes:

- category;
- concise finding;
- affected period;
- business impact;
- urgency;
- confidence/data quality;
- source links;
- recommended next step;
- required permission;
- autonomy level; and
- acknowledgement/snooze state.

Recommended order:

1. urgent cash, security, or deadline risk;
2. high-value debtor or stock issues;
3. approvals and blocked workflows;
4. commercial opportunities;
5. informational changes.

## 5. Signal pipeline

1. Deterministic events, schedules, and thresholds select candidate records.
2. Permission-aware services compute facts and aggregates.
3. Rules remove duplicates and known non-material conditions.
4. AI may explain, group, rank, or recommend within approved bounds.
5. Policy filters determine recipient, channel, urgency, and availability.
6. The user receives the item with evidence.
7. Acknowledgement, dismissal, action, and correction feed evaluation—not hidden authority.

Models must not scan entire production databases continuously.

## 6. Prioritisation

Priority is based on:

- estimated business impact;
- time sensitivity;
- data confidence;
- user responsibility;
- configured tenant thresholds;
- reversibility;
- recurrence;
- dependency/blocking status;
- recent acknowledgement; and
- risk of notification fatigue.

The ranking rationale should be inspectable. Tenants may configure thresholds within safe limits; AI must not invent policy.

## 7. Notification discipline

- Default to a digest for non-urgent items.
- Deduplicate repeated signals.
- Show what changed since the last notification.
- Respect quiet hours, time zones, channel preferences, and role.
- Do not notify a user about inaccessible records.
- Rate-limit alerts by category and severity.
- Allow snooze, acknowledgement, and category opt-out where safe.
- Escalate only through an approved policy.
- Never use fear or urgency to drive engagement.

## 8. Recommendations and actions

Proactive Intelligence may:

- explain;
- recommend;
- prepare a draft; or
- offer an approved action.

It must not interpret delivery of a briefing as approval. Every action follows the Tool and Action Model and Approval and Autonomy rules.

## 9. Data quality

Before issuing a material insight, check:

- period completeness;
- posting/update lag;
- missing exchange rates;
- duplicate or unclassified records;
- stale inventory counts;
- unsupported forecast horizon; and
- changed configuration.

If limitations materially affect the conclusion, include them near the finding.

## 10. Safety and privacy

- Minimise data in notifications, especially on shared devices.
- Hide sensitive amounts/content on lock screens unless explicitly allowed.
- Keep links authenticated and tenant-scoped.
- Do not send sensitive record details through unapproved channels.
- Separate business monitoring from employee surveillance.
- Require explicit governance for HR, payroll, security, or behavioural signals.

## 11. User correction

Users can mark an insight:

- useful;
- not useful;
- incorrect;
- already handled;
- not my responsibility; or
- unsafe/inappropriate.

Corrections inform evaluation and configured relevance. They do not alter authoritative records automatically.

## 12. Release sequence

1. On-demand read-only briefing in English.
2. Scheduled briefing with user-configured topics.
3. Deterministic event-triggered insights.
4. Role-aware prioritisation.
5. Draft actions.
6. Explicitly approved actions.
7. Narrow pre-authorised low-risk automations only after evidence.

Each language, module, and channel is enabled independently.

## 13. Evaluation

Measure:

- precision of surfaced items;
- missed material events;
- false-positive rate;
- evidence correctness;
- priority quality;
- time-to-awareness and time-to-resolution;
- dismissal and fatigue rates;
- permission/tenant violations;
- action conversion without coercion;
- user correction rate;
- cost and latency; and
- language quality.
