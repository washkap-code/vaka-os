# OPS-012 — Backup manifest contract foundation

**Status:** Implemented; focused and browser verification passed; full suite environment-blocked  
**Programme:** Operations and launch readiness  
**Type:** Operations evidence contract  
**Depends on:** OPS-011

## Objective

Define the backup manifest evidence contract that future backup jobs must emit, and expose it in Super Admin without claiming that backup automation is live.

## Users and outcome

- User: authenticated VAKA platform administrator with no tenant context.
- Problem: backup readiness needs a concrete evidence shape before backup jobs and restore drills can be accepted.
- Outcome: administrators and implementers can see the required manifest fields, forbidden content, acceptance rules and current non-implemented status.

## Deliverables

1. Add a typed backup manifest contract to the platform control-centre backend.
2. Include the contract in the protected control-centre API response.
3. Render the contract in the Super Admin Operations tab.
4. Add tests proving the contract is defined as not implemented and does not include secret-bearing field patterns.
5. Update the Super Admin guide and mission index.

## Security and privacy boundary

- No backup contents, tenant business payloads, credentials, tokens, private keys or signed storage URLs are exposed.
- Snapshot references must be opaque non-secret references.
- This mission does not create backup jobs, storage buckets, restore workflows, retention engines or infrastructure credentials.

## Acceptance criteria

- Server/web typecheck passes.
- Focused control-centre tests pass.
- Web production build passes.
- The Operations tab shows the backup manifest contract and its defined-not-implemented status.
- The contract states that restore testing remains separate evidence.

## Rollback plan

Remove the additive contract fields, UI panel, strings and tests. OPS-010 and OPS-011 remain intact.
