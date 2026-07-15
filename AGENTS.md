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

## Session Handoff Protocol (mandatory)

1. **Start of every session:** read `docs/engineering/SESSION-HANDOFF.md` before any other work. It is the authoritative record of current state, migration ledger, shipped work, and stale branches.
2. **End of every session:** update `docs/engineering/SESSION-HANDOFF.md` (date, shipped work, migration ledger, next steps, blockers, stale branches) and commit it as the **final commit** of the session. Commit message convention: `chore(handoff): session handoff YYYY-MM-DD`.
3. A session is not complete until the handoff commit exists. If the handoff is stale relative to `git log`, the previous session ended abnormally — reconcile from git history before starting new work.
4. The sandbox has no push credentials: commit locally via shell git; the user pushes via GitHub Desktop.

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

## Authoritative Finance Rule

The [VAKA Finance & Accounting Intelligence Architecture](docs/06-master-programme-blueprint/books/08-finance-and-accounting/README.md) is the authoritative source of truth for all accounting, ledger, tax, currency, reporting, AI finance, and compliance work.

Do not create or modify accounting behaviour that conflicts with it.

Preserve:

- immutable ledger principles;
- double-entry accounting;
- tenant isolation;
- future legal-entity isolation;
- posting controls;
- currency snapshots;
- audit requirements;
- AI authority boundaries; and
- reversal-only corrections.

## Critical Accounting Rules

1. No posted financial transaction may be edited in place.
2. Corrections must be made by reversal, credit note, debit note, correcting journal, or controlled adjustment.
3. Every posted journal must balance: total debits must equal total credits.
4. Operational modules must not write directly to ledger tables.
5. All financial write paths must go through approved services.
6. AI must not post directly to the ledger.
7. Tax rates must not be hard-coded into product or invoice logic.
8. Currency rules must not be hard-coded to USD or ZWG only.
9. Every material financial action must produce an audit event.
10. Tenant data must never leak across tenants.

## Phase 0 Finance Rule

During Phase 0 finance work, do not implement new accounting features unless explicitly requested.

Phase 0 is an audit, mapping, and risk-identification phase.

Allowed work:

- inspect repository;
- document current architecture;
- identify financial write paths;
- identify risks;
- identify schema gaps;
- add non-invasive tests where safe;
- propose migration plans; and
- document future implementation steps.

Not allowed in Phase 0 unless explicitly approved:

- rewriting journal posting;
- changing tax calculations;
- changing currency logic;
- deleting existing accounting tables;
- replacing the ledger;
- introducing new financial behaviour;
- changing production routes; and
- changing existing financial balances.

## Finance Readiness Questions

No future VAKA Finance feature should be accepted unless it answers:

1. What accounting event does this create?
2. What journal does it produce?
3. Which legal entity owns it?
4. What currency treatment applies?
5. What tax treatment applies?
6. What audit event is recorded?
7. Can it be reversed?
8. Can it be explained?
9. Can AI touch it?
10. What permission is required?

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

It also found no complete English/Shona/Ndebele localisation framework, no implemented VAKA AI layer, and only partial evidence of mobile responsiveness. The repository now has a PWA installability/static-shell foundation, a camera-friendly capture inbox, and server-side session/presence controls, but native apps, encrypted offline sync, OCR, refresh-token rotation, MFA, explicit owner identity, and complete activity coverage remain incomplete. Treat planned capabilities as requiring design and implementation—not completed features. Validate repository state again before acting because the code may have changed.

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
