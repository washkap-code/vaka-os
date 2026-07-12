# OPS-013 — Backup manifest registry and recording API

**Status:** Implemented; focused and browser verification passed; full suite environment-blocked  
**Programme:** Operations and launch readiness  
**Type:** Operations evidence foundation  
**Depends on:** OPS-012

## Objective

Create the first durable registry for backup manifest evidence so future backup jobs can record immutable, privacy-minimised evidence without exposing secrets or backup payloads.

## Users and outcome

- User: authenticated VAKA platform administrator and future platform backup service.
- Problem: the manifest contract exists, but there is no governed place to record backup evidence.
- Outcome: platform administrators can review recent manifests, and future backup automation has a validated API target.

## Deliverables

1. Add a `platform_backup_manifests` table and migration.
2. Add server-side manifest validation for required fields, chronology, failed/partial reasons and forbidden secret-bearing strings.
3. Add platform-admin-only manifest listing and recording endpoints.
4. Record a platform audit event when a manifest is recorded.
5. Show recent backup manifests in the Super Admin Operations tab.
6. Add focused validation tests and update documentation.

## Security and privacy boundary

- The registry stores opaque references, not backup contents, credentials, signed URLs, private keys or tenant business records.
- This mission does not run backups, schedule jobs, perform restores, manage storage, rotate keys or prove disaster recovery.
- Manifest records are evidence inputs. Restore drills and launch sign-off remain separate gates.

## Acceptance criteria

- Server/web typecheck passes.
- Focused admin/control-centre and backup-manifest tests pass.
- Web production build passes.
- Master PDF rebuild passes.
- Super Admin can see recent backup manifests or an empty state.
- Unsafe manifest references are rejected before storage.

## Rollback plan

Remove the additive endpoints, UI panel, tests and migration/table before production use. Existing control-centre and OPS-012 contract visibility remain intact.
