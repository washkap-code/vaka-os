# Book Eighteen - DevOps and Infrastructure

**Version:** 1.0  
**Definition:** Accepted operational architecture target  
**Implementation:** CI/deployment/health foundations; complete production operations not yet proven

## 1. Principles

Infrastructure is versioned, reproducible, least-privileged, observable, recoverable and cost-aware. The modular monolith remains valid until evidence justifies extraction. Environments and customer data are isolated. Deployment and availability are separate decisions.

## 2. Environments

- Local: synthetic development with safe defaults.
- CI: disposable dependencies/database, deterministic tests and retained evidence.
- Development: shared integration without production data/secrets.
- Staging: production-like topology for migrations, integrations, performance, security and rollback.
- Pilot: selected Zimbabwe tenants, explicit support/consent/flags and observation.
- Production: controlled availability, on-call, backups, incident response, support and approved claims.

No environment shares unrestricted credentials or copies production data without approved minimisation and handling.

## 3. CI/CD and supply chain

Pinned lockfiles, reviewed dependencies, isolated runners, minimal workflow permissions, type/lint/format/build/test gates, migration tests, secret/dependency/SAST scans, SBOM/provenance where adopted, artifact retention, protected review/branch rules, environment approvals and signed/traceable releases form the target pipeline.

Current CI type/build/PostgreSQL test and AI-evidence foundations are not blanket production assurance; known lint/E2E/scan/migration limitations remain missions.

## 4. Deployment and database change

Use immutable build artifacts, validated config, versioned migrations and expand/migrate/contract. Backfills are restartable, idempotent, tenant-safe, observable and reconciled. High-risk changes use flags, shadow/read-only modes, canaries/rings and explicit rollback/forward-fix. Posted history is compensated through domain controls, not destructive database rollback.

## 5. Topology and scalability

Web/API, PostgreSQL, object storage, event/job processing, search, notifications, AI/provider adapters and observability components scale according to measured demand and SLO. Connection pooling, query/index analysis, caching with tenant-safe keys, queue backpressure, storage lifecycle and rate controls are load-tested before scale claims.

Service extraction requires a separate ADR showing independent scaling, security, availability, deployment, ownership, runtime or residency need.

## 6. Observability and SLOs

Every launch-critical flow has correlation, redacted structured logs, golden metrics, traces where valuable, business/invariant signals, dashboards, alerts, ownership and runbook. SLOs define availability, latency, correctness/freshness and recovery; error budgets inform change risk. Tenant identifiers in telemetry are controlled and never leak through customer-facing diagnostics.

## 7. Backup, recovery and continuity

PostgreSQL and object storage backups are encrypted, access-controlled, monitored and stored in an appropriate separate failure domain. Define service-tier RPO/RTO, retention, key recovery, dependency restoration and reconciliation. Scheduled restore and disaster-recovery drills prove the plan; a successful backup job alone is not evidence.

## 8. Security and incident operations

Secrets/keys, patching, vulnerability response, network/edge controls, database/service accounts, provider credentials, logs and admin operations follow Book 13. Incident management covers detection, severity, command, communication, containment, recovery, reconciliation, review and remediation.

## 9. Capacity, performance and cost

Set workload and user-flow budgets, baselines, forecast thresholds and load/soak/stress/failure tests. Monitor database growth, object/event/search/AI cost, provider quotas and tenant fairness. Reliability, performance, security and cost trade-offs are explicit.

## 10. Production gate

Reproducible artifacts; migrations and rollback; configuration/secrets; security scans/review; SLO/alerts/runbooks; capacity/performance; backup/restore/DR; support/on-call; provider status/fallback; legal/professional approvals; staged smoke/reconciliation and observation must pass.
