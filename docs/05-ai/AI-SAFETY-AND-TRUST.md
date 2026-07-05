# VAKA AI Safety and Trust

**Status:** Mandatory safety specification — not implemented
**Owner:** Security, Product, Engineering, Privacy, and Risk
**Last reviewed:** 2026-07-05

## 1. Safety objective

VAKA AI must improve business outcomes without weakening tenant isolation, permissions, authoritative records, privacy, human accountability, or operational reliability.

Trust requires that users can understand what data was used, what the AI knows, what it inferred, what it proposed, what was approved, and what actually happened.

## 2. Threat model

Threats include:

- cross-tenant data exposure;
- permission bypass;
- prompt injection through user input, records, files, websites, or integrations;
- model hallucination;
- unsafe tool selection or arguments;
- approval spoofing or replay;
- indirect prompt injection causing data exfiltration;
- sensitive data sent to providers;
- poisoned retrieval or memory;
- insecure logs and traces;
- provider compromise or outage;
- cost/denial-of-wallet attacks;
- notification manipulation;
- malicious automation configuration;
- model or prompt regression; and
- over-reliance on plausible output.

## 3. Defence layers

### Identity and scope

- authenticate before tenant data access;
- derive tenant and actor server-side;
- recheck user, role, tenant status, and permission per tool call;
- isolate platform administration; and
- prevent model-selected identity.

### Data minimisation

- retrieve only fields needed for the task;
- bound records, dates, and result size;
- redact secrets and unnecessary personal data;
- avoid full-database context;
- classify data before provider transmission; and
- use approved provider regions and retention settings.

### Prompt boundary

- separate system policy, user instructions, retrieved data, tool definitions, and tool results;
- treat retrieved content as untrusted;
- never follow instructions embedded in business records;
- prevent lower-trust content from changing safety or tool policy; and
- version and review system prompts.

### Tool safety

- allow-list tools by use case;
- validate typed arguments;
- apply policy outside the model;
- use deterministic calculations;
- require confirmation and idempotency;
- bound time, rate, amount, and record count; and
- audit material calls.

### Output safety

- verify critical claims against tool results;
- cite source records where useful;
- label uncertainty;
- block unsupported action claims;
- prevent sensitive leakage in UI and notifications; and
- use safe rendering against injection.

## 4. Tenant isolation

AI-specific isolation covers:

- retrieval indexes and embeddings;
- vector/document stores;
- caches;
- conversation state;
- memory;
- tool inputs and outputs;
- files;
- evaluations;
- logs and traces;
- event queues;
- model fine-tuning or feedback datasets; and
- analytics.

Tests must attempt direct, indirect, semantic-search, cached, file-based, tool-chained, and multilingual cross-tenant access.

## 5. Permission compliance

- AI never grants itself broader read or write access.
- Summaries respect field-level and record-level restrictions.
- Derived insights must not reveal inaccessible source facts.
- Aggregates require the same or stronger permission as their sensitive inputs.
- Permission changes take effect on the next call.
- Approval does not substitute for missing permission.
- Refusal messages avoid existence leakage.

## 6. Hallucination controls

- Prefer tools for tenant facts.
- Require record provenance for material answers.
- Use deterministic calculation services.
- State when data is unavailable.
- Do not fill missing values with assumptions silently.
- Label forecasts and scenarios.
- Check action completion against the authoritative result.
- Use abstention thresholds for high-impact questions.
- Escalate professional questions appropriately.

## 7. Prompt-injection response

If content instructs VAKA AI to ignore policy, reveal data, change tools, execute actions, or contact an external destination:

- treat it as untrusted record content;
- do not comply;
- continue only with the user-authorised business task;
- limit or quarantine the content;
- record a security signal where appropriate; and
- avoid revealing defensive internals.

## 8. Privacy and provider governance

Before using a provider:

- complete privacy and security assessment;
- define controller/processor roles;
- approve data locations and subprocessors;
- disable provider training/reuse where required;
- set minimal retention;
- establish deletion and incident terms;
- document model/version change policy;
- define availability and exit plan; and
- prohibit secrets and unnecessary sensitive data.

Sensitive use cases may require local/private processing or may remain prohibited.

## 9. High-impact domains

### Finance and accounting

AI does not authoritatively calculate, post, reverse, release money, or alter history. Domain services and authorised humans remain in control.

### Tax, payroll, and legal

AI may explain approved configuration and records but does not certify compliance or replace qualified review.

### Inventory

AI does not bypass availability, costing, movement, or overselling controls.

### HR and people

Employment decisions, sensitive profiling, disciplinary recommendations, and covert monitoring require separate legal/ethical governance and may be prohibited.

### Security

AI must not reveal sensitive controls, credentials, vulnerabilities, or other users’ activity without explicit authorised purpose.

## 10. Transparency

Users should see:

- that output is AI-generated;
- live/preview/experimental status;
- data period and sources;
- material limitations;
- whether an action is draft, pending, queued, completed, partially completed, rejected, or failed;
- approval requirements; and
- a way to report a problem.

## 11. Human oversight

- High-impact output is reviewable before use.
- Users can edit/reject drafts.
- Consequential actions require the defined authority.
- Administrators can disable capabilities and automations.
- Security and support teams can investigate correlation/audit records.
- Incident response can suspend a model, tool, language, tenant cohort, or provider.

## 12. Operational resilience

- Define model/provider timeouts and circuit breakers.
- Use retries only where safe.
- Reconcile unknown action states.
- Maintain non-AI fallback workflows.
- Apply rate, token, and cost budgets.
- Monitor quality drift and provider changes.
- Version prompts, policies, tools, and evaluation sets.
- Test backups/recovery for AI configuration, audit, and memory stores.

## 13. Incident severity examples

### Critical

- cross-tenant exposure;
- unauthorised consequential action;
- leaked credentials;
- corrupted authoritative financial/stock records; or
- inability to stop unsafe automation.

Immediate kill switch, containment, evidence preservation, and incident process required.

### High

- permission bypass without confirmed exposure;
- repeated false action-completion claims;
- material unsafe financial guidance;
- approval replay; or
- serious multilingual refusal failure.

### Medium/low

- tone drift;
- isolated non-material factual error;
- excessive verbosity;
- low-value recommendation; or
- recoverable latency issue.

Severity depends on exposure, impact, duration, and detectability.

## 14. Release blockers

Do not release with:

- known cross-tenant leakage;
- known permission bypass;
- unbounded tools;
- missing confirmation for consequential action;
- inability to distinguish action failure from success;
- unapproved provider data use;
- failing high-impact language evaluation;
- no kill switch;
- no incident owner; or
- hallucination/accuracy performance below the approved threshold.

## 15. Continuous assurance

Run:

- pre-release adversarial evaluation;
- production canaries using synthetic data;
- drift and regression checks;
- red-team exercises;
- incident simulations;
- permission/tenant probes;
- tool and approval replay tests;
- multilingual safety tests; and
- periodic provider reassessment.
