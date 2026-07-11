# Programme RAID log

| ID | Type | Description | Impact | Owner/function | Disposition |
|---|---|---|---|---|---|
| RAID-001 | Risk | Full product scope is much larger than launch scope. | False completeness or unsafe parallel implementation. | Product/Programme | Use dependency missions and independent status dimensions. |
| RAID-002 | Issue | P1-003/P2-001 code and mission status have drifted. | Incorrect roadmap and completion claims. | Engineering | Reconcile packs, Completion Reports and registers after verification. |
| RAID-003 | Issue | Full local backend tests lack the documented disposable PostgreSQL role/database. | Complete local regression evidence blocked. | Engineering/Infrastructure | Provision safe test DB or rely on verified CI; never point tests at shared/production data. |
| RAID-004 | Risk | Finance Architecture previously lacked a named repository source. | Inconsistent accounting design. | Finance Architecture | Book Eight established as authoritative baseline; professional review required. |
| RAID-005 | Risk | Shona/Ndebele frameworks and translations are incomplete. | Constitutional/localisation gate failure. | Localisation | Build infrastructure, native review and language-specific tests before enablement. |
| RAID-006 | Risk | Live AI/provider/tool layer is absent. | Marketing/authority risk. | AI Governance | Keep live AI disabled; progress read-only use cases through evaluation. |
| RAID-007 | Risk | Super Admin is currently narrow and high-impact expansion can create abuse paths. | Cross-tenant/security risk. | Platform/Security | Read-only-first control centre, explicit permissions, step-up, reasons and audit. |
| RAID-008 | Dependency | Durable events require outbox, idempotency, retries and DLQ before cross-module use. | Lost/duplicated asynchronous effects. | Platform | Execute P1-005 after ADR/Mission Pack. |
| RAID-009 | Dependency | Additional countries/industries require professional and native/domain review. | Legal/tax/product harm. | Country/Industry | No copied packs or GA without pack gates. |
| RAID-010 | Risk | “Microsoft/SAP-level” can become an unsupported claim. | Trust/commercial risk. | Leadership/Marketing | Use benchmark dimensions and evidence; never claim parity without assessment. |

RAID items remain open until evidence and an authorized owner close them. They are reviewed with each release gate.
