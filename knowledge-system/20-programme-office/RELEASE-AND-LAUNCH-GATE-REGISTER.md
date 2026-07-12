# Release and launch gate register

| Gate | Required evidence | Current posture |
|---|---|---|
| G0 Scope and outcome | approved outcome, scope, owner, metrics, dependencies | Blueprint accepted; per-mission work required |
| G1 Architecture/data | ADR/PRD, canonical model, interfaces, migration/rollback | Partial by capability |
| G2 Functional | acceptance, negative, contract and regression tests | Partial |
| G3 Tenant/permission/audit | direct/indirect isolation, allow/deny, admin and audit evidence | Foundation; not complete portfolio-wide |
| G4 Domain integrity | finance/stock/payroll exactness, atomicity, idempotency, reversal/reconciliation | Finance/stock foundations; scope-specific review required |
| G5 UX/localisation | mobile, accessibility, errors/offline, English/Shona/Ndebele | Not complete |
| G6 Security/privacy | threat model, scans, abuse tests, provider/privacy review | Partial; penetration test missing |
| G7 AI | use-case evaluation, isolation, injection/action, cost/fallback/kill switch | Foundation only; live AI disabled |
| G8 Operations | SLO/alerts/runbooks, backups/restore, capacity, support, rollback | Partial |
| G9 Professional | legal/accounting/tax/security/native/country approvals | Missing for full GA scope |
| G10 Pilot | onboarding/migration/UAT/support and observed outcomes | Not run |
| G11 Commercial | entitlements, pricing/contracts, billing, claims, success/support | Partial |
| G12 Production | go/no-go, staged deployment, smoke/reconciliation, observation | Not passed |

The Zimbabwe launch remains `planned` until every applicable gate is accepted with linked evidence.
