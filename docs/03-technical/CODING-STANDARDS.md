# VAKA Coding Standards

**Status:** Foundational draft
**Owner:** Engineering
**Last reviewed:** 2026-07-04

## 1. Scope

These standards apply to humans and AI agents changing VAKA OS. They supplement `AGENTS.md`, the VAKA Constitution, and security, architecture, database, and localisation documents.

Do not rewrite the existing application merely to match this document. Improve it incrementally, preserve verified behavior, and propose architectural changes separately with evidence, migration steps, and rollback plans.

## 2. Current technical baseline

Repository inspection on 2026-07-04 found:

- Node.js, Express, TypeScript, Drizzle ORM, and PostgreSQL in `server/`;
- React, Vite, TypeScript, and plain CSS in `web/`;
- tenant-scoped domain tables and service queries;
- JWT authentication, tenant lifecycle gates, and role-based permissions;
- append-only journal and stock movement patterns;
- transactional accounting, invoicing, inventory, signup, and billing workflows;
- audit logging and tenant data export;
- USD and ZWG support with transaction exchange-rate snapshots;
- Vitest/Supertest critical-path tests;
- English strings embedded directly in UI and API code;
- no established localisation library or VAKA AI implementation; and
- partial responsive styling, with no evidence that every authenticated workflow is mobile-ready.

Treat this list as an inspection record, not a complete security or architecture audit.

## 3. General engineering rules

- Use TypeScript and maintain strict, meaningful types. Avoid `any`; isolate and justify unavoidable uses.
- Follow the patterns of the module being changed unless a documented refactor is in scope.
- Keep changes focused, reviewable, and reversible.
- Separate domain rules from transport, presentation, locale, and provider-specific code.
- Validate untrusted input at every system boundary.
- Use structured errors with safe user messages; do not expose secrets, stack traces, tenant existence, or internal identifiers unnecessarily.
- Never commit credentials, tokens, production data, or populated `.env` files.
- Update `.env.example` and documentation when configuration changes.
- Add dependencies only when their maintenance, security, bundle, licence, and operational costs are justified.

## 4. Multi-tenancy and permissions

- Every tenant-owned read and write must derive tenant context from authenticated server state, not client-submitted tenant IDs.
- Scope queries by tenant even when a globally unique record ID is supplied.
- Cross-tenant access must return a safe not-found or forbidden result without revealing record existence.
- Enforce permissions server-side. UI visibility is convenience, not security.
- Platform-administrator paths must be explicit, minimal, and audited.
- Tests must cover cross-tenant access for new tenant-owned resources and workflows.
- Background jobs, exports, AI retrieval, caches, logs, files, and integrations are tenant boundaries too.

## 5. Data integrity and auditability

- Keep `journal_lines` and `stock_movements` append-only.
- Correct posted history with reversals or offsetting entries, never destructive edits.
- Store money in exact decimal or integer-minor-unit representations; never use floating-point arithmetic for financial results.
- Snapshot exchange rates, costs, tax inputs, and other historical calculation inputs at transaction time.
- Keep related CRM, accounting, stock, billing, document numbering, and audit effects in one database transaction.
- Preserve immutable sequential document numbers once issued.
- Require reasons for consequential corrections and include them in audit metadata.
- Schema changes require explicit migrations, compatibility consideration, backup awareness, and rollback planning.

## 6. Security and data protection

- Apply least privilege to users, services, database access, and third-party integrations.
- Use secure, environment-provided secrets; development fallbacks must never be valid for production.
- Protect personal, financial, authentication, and commercially sensitive data in transit and at rest.
- Minimise collected data and define retention and deletion behavior.
- Avoid sensitive values in logs, analytics, prompts, model output, and error messages.
- Review authentication, authorization, CORS, rate limits, abuse controls, dependencies, and audit coverage before production release.
- Obtain qualified review for legal, tax, accounting, privacy, and regulatory assumptions.

## 7. Localisation

- All new user-facing copy must be localisation-ready; do not add scattered hard-coded UI text where translation keys or structured content should be used.
- English, Shona, and Ndebele are required locales.
- Store stable machine values independently from translated labels.
- Use locale-aware formatting for dates, times, numbers, currencies, pluralisation, and sorting.
- Keep country rules—tax, statutory fields, documents, numbering, payment methods, and terminology—behind explicit market configuration.
- Do not infer a user’s preferred language from ethnicity, name, or location.
- Ensure translated layouts tolerate text expansion and remain accessible on small screens.
- Require appropriate human review for financial, legal, security, and culturally sensitive translations.

## 8. Mobile-responsive and accessible interfaces

- Design and test from small screens upward.
- Core workflows must not rely on hover, wide tables, precise pointer input, or desktop-only navigation.
- Provide accessible names, focus states, keyboard operation, semantic structure, sufficient contrast, and readable sizing.
- Tables need a deliberate small-screen treatment such as prioritised columns, cards, or controlled horizontal scrolling.
- Test loading, empty, error, retry, permission-denied, and offline/interrupted states.
- Avoid excessive payloads and unnecessary requests; design for variable devices and network quality.

## 9. AI engineering

AI must augment deterministic business logic, not replace it.

- Authorise AI data retrieval and actions using the same tenant and permission model as the rest of VAKA.
- Never place cross-tenant data, unnecessary personal data, secrets, or credentials in model context.
- Use structured tool inputs and outputs for business actions.
- Require explicit confirmation for consequential writes, payments, postings, stock changes, permissions, exports, or communications.
- Record the model/provider version, relevant instruction version, tool actions, actor, and outcome for material AI-assisted actions, subject to privacy and retention rules.
- Separate facts, calculations, inferences, and recommendations in user-facing output.
- Implement timeouts, cost limits, rate limits, retries, graceful degradation, and safe failure behavior.
- Evaluate accuracy, hallucination, permission leakage, prompt injection, harmful actions, localisation quality, latency, and cost before release.
- VAKA AI copy must be professional, calm, executive, well-spoken, concise, and business-focused.

## 10. Testing and verification

Every change needs checks proportionate to its risk.

At minimum:

- unit-test new domain rules and calculations;
- integration-test database transactions and rollback behavior;
- test authorization, tenant isolation, lifecycle states, and audit events;
- test English, Shona, and Ndebele rendering when localisation is affected;
- test representative mobile widths and keyboard interaction for UI changes;
- test AI features with allowed, denied, ambiguous, adversarial, and failure scenarios;
- run backend critical-path tests for backend changes; and
- run the frontend production build for frontend changes.

Current commands:

```bash
cd server
npm test

cd ../web
npm run build
```

Report skipped or failed checks plainly. “Build passes” is not evidence that business rules, security, mobile behavior, or localisation are correct.

## 11. Documentation and decisions

- Read relevant master documents before changing behavior.
- Update documentation in the same change when architecture, operations, policy, security, localisation, AI behavior, or user workflows change.
- Record significant architectural decisions with context, alternatives, consequences, migration, and rollback.
- Label assumptions. Validate them before they become irreversible implementation decisions.
