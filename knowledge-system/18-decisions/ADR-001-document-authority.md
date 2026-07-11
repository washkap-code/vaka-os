# ADR-001 - Document authority and precedence

**Status:** Accepted  
**Date:** 2026-07-11  
**Owner:** VAKA leadership and Architecture Office

## Context

`docs/README.md` describes `docs/` as the canonical product and engineering documentation, while the VAKA Knowledge System describes itself as the authoritative source of truth. Both collections contain useful material, but an implementation agent cannot safely resolve a contradiction without an explicit precedence model.

## Decision

The VAKA Knowledge System is the governed control plane: it owns indexes, authority, ontology, canonical terminology, decision records, programme status, and traceability. The `docs/` tree is the canonical specification and evidence plane: it owns detailed product, technical, finance, security, execution, operational, and blueprint documents.

Neither collection may silently duplicate an editable rule. Knowledge-System records point to the authoritative detailed document in `docs/`. Generated consolidations and PDFs are presentation artifacts and never override their sources.

Precedence, from highest to lowest, is:

1. law, binding regulation, and approved professional advice;
2. `AGENTS.md` and the VAKA Constitution;
3. accepted ADRs and the authoritative Finance & Accounting Intelligence Architecture;
4. accepted policies, architecture standards, and country-pack controls;
5. approved PRDs and Mission Packs;
6. implementation and tests;
7. generated summaries, consolidated books, presentations, and PDFs.

When two sources at the same level conflict, implementation stops at the conflict and an ADR or owner decision resolves it. Newer text does not automatically supersede older text.

## Consequences

- The Master Programme Blueprint is stored under `docs/06-master-programme-blueprint/` and registered from the Knowledge System.
- Every generated artifact carries a source manifest and generation date.
- Status claims must link to implementation and verification evidence.
- Existing detailed documents remain in place; this decision does not trigger a rewrite.

## Rollback

Supersede this ADR with a migration plan that identifies every affected link and owner. Do not move documents until redirects and traceability checks pass.
