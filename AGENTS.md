# VAKA OS Repository Instructions

## Mission

VAKA means **“build” in Shona**.

Build VAKA as **“The Operating System for African Business.”** It is **designed in Zimbabwe and built for Africa**. Zimbabwe is the first launch market, not the limit of the brand or architecture.

VAKA is not merely a CRM, accounting, and inventory application. Every contribution should move it toward a trusted, connected operating system through which African businesses can run, understand, and improve their operations.

## Required reading

Before changing product behavior or architecture, read:

1. `docs/00-foundation/VAKA-CONSTITUTION.md`
2. `docs/00-foundation/PRODUCT-PHILOSOPHY.md`
3. `docs/00-foundation/BRAND-POSITIONING.md`
4. `docs/03-technical/CODING-STANDARDS.md`
5. The domain-specific source and relevant documents in `docs/`

Repository instructions closer to a changed file may add constraints but must not silently override the VAKA Constitution.

## How to work in this repository

- Inspect the existing implementation before proposing or making changes.
- Document material assumptions and distinguish current behavior from target behavior.
- Do not rewrite the existing application unless an approved task explicitly calls for a rewrite with evidence, migration, and rollback plans.
- Keep changes focused. Preserve unrelated work and existing verified behavior.
- Prefer incremental improvements that keep the product deployable.
- Do not claim a capability exists merely because it is documented as a goal.
- Update relevant master documents when architecture, behavior, security, localisation, AI, operations, or policy changes.

## Product requirements

VAKA must be:

- multi-tenant;
- secure;
- scalable;
- AI-first;
- mobile-responsive; and
- localisation-ready.

The platform must support **English, Shona, and Ndebele**. New user-facing work must be designed for translation and must not make future markets depend on rewriting core business logic.

Every feature must be outcome-driven, not feature-driven. Before implementation, identify the user, business problem, desired measurable outcome, permissions, audit needs, mobile behavior, localisation impact, failure behavior, and data-protection implications.

## Product invariants

- Enforce tenant isolation on every tenant-owned read and write, including jobs, exports, files, caches, integrations, and AI context.
- Derive tenant identity and permissions from authenticated server context.
- Keep `journal_lines` and `stock_movements` append-only.
- Correct posted history with reversing or offsetting entries.
- Perform related CRM, accounting, inventory, billing, numbering, and audit effects atomically.
- Use exact financial arithmetic and snapshot historical exchange rates and costs.
- Preserve immutable sequential document numbers and complete audit trails.
- Refuse stock overselling and roll back the full linked operation on failure.
- Preserve suspend-then-escrow behavior: never delete client data for non-payment; retain allowed read, billing, and export access.
- Treat trust, auditability, data protection, permissions, reliability, backup, and recovery as product features.

## VAKA AI

VAKA AI must sound **professional, calm, executive, well-spoken, concise, and business-focused**.

AI must:

- use only data and actions permitted for the current tenant and user;
- distinguish facts, calculations, inferences, and recommendations;
- state uncertainty and never invent business data;
- preserve deterministic accounting, stock, permission, tax, and workflow rules;
- require confirmation for consequential actions;
- make material actions auditable; and
- fail safely when models, tools, or context are unavailable.

Never send secrets, unnecessary personal data, or cross-tenant information to an AI provider.

## Code conventions

- Use TypeScript and follow established patterns in the surrounding module.
- Avoid `any`; isolate and justify unavoidable uses.
- Validate untrusted input at API boundaries.
- Enforce authorization and lifecycle rules server-side; the UI is not a security boundary.
- Separate domain rules from locale, presentation, transport, market, and external-provider concerns.
- Never commit secrets, credentials, production data, or populated `.env` files.
- Update `.env.example` when configuration requirements change.
- Add or update tests for domain rules, accounting, inventory, billing, authentication, authorization, tenant isolation, audits, localisation, mobile behavior, AI boundaries, and cross-module transactions as applicable.

## Current-state assumptions

Inspection on 2026-07-04 found a TypeScript/Express/PostgreSQL backend and React/Vite frontend with tenant scoping, RBAC, audit logs, append-only ledgers, transactional business workflows, USD/ZWG support, white-label branding, and critical-path tests.

It also found no complete English/Shona/Ndebele localisation framework, no implemented VAKA AI layer, and only partial evidence of mobile responsiveness. Treat these as planned capabilities requiring design and implementation—not completed features. Validate repository state again before acting because the code may have changed.

## Verification

Run checks relevant to the files changed:

```bash
cd server
npm test

cd ../web
npm run build
```

Also test tenant boundaries, permissions, rollback behavior, audit events, relevant locales, mobile widths, accessibility, and AI failure cases when affected.

Report any check that could not be run and why. Never claim verification for a check that was skipped or failed.

## Professional review

Legal, tax, accounting, privacy, security, localisation, and regulatory statements may require qualified review in each launch market. Label assumptions and unresolved review points; do not present templates or AI output as professional approval.
