# VAKA AI Architecture

**Status:** Target architecture
**Owner:** Engineering, Product, Security, and Data Protection
**Last reviewed:** 2026-07-04

## 1. Architecture objective

VAKA AI adds permission-aware understanding and assistance to VAKA modules without weakening deterministic business rules.

Core VAKA must remain usable when AI is unavailable.

## 2. Layered design

```text
Web / Mobile / Module UI
          |
      AI API
          |
 Auth · Tenant · Permission · Rate/Cost Policy
          |
 Context Builder · Retrieval · Tool Registry
          |
        Model Gateway
          |
 Response Validation · Confirmation · Audit
          |
 Existing Domain Services and Read Models
```

## 3. AI API

- Authenticated and tenant-scoped.
- Narrow use-case endpoints.
- Structured inputs.
- Streaming optional, not required.
- Request IDs and cancellation.
- Clear unavailable/fallback behavior.
- No provider credentials in clients.

## 4. Policy layer

Before model use:

- confirm user and tenant;
- check use-case permission;
- classify requested data/action;
- apply provider/data restrictions;
- enforce rate, cost, and size limits;
- determine whether confirmation is required; and
- record correlation context.

## 5. Context and retrieval

- Retrieve only authorised, relevant records.
- Prefer structured read models.
- State period, currency, filters, and freshness.
- Isolate retrieval indexes by tenant.
- Treat stored text as untrusted.
- Detect/mitigate prompt injection.
- Minimise personal, payroll, and sensitive content.

## 6. Tool registry

Tools wrap deterministic application services.

Each tool defines:

- name/version;
- purpose;
- input/output schema;
- required permission;
- tenant behavior;
- read/write classification;
- confirmation requirement;
- idempotency;
- audit event;
- timeout; and
- data sensitivity.

No raw SQL or unrestricted database tool is allowed.

## 7. Model gateway

The gateway isolates provider-specific code and handles:

- model selection;
- approved providers;
- prompt/instruction versions;
- retries/fallback;
- timeouts;
- token/cost budgets;
- data-processing settings;
- response metadata;
- circuit breakers; and
- monitoring.

Provider fallback requires evaluation; a different model is not automatically equivalent.

## 8. Read versus action

### Read-only

- summaries;
- explanations;
- priorities;
- recommendations;
- drafts.

### Consequential action

- posting/reversing finance;
- payments;
- stock movement;
- payroll;
- permissions;
- exports;
- messages;
- settings.

Consequential actions require deterministic validation, current-state preview, explicit confirmation, idempotent execution, audit, and visible result.

## 9. Module integration

AI-aware modules expose:

- safe read models;
- approved tools;
- domain terminology;
- source links;
- permission mapping;
- evaluation cases; and
- fallback UX.

Modules do not embed provider calls directly.

## 10. Audit and telemetry

Record minimally necessary:

- tenant/user;
- use case;
- model/provider/version;
- instruction version;
- tool calls/status;
- confirmation;
- action/result IDs;
- latency/cost;
- safety outcome; and
- timestamp.

Avoid storing complete sensitive prompts/responses by default.

## 11. Evaluation

Automated and human evaluation covers:

- correctness;
- groundedness;
- financial consistency;
- tenant/permission leakage;
- prompt injection;
- unsafe actions;
- uncertainty;
- tone;
- English/ChiShona/isiNdebele;
- latency;
- failure behavior; and
- cost.

Production releases require defined thresholds and rollback.

## 12. Privacy and security

- Approved data-processing terms.
- Data minimisation/redaction.
- Provider training disabled where required.
- Defined retention.
- Cross-border review.
- HR/payroll restrictions.
- Secrets excluded.
- Abuse monitoring.
- Tenant deletion/export compatibility.

## 13. Reliability

- AI failure never corrupts authoritative records.
- Read requests fail with clear fallback.
- Writes occur only through domain services.
- Tool calls are time-bounded.
- Retries respect idempotency.
- Provider outage is observable.
- Budgets prevent denial-of-wallet.

## 14. Localisation

- Language preference is explicit.
- Canonical numbers/dates/currencies remain structured.
- Native-reviewed terminology.
- Language-specific evaluation.
- English fallback is visible.
- Permission and safety behavior is identical across languages.

## 15. Release order

1. Architecture, provider, privacy, audit, and evaluation foundations
2. Internal synthetic-data testing
3. Read-only executive summary
4. Read-only module insights
5. Draft generation with human review
6. Narrow confirmed actions
7. Expanded languages after independent evaluation

The homepage must retain Preview/Coming Soon until production gates pass.
