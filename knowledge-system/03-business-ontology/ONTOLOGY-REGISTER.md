# VAKA Business Ontology register

**Canonical detailed model:** `docs/06-master-programme-blueprint/books/06-enterprise-data-model/README.md`

## Foundation concepts

| Term | Canonical meaning | Important distinction |
|---|---|---|
| Tenant | Customer-owned isolated operating environment. | Not a legal entity, branch or subscription. |
| Organisation | Coordinated business/operating identity within a tenant. | May contain several legal entities in the target model. |
| Legal Entity | Juridical owner of statutory and posted financial records. | Never inferred only from tenant. |
| Operating Unit | Branch/division used for operations and reporting. | Cannot replace tenant/legal-entity ownership. |
| Party | Canonical person or organisation participating in business. | Customer, supplier, employee and partner are roles. |
| User | Authenticated platform identity linked to access. | Not automatically the same as employee/contact. |
| Role/Permission | Named grouping and atomic authority. | UI visibility is not permission enforcement. |
| Business Object | Canonical record with owner, lifecycle and policy. | Physical tables and provider objects are implementations. |
| Accounting Event | Approved economic event translated by Finance into a balanced journal. | Operational modules do not write ledgers directly. |
| Stock Movement | Append-only evidence of quantity entering/leaving/changing location. | Stock balance is a derived read model. |
| Document/Version | Governed file/record and immutable version evidence. | OCR text is untrusted draft, not the source file. |
| Workflow | Versioned state/approval orchestration. | Does not override domain lifecycle. |
| Rule | Deterministic versioned decision content owned by a domain/pack. | Platform owns the engine, not all rule authority. |
| Policy Decision | Explainable allow/deny/obligation result. | AI/model output is not policy. |
| Event | Versioned fact about completed/committed state. | Does not replace an atomic transaction. |
| AI Recommendation | Evidence-backed, non-authoritative proposal. | Requires deterministic service and approval for action. |

New terminology is registered here before it becomes a duplicate canonical concept. Detailed relationships and fields live in the Canonical Information Model and Enterprise Data Dictionary.
