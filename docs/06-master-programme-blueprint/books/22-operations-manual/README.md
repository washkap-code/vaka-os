# Book Twenty-Two - Operations Manual

**Version:** 1.0  
**Definition:** Accepted operating-model target  
**Implementation:** Selected deployment, backup, billing and admin procedures; full runbook set incomplete

## 1. Operating model

Operations protects customer outcomes and data across Platform, ERP, Intelligence, Network products, integrations and commercial lifecycle. Responsibilities include service ownership, support, incident, problem, change, release, capacity, availability, security operations, backup/DR, provider management, data operations and status communication.

Roles are assigned through a RACI for every service and release. Early-stage role consolidation does not remove independent approval requirements.

## 2. Daily control cycle

1. Review service health, SLO/error budget, incidents and security signals.
2. Review database/storage/queue/search/provider/AI capacity, failures and cost.
3. Review finance/stock/billing/integration reconciliation exceptions.
4. Review backup jobs and scheduled restore/drill status.
5. Review tenant lifecycle, dunning, support escalations and release changes.
6. Record decisions, owners, deadlines and unresolved risk.

Dashboards support judgment; they do not silently auto-correct authoritative data.

## 3. Super Admin operations

The Super Admin Control Centre covers platform health; tenants and lifecycle; users/sessions; subscriptions/billing/dunning; entitlements/features; jobs/events/DLQ; notifications/providers; documents/storage; integrations; audit/security; releases/configuration; country/industry packs; AI use cases/evaluations/kill switch; support grants; data export/retention; capacity/cost; incidents/status; and the User Guide.

Dangerous controls require named permissions, step-up or approval where applicable, exact preview, reason, idempotency, audit and outcome verification. Super Admin never edits posted tenant finance/stock or impersonates silently. Tenant support access is explicit, narrow, expiring and audited.

## 4. Incident management

Detect -> classify severity/customer/data impact -> assign incident commander -> contain -> preserve evidence -> communicate -> restore -> reconcile -> monitor -> close -> review -> remediation missions. Security/privacy/regulatory notification follows approved counsel and market requirements. Status updates are factual, timestamped and do not speculate.

## 5. Problem and known-error management

Recurring/significant incidents receive root-cause analysis, contributing controls, corrective/preventive actions, owners, due dates, verification and knowledge updates. Workarounds are time-limited and never become hidden architecture.

## 6. Change and release

Every change has mission/release ID, risk, dependencies, approvals, test evidence, migration, rollout, monitoring, rollback, customer/support communication and observation window. Emergency change is reviewed after stabilization. Feature flags have owner and expiry.

## 7. Backup and disaster recovery

Runbooks specify PostgreSQL/object/config/key/event/search dependencies, backup frequency/retention, integrity checks, restore order, RPO/RTO, failover, credential recovery, reconciliation, tenant/customer communication and return to normal. Drills record actual times, loss, failures and remediation.

## 8. Data and reconciliation operations

Operational corrections use approved domain commands and audit, never ad-hoc destructive SQL against posted history. Data repair has incident/change record, tenant scope, backup, dry run, approval, exact affected rows/objects, reconciliation and validation.

## 9. Provider and capacity operations

Track provider status, credentials/certificates, quotas, cost, latency/errors, webhook lag, reconciliation, support cases and exit/fallback. Capacity forecasts cover tenants/users/records, database/storage, queues, search, notifications, AI, integrations and support.

## 10. Runbook minimum

Each service runbook states purpose/owner/SLO, dependencies, dashboards/alerts, common failure diagnosis, safe actions, escalation, data/security considerations, backup/recovery, provider procedures, reconciliation, communication and last rehearsal.

## 11. Acceptance

On-call/support ownership, operational dashboards/alerts, incident/change/release drills, restore/DR, reconciliation, admin-permission/audit, provider failure, capacity, customer communication and current runbooks must pass before GA.
