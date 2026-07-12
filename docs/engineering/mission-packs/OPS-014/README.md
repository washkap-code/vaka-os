# OPS-014 — Backup job adapter foundation

**Status:** Implemented; focused and browser verification passed; full suite environment-blocked  
**Programme:** Operations and launch readiness  
**Type:** Operations adapter foundation  
**Depends on:** OPS-013

## Objective

Create the application boundary that can transform a future backup executor result into a validated backup manifest without binding a scheduler, storage provider or infrastructure secret.

## Users and outcome

- User: platform engineering and authenticated VAKA platform administrators.
- Problem: backup manifests can be recorded, but there is no controlled adapter boundary for future automated jobs.
- Outcome: the codebase has a tested adapter that accepts an injected executor, validates its output and exposes the current no-scheduler status in Super Admin.

## Deliverables

1. Add a backup job adapter function that accepts an injected snapshot executor.
2. Build a validated manifest from executor output using the OPS-012/OPS-013 manifest rules.
3. Reject unsafe executor output before it can become evidence.
4. Expose adapter status in the control-centre snapshot.
5. Render adapter status in the Super Admin Operations tab.
6. Add focused tests and documentation.

## Security and privacy boundary

- No scheduler, cron, queue, storage provider, database dump, restore tool or credential binding is implemented.
- The adapter accepts opaque references only and runs the same manifest validation as manual recording.
- Adapter readiness is not backup readiness; it only proves that the application boundary exists.

## Acceptance criteria

- Server/web typecheck passes.
- Focused backup-manifest and control-centre tests pass.
- Web production build passes.
- Master PDF rebuild passes.
- Browser verification shows adapter status as adapter-ready-no-scheduler.

## Rollback plan

Remove the additive adapter function, status object, UI panel, tests and documentation. OPS-013 manifest recording remains intact.
