# VAKA Product Philosophy

**Status:** Foundational draft
**Owner:** Product
**Last reviewed:** 2026-07-04

## Product premise

VAKA is **The Operating System for African Business**: a connected system through which a business can run, understand, and improve its operations.

The first launch market is Zimbabwe. We will earn the right to expand by solving Zimbabwean business needs with depth, not by building a shallow “Africa-wide” product. At the same time, country-specific behavior must be configurable so that Zimbabwe does not become a permanent technical constraint.

## Start with the outcome

Every initiative begins with a business outcome, not a requested feature.

A valid product brief identifies:

- the customer and user;
- the job they are trying to complete;
- the present obstacle and its cost;
- the desired change in speed, accuracy, control, revenue, cash flow, risk, or confidence;
- how success will be measured; and
- the smallest trustworthy intervention that can create that outcome.

Roadmaps should be expressed primarily as outcomes and evidence. Feature lists are supporting implementation detail.

## Build one connected operating system

CRM, accounting, inventory, billing, reporting, and AI must behave as connected capabilities rather than isolated products. A business event should update all affected domains consistently, with one understandable source of truth.

We prefer:

- complete workflows over disconnected screens;
- explicit business rules over hidden magic;
- shared, reliable records over duplicate data;
- reversible, auditable actions over destructive shortcuts;
- progressive disclosure over unnecessary complexity; and
- useful defaults with controlled configuration.

## Trust by design

Trust is part of the user experience. Users should know:

- what happened;
- who or what caused it;
- what data was used;
- what they are allowed to do;
- whether an action is final or reversible; and
- how to recover when something goes wrong.

Permissions, audit trails, data protection, reliable calculations, backups, exports, and clear error states must be designed with the workflow—not bolted on later.

## African by design, local by configuration

“Built for Africa” does not mean treating Africa as one market. VAKA must accommodate differences in language, currencies, taxes, regulation, connectivity, addresses, document formats, payment methods, and business practice.

For the Zimbabwe launch:

- English, Shona, and Ndebele are required product languages.
- USD and ZWG workflows must remain accurate and auditable.
- Zimbabwean terminology and statutory requirements must be reviewed by qualified local professionals.

Product content must use translation keys or equivalent structured content rather than scattering hard-coded interface copy through components. Locale-specific rules must be separated from core domain logic.

## Mobile and accessibility

Mobile responsiveness is an acceptance criterion for every user-facing feature. Core workflows must work on small screens without hiding essential information or requiring pointer-only interaction.

Design for constrained conditions:

- modest devices;
- intermittent or expensive connectivity;
- touch input;
- readable type and adequate contrast;
- keyboard and assistive technology access;
- clear loading, offline, retry, and error states where relevant.

## AI-first, not AI-for-show

AI earns its place when it improves a business outcome: reducing manual effort, identifying risk, explaining performance, suggesting a next action, or helping a user complete work correctly.

VAKA AI must:

- sound professional, calm, executive, well-spoken, concise, and business-focused;
- use only data the current user is authorised to access;
- separate observed facts, calculations, and recommendations;
- state uncertainty and missing information;
- avoid fabricating transactions, customers, balances, laws, or business performance;
- request confirmation before consequential actions;
- preserve a record of material AI-assisted actions;
- allow human correction and override; and
- be evaluated for accuracy, safety, usefulness, latency, and cost.

AI must not replace deterministic accounting, permission, tax, stock, or workflow rules.

## Definition of ready

Work is ready for implementation only when it has:

- a named user and outcome;
- measurable acceptance criteria;
- required permissions and audit events;
- tenant-isolation implications;
- mobile and accessibility behavior;
- English, Shona, and Ndebele content implications;
- data protection and retention implications;
- failure, retry, and recovery behavior;
- AI boundaries, if AI is involved; and
- relevant professional review needs.

## Definition of done

An initiative is done when the intended outcome is testable; security and tenant boundaries are enforced; business records remain consistent; mobile behavior works; user-facing text is localisation-ready; audit and operational needs are met; documentation is updated; and relevant checks pass.

## Current assumptions

- VAKA initially serves Zimbabwean SMEs and may later support organisations of different sizes and African markets.
- The existing application is valuable groundwork and should be evolved incrementally, not rewritten before evidence identifies a need.
- The current single React application and Express API are an implementation starting point, not permanent architectural doctrine.
- The existing ledger, tenant, RBAC, audit, white-label, and suspend-then-escrow decisions are intentional product strengths.
- Localisation, comprehensive mobile responsiveness, and VAKA AI are target capabilities that are not yet fully implemented.
