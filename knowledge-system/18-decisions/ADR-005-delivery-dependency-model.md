# ADR-005 - Dependency-driven delivery and release gates

**Status:** Accepted  
**Date:** 2026-07-11  
**Owner:** Engineering and Programme Office

## Decision

VAKA delivery follows a dependency graph, not a single multi-year serial queue. Platform contracts, finance integrity, CRM, inventory, experience, AI safety, security, and operational hardening may progress in parallel when their declared dependencies are satisfied.

Release gates remain serial for a given capability:

1. outcome and authority accepted;
2. Mission Pack ready;
3. implementation and migration complete;
4. automated verification passed;
5. required security, professional, accessibility, localisation, and operational review passed;
6. staged release and rollback rehearsed;
7. availability explicitly approved;
8. post-release evidence recorded.

The main branch must remain deployable. One mission normally maps to one pull request, one review decision, and one merge. Related documentation and tests ship with the mission.

Architecture and requirements documentation precede implementation. API, user, operations, release, and completion evidence are updated with or immediately after code in the same mission boundary.

## Consequences

The strict Book Three product ordering becomes a logical dependency map rather than a prohibition on safe parallel work. Advanced VAKA Intelligence remains gated, but shared AI governance and read-only foundations may precede Network and other later products.

## Rollback

Reverting to fully serial delivery requires evidence that dependency-driven delivery is creating unacceptable integration or governance risk.
