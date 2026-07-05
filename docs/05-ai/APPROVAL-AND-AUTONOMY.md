# VAKA AI Approval and Autonomy

**Status:** Mandatory control specification — not implemented
**Owner:** Product, Engineering, Security, and Risk
**Last reviewed:** 2026-07-05

## 1. Purpose

This document defines how much independent action VAKA AI may take. Autonomy is assigned per tool, use case, tenant configuration, role, country, channel, and risk—not per model.

Capability and autonomy are separate:

- capability describes what AI can understand or prepare;
- autonomy describes what the system may do without another human decision.

The lower applicable autonomy level always wins.

## 2. Level A — Read and explain

### Rule

No action approval is required because authoritative state is not changed and nothing is sent externally.

### Examples

- answer a product question;
- retrieve an authorised invoice;
- explain a report;
- summarise receivables;
- compare approved periods;
- identify a trend; and
- link to a record.

### Controls

- current authentication and read permission;
- tenant-scoped tools;
- bounded retrieval;
- safe handling of sensitive information;
- source and timestamp visibility; and
- audit of sensitive reads where policy requires.

## 3. Level B — Draft and recommend

### Rule

AI may prepare work but may not create an authoritative record, communicate externally, post financially meaningful data, or initiate a consequential workflow.

### Examples

- draft an invoice;
- draft a reminder;
- draft a purchase order;
- prepare a report;
- propose a task;
- propose a record update; and
- recommend a collections sequence.

### Controls

- draft status visibly labelled;
- structured validation;
- no silent save as authoritative;
- editable by the user;
- provenance retained; and
- no implication that the work completed.

## 4. Level C — Execute with explicit approval

### Rule

An authorised user must approve the exact action immediately before execution.

### Examples

- create an approved task;
- save an approved invoice draft;
- send an approved reminder;
- update an approved record field;
- submit a purchase order for its normal approval workflow; and
- generate and distribute an approved report.

### Approval requirements

Approval is:

- affirmative, not inferred;
- from a currently authenticated authorised user;
- specific to exact records, values, recipients, and action;
- informed by a human-readable preview;
- time-limited;
- invalidated by material changes;
- rechecked at execution; and
- auditable.

Conversation phrases such as “go ahead” count only when the UI clearly binds them to one displayed, unchanged action preview.

## 5. Level D — Pre-authorised automation

### Rule

VAKA may execute only a clearly configured, low-risk workflow within explicit limits, without approval for each occurrence.

### Required configuration

- named workflow and owner;
- eligible event and conditions;
- exact tool/action;
- allowed records and recipients;
- maximum amount/count/frequency where applicable;
- operating window and expiry;
- required role to configure;
- notification and exception policy;
- full audit trail;
- pause and revoke controls;
- kill switch; and
- periodic review.

### Suitable candidates

Only after evidence and review:

- create an internal follow-up task when an invoice crosses a threshold;
- prepare and deliver a non-sensitive internal digest;
- apply an approved non-financial classification within a bounded rule;
- send an approved low-risk reminder template under configured frequency limits.

### Unsuitable candidates

- payment release;
- journal posting;
- payroll finalisation;
- bank-detail changes;
- tax submissions;
- broad customer messaging;
- high-value procurement;
- permission changes; and
- irreversible operations.

## 6. Level E — Prohibited autonomous actions

VAKA AI must never autonomously:

- release, transfer, or receive funds;
- change bank, payment, or payout details;
- post, reverse, void, or delete material financial records;
- finalise payroll or statutory submissions;
- set or reinterpret tax, legal, or regulatory policy;
- issue credit or make lending decisions;
- hire, dismiss, discipline, or materially evaluate a person;
- grant, escalate, or remove permissions;
- create or alter its own authority, limits, tools, prompts, or safety controls;
- export or transmit sensitive datasets broadly;
- delete tenant data or audit history;
- bypass stock, accounting, approval, or workflow controls;
- impersonate a user;
- conceal its role in an action;
- use one tenant’s data to benefit another tenant; or
- continue when identity, scope, approval, or result is uncertain.

These actions may also be prohibited entirely or require specialised human processes even with approval.

## 7. Risk classification

Evaluate:

- financial value;
- external impact;
- reversibility;
- number of affected records/people;
- sensitivity of data;
- legal/regulatory significance;
- permission level;
- likelihood and cost of error;
- detectability and recovery time;
- frequency; and
- novelty.

Any high factor may lower the autonomy ceiling.

## 8. Approval UX

The approval screen must show:

- action verb;
- affected objects;
- exact amounts/currencies;
- recipients/destinations;
- source data;
- warnings and validation results;
- external or financial consequence;
- reversibility;
- who is approving;
- expiry; and
- cancel/edit options.

Destructive, external, financial, payroll, permission, and bulk actions require stronger visual distinction and may require step-up authentication or dual control.

## 9. Bulk and chained actions

- Show item count and total value.
- Allow inspection of exceptions.
- Set maximum batch limits.
- Do not hide materially different actions under one approval.
- Revalidate each item.
- Define atomic versus partial execution explicitly.
- Stop chained plans when an intermediate result differs from expectation.
- Require new approval when the plan changes materially.

## 10. Delegation

Users cannot delegate authority they do not possess. Delegation:

- is explicit;
- has scope and expiry;
- follows tenant policy;
- is revocable;
- cannot be created solely through conversational memory; and
- is audited.

## 11. Revocation and emergency controls

- Users can cancel pending approvals.
- Administrators can pause or revoke Level D workflows.
- Permission or tenant-status changes invalidate outstanding authority.
- A central kill switch can disable a tool, provider, tenant cohort, language, or all AI actions.
- In-flight consequential actions reconcile before retry or rollback.

## 12. Promotion policy

Moving a use case from A/B to C or D requires:

- recorded decision;
- production evidence at the lower level;
- risk and privacy review;
- permission and tenant tests;
- action and confirmation evaluations;
- incident and rollback procedures;
- monitoring thresholds;
- tenant administrator controls; and
- time-limited pilot.

No workflow starts at Level D.
