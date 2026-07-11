# ADR-004 - Programme and Mission ID namespace

**Status:** Accepted  
**Date:** 2026-07-11  
**Owner:** Programme Office

## Context

The source chat contains several illustrative P1 mission sequences that collide with IDs already committed to the repository. The current Master Build Plan also uses P6-P10 differently from the earlier Book Three programme list.

## Decision

Committed repository IDs are permanent and authoritative:

- P1-001 Platform Kernel Foundation
- P1-002 Identity and Audit Adapters
- P1-003 Audit Facade Adoption Seam
- P2-001 Zimbabwe Country Pack Engine

Illustrative chat numbering is superseded and must never be reused. The canonical programme namespace is maintained in Book 24 and the Mission Register. New mission IDs are allocated once, even if a mission is cancelled.

Programme families are semantic, not calendar years. Cross-programme work uses dependency links rather than renumbering existing missions. A preferred mission fits one review session and one reversible pull request. Work expected to exceed three engineering days must be decomposed or carry an approved exception.

Each mission record has four independent states:

- definition;
- implementation;
- verification; and
- availability.

“Complete” requires a Completion Report and applicable gate evidence; a merged file alone is not enough.

## Consequences

The master plan, mission index, Completion Reports, and release evidence must be reconciled in the same change that alters mission status.

## Rollback

IDs remain reserved. A successor ADR may change future prefixes but may not reuse historical IDs.
