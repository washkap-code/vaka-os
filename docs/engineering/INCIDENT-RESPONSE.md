# VAKA incident response plan

**Status:** P9-005 operational baseline; named roster and rehearsal pending
**Owner:** Engineering, Security, Data Protection and Operations
**Last reviewed:** 2026-07-15

This plan governs suspected or confirmed production incidents affecting VAKA
availability, tenant isolation, credentials, personal data, audit evidence,
financial or stock integrity, providers, backups or recovery.

It is an operational baseline, not legal, privacy, security or accounting
approval. Notification duties, deadlines, recipients and wording require
qualified review in every affected market. Record all incident times in UTC.

## 1. Response principles

1. Protect people, tenant data and authoritative business records first.
2. Treat tenant data crossing a boundary as critical, even if only one record is
   known to be involved.
3. Preserve posted finance, stock and audit history. Corrections use approved
   reversal or offsetting workflows after evidence is preserved.
4. Separate confirmed facts, calculations, inferences and unknowns.
5. Contain active harm with the smallest reversible authorised action.
6. Preserve evidence before changing state when safe. If delay would extend
   harm, contain first and record exactly what evidence the action may alter.
7. Use least privilege, explicit tenant scope and data minimisation throughout.
8. Keep one timestamped incident record and one accountable Incident Commander.
9. Communicate factual impact and the next update time; never speculate.
10. Restore only after security, data and applicable finance reconciliation
    gates pass.

## 2. Activation and incident record

Any employee, contractor, monitor, tenant report or provider alert may trigger
an incident. The first responder opens a restricted incident record and records:

- incident ID in the form `INC-YYYYMMDD-NNN`;
- UTC detection time, reporter and detection source;
- initial severity and the evidence supporting it;
- affected environment, service, provider and known tenant IDs;
- whether personal, authentication, financial, stock or backup data may be in
  scope;
- Incident Commander and assigned response roles;
- containment decisions, approver, operator, start/end time and outcome;
- evidence references and chain of custody; and
- the next internal and external update times.

Do not paste credentials, signed URLs, raw tokens, production payloads, database
dumps or unnecessary personal/financial content into chat or the incident
record.

## 3. Severity classification

Classify on the highest plausible current impact. Do not downgrade because an
impact is inconvenient to confirm. The Incident Commander records the evidence
that supports every severity change.

| Severity | Definition and VAKA-specific examples | Response objective |
| --- | --- | --- |
| **SEV1 — Critical** | Confirmed or credible suspected cross-tenant data exposure; inability to prove tenant isolation; unbounded ledger-integrity doubt, evidence that posted journals were altered, or unexplained imbalance; compromise of a production database, signing, encryption, platform-admin or provider credential with active/unknown access; destructive attack; total production or critical provider outage with no safe workaround; failed recovery threatening approved RTO/RPO. | Declare immediately. Page the accountable executive and all required leads. Begin continuous command, containment and evidence work. Issue a factual holding update as soon as impact and audience are responsibly bounded. |
| **SEV2 — High** | Confirmed unauthorised access contained to one tenant; ledger-integrity doubt bounded to one tenant/source with the posting path safely stopped; compromised tenant/admin session contained with no evidence of wider access; multi-tenant core workflow unavailable or materially degraded; major database, payment, email, storage or AI provider outage with a safe temporary workaround. | Acknowledge within 15 minutes where on-call coverage exists. Assign Incident Commander and relevant security/finance/provider leads. Update at least every 30 minutes while impact continues. |
| **SEV3 — Moderate** | Limited single-tenant malfunction with no evidence of unauthorised access or authoritative-record corruption; non-critical provider degradation; delayed notifications, imports or reports with recoverable source evidence; suspicious authentication activity requiring investigation but already contained. | Assign an owner during the active support period. Bound scope, preserve evidence and provide planned updates at least every two hours while customer impact continues. |
| **SEV4 — Low** | Low-impact defect, false-positive alert, documentation/runbook gap, isolated cosmetic issue or control improvement with no current security, integrity or material availability impact. | Track through normal work management with an owner and due date. Escalate immediately if new evidence changes impact. |

Severity is not a statement of blame. A short incident can remain SEV1 because
the potential tenant, credential or ledger impact was critical.

## 4. Roles and decision rights

One person may cover multiple roles in an early-stage response, but role
consolidation does not remove approval, segregation-of-duties or review needs.

| Role | Responsibilities and authority |
| --- | --- |
| **Incident Commander (IC)** | Owns severity, objectives, priorities, role assignments, decision log, update cadence, escalation, recovery gate and closure. Does not perform every technical action. |
| **Technical/Operations Lead** | Diagnoses service and provider state; proposes and executes approved reversible containment, rollback, failover or recovery actions; records exact outcomes. |
| **Security and Forensics Lead** | Defines evidence scope, access controls and collection method; investigates credential/access paths; preserves originals and chain of custody; advises on containment risk. |
| **Tenant Isolation and Data Protection Lead** | Identifies affected tenants, data categories, jurisdictions and processors; prevents cross-tenant evidence exposure; coordinates qualified privacy/legal assessment. |
| **Finance Integrity Lead** | Freezes affected posting paths when authorised; verifies journal source, balance, period and reversal evidence; coordinates qualified accounting review. AI never makes the final integrity decision. |
| **Communications Lead** | Produces factual internal, tenant, status and provider updates; keeps approved wording and audience lists; coordinates support. |
| **Scribe/Evidence Custodian** | Maintains UTC timeline, decisions, actions, evidence register, export checksums and outstanding questions. |
| **Accountable Executive** | Accepts material business risk, extended outage or major recovery decisions and ensures resources are available. |
| **Qualified advisers** | Legal/privacy advisers decide notification obligations; security specialists review compromise/containment; accountants review material ledger conclusions. |

Only an authorised operator may change production, revoke privileged access,
rotate provider secrets, pause a workflow, fail over or restore. Emergency
authority must be explicit and its use reviewed after stabilisation.

## 5. First-hour checklist

### Minutes 0–10: declare and command

- [ ] Acknowledge the signal and record detection time/source in UTC.
- [ ] Open the restricted incident record and assign the incident ID.
- [ ] Classify initial severity using the highest plausible impact.
- [ ] Assign the IC, scribe and required technical, security, data, finance and
      communications leads.
- [ ] Establish a private response channel and approved voice bridge.
- [ ] Record what is confirmed, inferred and unknown.
- [ ] Pause unrelated deployments to the affected service when they could erase
      evidence or complicate rollback.

### Minutes 10–20: stop active harm

- [ ] Identify the smallest reversible containment action and its approver.
- [ ] For tenant-leak suspicion, stop or isolate the offending access path and
      preserve affected tenant boundaries.
- [ ] For credential compromise, revoke affected sessions/access through
      approved controls and rotate exposed secrets in the approved secret or
      provider system. Never paste old/new values into the incident record.
- [ ] For ledger-integrity doubt, pause the affected posting path through an
      approved application/deployment control. Do not edit or delete journals.
- [ ] For provider outage, prevent retry storms and duplicate side effects;
      retain queued/idempotency evidence for reconciliation.
- [ ] Record operator, command/control used, UTC time, expected effect, actual
      effect and evidence impact for every action.

### Minutes 20–40: preserve and bound evidence

- [ ] Establish the investigation window, relevant tenant IDs, user IDs,
      session IDs, source types and provider request IDs.
- [ ] Use a read-only database identity and the queries in
      `docs/engineering/FORENSIC-QUERIES.md`.
- [ ] Preserve audit, session, deployment, application, provider, identity,
      feature-flag and backup/restore evidence as applicable.
- [ ] Verify audit continuity and compare source records; absence of an audit
      event is an evidence gap, not proof an action did not occur.
- [ ] Minimise exports to the affected tenant/window/fields and exclude
      credential hashes unless separately authorised and necessary.
- [ ] Record query text/version, environment, operator, UTC run time, row count,
      destination and checksum for every retained export.
- [ ] Identify affected tenants, data categories, financial sources,
      jurisdictions and external processors without combining tenant exports.

### Minutes 40–60: decide, communicate and prepare recovery

- [ ] Reassess severity and record why it changed or remained unchanged.
- [ ] Send an internal update using the template below.
- [ ] Decide whether a tenant/status holding notice is needed; obtain
      communications and privacy/legal approval appropriate to impact.
- [ ] Open/escalate provider cases and preserve case IDs and status evidence.
- [ ] Define recovery and reconciliation gates, owners and rollback points.
- [ ] Set the next update time and assign the next 60-minute objectives.
- [ ] Start the notification-obligation assessment; do not invent a statutory
      deadline or claim that notification is unnecessary without approval.

## 6. Scenario containment guidance

### Suspected tenant data leak

Stop the path that could cross the boundary, preserve request/session/deployment
evidence, and identify the source and destination tenant IDs separately. Query
only authorised tenant scopes. Do not create a convenience export that combines
customer data from multiple tenants. Validate direct, related-resource, export,
cache, file, integration and AI-context boundaries before recovery.

### Ledger-integrity doubt

Treat the ledger as authoritative evidence and stop the affected posting path
when authorised. Compare immutable journal entries/lines, source records and
audit evidence using read-only access. Check tenant, source, date, currency,
balance, idempotency and reversal relationships. Never repair posted history
with ad-hoc SQL. After containment and qualified review, correct through the
approved reversal, credit/debit note or controlled journal workflow.

### Credential compromise

Determine credential type, privilege, tenant/platform scope, provider, issue
time and last known use. Preserve access evidence, then revoke sessions or
rotate the secret using approved controls. Review downstream credentials,
automation, deployments and provider logs. Do not query or export stored token
hashes merely to prove they exist.

### Provider outage

Confirm the provider's state independently, identify affected workflows and
bound retry/queue behaviour. Protect idempotency and record every externally
visible side effect. Use an approved fallback only when its security, data and
reconciliation path is understood. After recovery, reconcile payments,
notifications, files, webhooks, AI requests and financial/stock effects before
declaring normal operation.

## 7. Communication rules and templates

- The IC approves status and audience; the Communications Lead approves prose.
- Privacy/legal review is required for suspected or confirmed personal-data
  exposure and regulatory/customer notification decisions.
- Use the affected tenant's approved language/channel where available. English,
  Shona and Ndebele translations of material security/financial messages need
  qualified human review before reuse.
- Never say “no data was affected” or “the ledger is correct” until evidence
  supports that exact statement.
- State the next update time even when there is no material change.

### Internal update

> **[UTC] [INCIDENT ID] [SEVERITY] — [short factual title]**
>
> **Confirmed:** [facts and evidence references]
>
> **Impact:** [tenants/users/services/data/finance known to be affected]
>
> **Unknown:** [questions still being tested]
>
> **Actions completed:** [containment/evidence/recovery outcomes]
>
> **Next actions and owners:** [owner — action — target time]
>
> **Decisions needed:** [decision, accountable approver, deadline]
>
> **Next update:** [UTC]

### Tenant/customer holding notice

> We are investigating an issue affecting [service/workflow] from approximately
> [UTC time]. We have confirmed [bounded impact], and we are still determining
> [material unknowns]. We have [containment action described without exposing
> security detail]. Please [customer action, or “no action is required at this
> time” only when approved]. We will provide the next update by [UTC]. Reference:
> [incident/support reference].

### Resolution notice

> The [service/workflow] incident between [start UTC] and [end UTC] has been
> contained and service is [restored/current state]. The confirmed impact was
> [precise tenant/data/transaction impact]. We verified [security/data/ledger
> reconciliation performed] and identified [remaining limitations, if any].
> [Required customer action]. We will provide [post-incident follow-up] by
> [date/time]. Reference: [incident/support reference].

### Provider escalation

> **Severity:** [VAKA severity and provider severity]
>
> **Service/account/region:** [non-secret identifiers]
>
> **UTC window:** [start–current/end]
>
> **Observed behaviour:** [errors/latency/status with request IDs]
>
> **Customer and data impact:** [bounded facts]
>
> **Containment attempted:** [actions and outcomes]
>
> **Assistance requested:** [specific provider action/evidence]
>
> **Next coordination time:** [UTC]

### Privacy/legal/regulatory decision brief

> **Incident and UTC window:** [ID, start, detection, containment]
>
> **Affected markets/tenants/processors:** [facts]
>
> **Data categories and approximate records/people:** [minimum necessary]
>
> **Access/acquisition/alteration/availability evidence:** [facts and gaps]
>
> **Security measures and containment:** [facts]
>
> **Likely consequences and residual risk:** [clearly labelled assessment]
>
> **Notifications already made:** [audience/time/approver]
>
> **Decisions requested:** [obligation, audience, deadline, wording, owner]

## 8. Evidence preservation and chain of custody

`audit_logs` is immutable historical evidence. Investigations run read-only
queries only. Never insert incident notes into it; never update, delete,
truncate or alter audit rows. Do not “fix” metadata, user IDs, timestamps or
feature events. Preserve contradictory or incomplete evidence.

Use a database identity technically restricted to read-only access, preferably
against an approved replica or snapshot when freshness and incident conditions
allow. Platform-wide or cross-tenant access requires explicit incident scope,
authorisation and recording. Export the smallest necessary fields and window.

For every retained item, record:

| Field | Required evidence |
| --- | --- |
| Evidence ID | Unique incident-local identifier |
| Source | Database/environment, service, provider, log stream or file |
| Collector | Named authorised person/system |
| Collection time | UTC timestamp |
| Scope | Tenant/user/session/source/time bounds and excluded data |
| Method | Query/document version or provider export method |
| Integrity | Cryptographic checksum when an export/file is retained |
| Storage | Restricted evidence location and access list |
| Transfers | From/to, UTC time, purpose and recipient acknowledgement |
| Notes | Redactions, known gaps and containment effects |

Preserve originals before transformation. A screenshot may supplement but does
not replace machine-readable source evidence. Redacted copies must reference
the original and record the redaction method. Apply approved retention and
legal-hold decisions; do not delete failed or embarrassing evidence.

## 9. Recovery, reconciliation and closure

The IC may open recovery only when the Technical and Security leads agree the
active cause is contained. Finance/stock-affecting incidents also require the
Finance Integrity Lead's reconciliation plan. Restore/failover follows
`docs/03-backup-disaster-recovery.md`; an in-product evidence record does not by
itself prove a restore is safe.

Before closure, confirm:

- active harm and unauthorised access are contained;
- affected tenants, users, records, providers and UTC window are bounded, or
  unresolved scope is explicitly accepted by the accountable executive;
- credentials/sessions are revoked or rotated as required;
- tenant isolation tests and source/audit reconciliation pass;
- material journals remain balanced and posted history is preserved; any
  correction is separately authorised and traceable;
- queued/provider side effects are reconciled without duplication;
- service monitoring is stable through the agreed observation window;
- customer, support, contractual and regulatory decisions are recorded; and
- every remediation has an owner, priority, due date and verification method.

## 10. Post-incident review template

Complete the review promptly after stabilisation. The review is blameless about
individuals and exacting about decisions, controls and evidence.

### Header

- Incident ID, title and final severity:
- Owner and review facilitator:
- Start, detection, declaration, containment, recovery and closure times (UTC):
- Affected tenants/users/services/providers/markets:
- Personal, authentication, financial, stock or backup data involved:
- Customer/business outcome:

### Executive summary

- What happened:
- Confirmed impact and duration:
- What did not happen, with evidence:
- Current residual risk:

### Timeline

| UTC time | Signal, decision or action | Owner | Evidence/reference | Outcome |
| --- | --- | --- | --- | --- |
| | | | | |

### Cause and control analysis

- Direct technical/operational cause:
- Contributing conditions:
- Why prevention controls did not stop it:
- Why detection controls did or did not detect it promptly:
- Why containment/recovery controls did or did not limit impact:
- Tenant-isolation and data-protection analysis:
- Ledger/stock integrity and reconciliation conclusion:
- Provider/dependency contribution:
- Evidence gaps and confidence level:

### Response review

- What worked well:
- What created delay, confusion or extra risk:
- Severity and escalation quality:
- Decision-right and segregation-of-duties quality:
- Internal/customer/provider communication quality:
- Evidence preservation and chain-of-custody quality:
- RPO/RTO achieved where applicable:

### Notifications and customer remedy

- Legal/privacy/accounting advice obtained:
- Notifications made, audience, approver and UTC time:
- Notifications not made and approved rationale:
- Customer action, support or remedy:

### Corrective and preventive actions

| Action | Type (contain/prevent/detect/recover) | Owner | Priority | Due date | Verification and evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| | | | | | | |

### Approval and follow-through

- Incident Commander sign-off:
- Security/Data Protection sign-off:
- Finance Integrity/accounting sign-off where applicable:
- Accountable Executive risk acceptance where applicable:
- Documentation, mission packs, tests, alerts and training updated:
- Follow-up review date:

## 11. Readiness fields to complete before production launch

- Primary/secondary on-call contacts and escalation channels.
- Accountable executive, communications, privacy/legal and finance contacts.
- Provider support plans, account IDs, regions and status pages.
- Approved evidence store, access list, retention and legal-hold process.
- Approved customer/status channels and reviewed translations.
- Approved per-service SLO, RPO, RTO and update cadence.
- Date and evidence of the latest tabletop, tenant-leak, credential, ledger and
  provider-outage exercises.
