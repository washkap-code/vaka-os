# Contradiction and normalisation log

| ID | Source tension | Normalized rule |
|---|---|---|
| N-001 | `docs/` and the Knowledge System both claimed sole authority. | ADR-001: Knowledge System is control plane; `docs/` is specification/evidence plane. |
| N-002 | Book Two places Identity before Container, then tactical examples place Container first. | Existing P1-001 Kernel/Container and P1-002 Identity/Audit IDs remain authoritative. Future work follows dependencies. |
| N-003 | Illustrative mission IDs collide with committed mission IDs. | ADR-004 reserves committed IDs permanently; examples are superseded. |
| N-004 | Book Three programme numbers conflict with the current Master Build Plan. | Book 24 owns the canonical namespace; product families and missions use stable IDs plus dependencies. |
| N-005 | “Platform contains no business logic” conflicts with shared rules/tax/country engines. | Platform owns engines/contracts; domain and country owners own approved rule content. |
| N-006 | “All services communicate through events” conflicts with atomic finance/stock requirements. | Synchronous transactions enforce invariants; durable outbox events drive post-commit work. |
| N-007 | “Every operation is audited” risks noise and excess personal data. | A governed audit catalogue covers material and sensitive actions with minimised metadata and retention. |
| N-008 | “Every module exposes AI” conflicts with read-only-first, safe failure. | AI exposure is per approved use case; deterministic product workflows never depend on model availability. |
| N-009 | The chat's 95% unit coverage and mandatory scans were worded as current gates. | They are target gates until tooling and evidence exist; current CI limitations stay visible. |
| N-010 | Documentation was said to follow code, while Mission Packs must precede it. | Requirements/decisions precede code; API/user/ops/release/completion evidence ships with code. |
| N-011 | One-day maximum later became three days. | One day preferred; three days maximum unless an approved decomposition exception exists. |
| N-012 | Aspirational teams were described as an existing organisation. | Team names define accountable functions, not current headcount. |
| N-013 | Product names included Marketplace/Store and later Studio. | ADR-003: Marketplace belongs to Network; Store is a Platform commercial catalogue; Studio is the frozen builder product. |
| N-014 | “Complete without external consultants” conflicts with mandated professional review. | Customer operation may become self-service only after qualified approvals; professional assurance is never bypassed. |
| N-015 | Page count was presented as a proxy for enterprise quality. | Evidence, traceability, controls, tests, operational proof, and outcomes determine quality. |
