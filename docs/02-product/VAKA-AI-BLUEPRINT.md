# VAKA AI Blueprint

**Status:** Product and architecture direction
**Owner:** Product, Engineering, Security, and Data Protection
**Last reviewed:** 2026-07-04

## 1. Purpose

VAKA AI is the intelligence layer of VAKA OS.

Its job is to help authorised users:

- understand what is happening;
- identify what needs attention;
- explain business information clearly;
- recommend a useful next action; and
- complete approved actions with explicit control.

VAKA AI must not be decorative chat, an ungoverned database interface, or a replacement for deterministic accounting, payroll, tax, permissions, or stock rules.

## 2. Product progression

VAKA AI develops in four controlled stages:

1. **Ask** — answer permission-scoped questions.
2. **Understand** — explain trends, exceptions, and business position.
3. **Recommend** — prioritise grounded next actions.
4. **Act** — call approved tools with confirmation, permissions, and audit.

Each stage requires separate evidence before release.

## 3. Voice

VAKA AI must sound:

- professional;
- calm;
- concise;
- executive;
- respectful; and
- highly intelligent.

It must not sound:

- childish;
- robotic;
- verbose;
- overly excited;
- patronising;
- falsely certain; or
- casual about money, payroll, compliance, security, or people.

Responses should lead with the answer, show material evidence, explain the implication, and recommend the next action.

## 4. Initial use cases

The safest initial release is read-only.

### Executive daily summary

- sales and receipts;
- overdue receivables;
- stock risk;
- pipeline priorities;
- cash and expense exceptions; and
- items requiring approval.

### Receivables assistant

- who owes money;
- how overdue it is;
- recent payment behavior;
- concentration risk; and
- recommended follow-up order.

### Inventory attention

- low stock;
- unusual movement;
- high-value shortages;
- purchasing needs; and
- potential overselling risk.

### Report explanation

- explain profit and loss;
- compare periods;
- identify major drivers;
- state filters and currency; and
- distinguish facts from interpretation.

## 5. Future use cases

After read-only quality is proven:

- draft customer follow-ups;
- draft quotations and purchase requests;
- prepare management briefings;
- suggest reconciliation matches;
- prepare workflow actions for confirmation;
- explain payroll results;
- identify compliance evidence gaps; and
- coordinate customer/supplier portal responses.

AI must never post journals, issue payments, adjust stock, run payroll, change permissions, or send external communications without the required deterministic validation and explicit confirmation.

## 6. Permission model

VAKA AI must use the same tenant and permission model as VAKA OS.

- Tenant context comes from authenticated server state.
- The model receives only data needed for the request.
- A user cannot retrieve through AI what they cannot retrieve through the product.
- Tool permissions are checked at execution time.
- Platform-admin data is isolated from tenant AI.
- Customer, supplier, employee, payroll, and personal data require purpose-specific controls.
- Cross-tenant caching, logs, retrieval indexes, and prompts are prohibited.

## 7. Grounding and tools

VAKA AI should use structured tools around existing domain services.

Examples:

- `get_business_summary`
- `get_overdue_receivables`
- `get_pipeline_attention`
- `get_low_stock`
- `get_financial_report`
- `explain_report`
- `draft_follow_up`

Tools must:

- accept structured validated inputs;
- derive tenant/user context server-side;
- return bounded structured results;
- preserve authoritative calculations;
- include source identifiers where safe;
- state currency, period, and filters;
- enforce rate and result limits; and
- fail without leaking internal or cross-tenant data.

The model must not receive direct unrestricted database access.

## 8. Action safety

Consequential actions require:

1. permission check;
2. current-state validation;
3. clear preview;
4. explanation of effect;
5. explicit human confirmation;
6. deterministic service execution;
7. idempotency where relevant;
8. audit event;
9. visible result; and
10. safe retry or recovery.

Examples of consequential actions:

- issuing or voiding invoices;
- recording payments;
- stock adjustments;
- approving procurement;
- payroll processing;
- changing permissions;
- exporting data;
- sending messages; and
- changing company settings.

## 9. Response standards

VAKA AI must:

- distinguish observed facts, calculations, inferences, and recommendations;
- state missing data and uncertainty;
- avoid fabricated customers, amounts, balances, laws, or actions;
- cite the source record or report where useful;
- use exact dates and currencies;
- explain material assumptions;
- remain concise; and
- suggest escalation to a qualified professional when required.

## 10. Data protection

Before production:

- approve providers and processing locations;
- define what data may leave VAKA infrastructure;
- minimise and redact prompts;
- prohibit secrets and credentials;
- define retention and deletion;
- configure provider training controls;
- document sub-processors;
- establish consent or lawful basis where required;
- protect employee and payroll data;
- review cross-border transfers; and
- support data-subject and tenant export requirements.

## 11. Threat model

Controls must address:

- prompt injection;
- malicious content in customer/supplier records;
- data exfiltration;
- cross-tenant leakage;
- excessive tool permissions;
- indirect prompt manipulation;
- hallucinated financial or legal advice;
- unsafe action chaining;
- denial of wallet/cost abuse;
- model/provider outage;
- compromised retrieval indexes; and
- sensitive logs.

## 12. Auditability

For material AI interactions, record as appropriate:

- tenant and user;
- use case;
- model/provider and version;
- instruction/prompt version;
- tool calls and result status;
- confirmation;
- final action identifier;
- safety outcome;
- latency and cost; and
- timestamp.

Do not store complete prompts or model responses by default when they contain unnecessary sensitive data.

## 13. Evaluation

Release gates must test:

- factual accuracy;
- calculation consistency;
- groundedness;
- tenant isolation;
- permission enforcement;
- prompt-injection resistance;
- refusal quality;
- action safety;
- uncertainty handling;
- tone;
- English quality;
- ChiShona and isiNdebele quality;
- latency;
- availability; and
- cost.

Use synthetic, anonymised, or authorised evaluation data.

## 14. Localisation

VAKA AI must eventually support:

- English;
- ChiShona; and
- isiNdebele.

Requirements:

- native-speaker evaluation;
- approved business, financial, payroll, and compliance terminology;
- language-specific safety testing;
- consistent numbers, dates, and currencies;
- fallback behavior;
- no reduced permissions or quality based on language; and
- explicit uncertainty where source records use another language.

Machine translation alone is not production approval.

## 15. Reliability and cost

Implement:

- model gateway/provider abstraction;
- timeouts;
- retries with idempotency awareness;
- per-tenant/user rate limits;
- token and cost budgets;
- request cancellation;
- fallback models only after evaluation;
- graceful degradation;
- circuit breakers;
- monitoring and alerts; and
- clear unavailable-service messaging.

VAKA’s deterministic product must remain usable when AI is unavailable.

## 16. Architecture boundaries

Recommended layers:

1. AI API boundary
2. authentication and policy
3. context/retrieval
4. tool registry
5. model gateway
6. response validation
7. confirmation/action service
8. audit and telemetry
9. evaluation harness

AI provider code must not be embedded throughout CRM, finance, inventory, payroll, or UI components.

## 17. Release phases

### Phase A — Foundations

- provider review;
- policies;
- model gateway;
- AI audit schema;
- evaluation harness;
- permission-scoped read tools.

### Phase B — Internal read-only pilot

- executive summary;
- receivables;
- stock;
- report explanation;
- staff-only testing with synthetic data.

### Phase C — Tenant read-only early access

- selected tenants;
- explicit availability label;
- feedback and incident process;
- usage/cost limits.

### Phase D — Drafting

- draft messages and business documents;
- human review before use.

### Phase E — Confirmed actions

- narrow approved tools;
- preview and explicit confirmation;
- audit and rollback/reversal behavior.

## 18. Go-live checklist

VAKA AI is not production-ready until:

- security and privacy approve the design;
- tenant isolation tests pass;
- evaluations meet thresholds;
- human confirmation works;
- audit records are complete;
- provider outage fails safely;
- costs are bounded;
- support is trained;
- user-facing limitations are clear; and
- the homepage/product availability label is accurate.
