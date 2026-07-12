# Book Twelve - VAKA Intelligence

**Version:** 1.0  
**Definition:** Accepted AI and intelligence architecture  
**Implementation:** Read-only business-summary and evaluation foundations; live model layer not yet approved

## 1. Mission and voice

VAKA Intelligence helps users understand, decide and act using authorized business evidence. Its voice is professional, calm, executive, well-spoken, concise and business-focused. It separates facts, deterministic calculations, inferences and recommendations; states uncertainty; and ends with a useful next step.

## 2. Authority model

AI capability and AI authority are separate. Maturity levels are:

- A - explain public/product knowledge;
- B - read authorized tenant data and summarize;
- C - draft an exact action preview for user confirmation;
- D - execute narrowly pre-approved, reversible low-risk automation under policy;
- E - prohibited autonomous high-impact action.

Payments, ledger posting, stock changes, payroll finalisation, permissions, destructive data action, external communication and other consequential operations require deterministic services, exact scope, permission, confirmation/approval and audit. AI never posts directly to ledger or stock tables.

## 3. Architecture

`Use case -> Identity/Tenant/Permission -> Policy -> Context builder -> Evidence -> Prompt/model route -> Structured response -> Deterministic validation -> Optional tool preview -> Human/approval -> Domain service -> Audit/observability`

The model receives minimum necessary context. Tools use typed schemas and permission-aware services. Prompt, tool, policy, provider/model and evaluation versions are recorded for material outcomes subject to privacy/retention.

## 4. Context, knowledge and memory

Context sources have owner, authority, freshness, classification, tenant/legal-entity scope, permission, retention and citation. Retrieval results do not grant permission. Untrusted documents, web content, messages and integration data are isolated as evidence, never higher-priority instructions.

Memory is use-case-specific, user-controlled where appropriate, minimal, expiring and permission-revalidated on every use. It may store preferences and approved business context but not secrets, unnecessary personal data or hidden cross-tenant profiles.

## 5. Intelligence capabilities

Executive/business summary; cash and working-capital health; receivables/payables attention; sales/pipeline insight; inventory risk and replenishment; procurement/spend insight; project/operations risk; workforce insight; compliance calendar; anomaly detection; forecasting/scenarios; natural-language search/reporting; knowledge assistant; recommendations; workflow drafting; and approved bounded automation.

Every output declares as-at time, currencies/units, evidence, assumptions and confidence appropriate to the use case.

## 6. Domain assistants

Finance, CRM, Procurement, Inventory, Projects/Operations, HR, Mail, Compliance/Black Book, Verify/Capital and Super Admin assistants are separate evaluated use cases. A general chat label never grants broad data or action scope.

## 7. Multilingual behavior

English, Shona and Ndebele AI experiences require language-specific terminology, prompt/evidence behavior, safety and groundedness evaluation plus native review. Translation cannot change permissions, calculations, policy or action scope. The system falls back honestly when a language/use case has not passed its gate.

## 8. Safety and failure controls

Threats include prompt injection, data exfiltration, tenant leakage, hallucination, stale evidence, unsafe tool arguments, authority confusion, bias, sensitive inference, denial of wallet/service and provider compromise. Controls include instruction/data separation, allowlisted tools, schemas, policy enforcement outside the model, output validation, citations, confirmation binding, rate/cost/token/time limits, redaction, monitoring, kill switch and provider/model fallback.

Model failure never blocks deterministic accounting, stock, permissions, tax, workflow, documents or exports. The UI states unavailability and permits ordinary work.

## 9. Evaluation

Each use case/language/autonomy level has a dataset and thresholds for factual correctness, calculation fidelity, evidence/citations, permission/tenant isolation, injection resistance, unsafe-action rate, uncertainty calibration, tone/usefulness, accessibility, latency, cost and graceful failure. Human review covers material professional/business judgment.

Changes to model, prompt, retrieval, tool, policy or source rerun applicable evaluations. Synthetic passing results do not replace pilot and production monitoring.

## 10. Release gates

Approved purpose and owner; provider/privacy/security assessment; permission and context isolation; evaluation thresholds; cost/capacity; observability and kill switch; user disclosure/feedback; confirmation/audit; fallback; multilingual review; runbooks/support; pilot outcome; and availability approval are required. Current repository foundations do not constitute a live AI release.
