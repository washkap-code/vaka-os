# P9-005 — Incident response and audit forensics

**Status:** Approved for implementation
**Priority:** P0 operational readiness
**Authority:** VAKA Constitution; VAKA Security Principles; Operations Manual;
Backup and Disaster-Recovery Runbook

## Outcome

Give VAKA responders a single, safe operating baseline for classifying,
containing, communicating and reviewing incidents, plus repository-accurate
read-only queries for tenant audit, session, feature-flag and finance evidence.

Success means:

- incidents can be classified consistently from SEV1 through SEV4 using VAKA-
  specific examples;
- named response roles and first-hour decisions are explicit;
- communication templates separate confirmed facts, unknowns and next steps;
- immutable audit evidence is preserved without direct database mutation;
- every published forensic query is a single `SELECT` statement; and
- query limitations and professional notification/reconciliation review gates
  are stated plainly.

## User and business problem

**User:** on-call engineers, security and data-protection responders, finance
integrity reviewers, support leaders and accountable executives.

**Problem:** VAKA has security, audit, session and recovery controls but lacks a
consolidated response plan and safe query catalogue. Under pressure, responders
could classify inconsistently, over-collect tenant data, mutate evidence or
communicate speculation.

**Measurable result:** the plan covers severity, roles, the first hour,
communications, evidence preservation, recovery and post-incident review; the
query guide covers every requested investigation against current schema names
and passes an automated SELECT-only content check.

## Scope

1. Define SEV1–SEV4 with tenant leakage, ledger-integrity, credential and
   provider-outage examples.
2. Define decision roles, escalation rules and a minute-by-minute first-hour
   checklist.
3. Provide internal, customer, provider and counsel/regulatory briefing
   templates.
4. Define evidence handling, tenant/data minimisation, immutable audit-log and
   chain-of-custody rules.
5. Provide a post-incident review template and closure criteria.
6. Document parameterised, SELECT-only PostgreSQL queries for actor activity,
   role/permission changes, tenant sign-ins, feature-flag flips and financial
   postings by source.

## Deliberate exclusions

- Production database access or any live incident action.
- Database schema, application, migration or audit-event changes.
- Assigning named employees, telephone numbers, vendors or on-call schedules.
- Defining statutory breach-notification deadlines without approved market-
  specific legal advice.
- Replacing provider recovery runbooks, accounting reconciliation or qualified
  security/privacy/accounting review.

## Security, data and authority rules

- Tenant leakage and unbounded ledger-integrity doubt start at SEV1 until
  evidence supports a lower classification.
- Active harm may require immediate containment; every emergency action and
  its evidence impact is recorded.
- `audit_logs` is immutable evidence. Investigations use a least-privileged
  read-only connection and SELECT-only queries; incident notes belong in the
  incident record, never in historical audit rows.
- Historical queries require explicit tenant and UTC time bounds. A current-
  state query still requires explicit tenant scope; broader platform scope
  requires recorded Incident Commander authorisation.
- Authentication hashes, raw secrets, credentials and unnecessary personal or
  financial content are excluded from standard evidence output.
- Posted financial history is never repaired in place. Any later correction
  uses approved reversal/offsetting workflows with finance authority.
- External notification content and timing require accountable privacy/legal
  review in each affected market.

## Failure behaviour

- When severity or impact is uncertain, classify higher and state what evidence
  is missing.
- If the database cannot be queried safely, preserve provider/system evidence
  and escalate; do not weaken permissions or write directly to production.
- If audit and source records disagree, preserve both, stop affected high-risk
  paths when authorised and escalate to security/finance review.
- If a query returns broader data than intended, stop, restrict access, record
  the exposure and treat the output as incident evidence.

## Verification

- compare table and column names to the current Drizzle schema;
- compare documented audit actions to current authentication and feature-flag
  writers;
- parse every SQL code block and require `SELECT` as its first statement token;
- reject mutation or DDL keywords in every SQL code block;
- run `git diff --check`; and
- confirm the final diff contains only mission-authorised documentation.

## Rollback

Revert the two operational guides and this mission pack. Preserve any incident
record or exported evidence already created under the guidance; a documentation
rollback must never delete historical incident evidence.
