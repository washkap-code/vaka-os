# Requirement traceability matrix

This register maps constitutional outcomes to blueprint books and evidence systems. Book 24 expands the mapping to missions.

| Requirement | Governing source | Blueprint | Evidence |
|---|---|---|---|
| Multi-tenant isolation | Constitution; Coding Standards | Books 6, 7, 13, 19 | Tenant tests, schema/query review, file/search/event/AI checks |
| Secure least-privilege access | Constitution; Security Principles | Books 7, 13, 18, 19 | Threat model, permission tests, scans, audit evidence |
| Append-only finance/stock history | AGENTS; Finance architecture | Books 6, 8, 9, 19 | Invariant, reversal, transaction, concurrency tests |
| Exact money and currency snapshots | Coding Standards; Finance docs | Books 6, 8, 15 | Exactness and FX snapshot tests, professional approval |
| AI-first with bounded authority | AI Constitution | Books 7, 12, 13, 19 | Evaluation harness, permission/adversarial tests, approval audit |
| English, Shona, Ndebele | Constitution; Localisation | Books 15, 17, 19 | Catalogues, native review, expansion/accessibility checks |
| Mobile-responsive core work | Constitution; Product Philosophy | Books 17, 19 | Responsive, keyboard, touch, offline/interruption tests |
| Suspend then escrow | Constitution; billing docs | Books 20, 21, 22 | Lifecycle tests, export/read access evidence |
| Auditability and recovery | Constitution; Quality Gates | Books 7, 13, 18, 22 | Audit catalogue, restore drills, RPO/RTO evidence |
| Architecture freeze | ADR-002 | Books 1-7, 24 | ADR conformance review and mission linkage |
| Complete launch gates | Quality Gates; Release Strategy | Books 18-24 | Gate register, approvals, staged deployment and observation |

No matrix row is complete merely because a blueprint chapter exists.
