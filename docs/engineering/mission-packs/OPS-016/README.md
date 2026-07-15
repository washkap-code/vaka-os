# OPS-016 — Controlled restore-drill evidence and review

**Status:** Implementation complete; local schema, security, server and web gates passed; remote release pending
**Programme:** Operations and launch readiness
**Type:** Immutable recovery-evidence workflow
**Depends on:** OPS-011 through OPS-014; approved RPO/RTO policy remains an
external launch decision

## Outcome

Give authorised VAKA operations staff a controlled way to record the outcome
of a restore drill against a previously recorded backup manifest, and give the
Principal Administrator a separate one-time review decision. The workflow must
make missing or failed evidence visible without claiming that VAKA executed,
scheduled or independently witnessed the restore.

## User and business problem

**Users:** platform operations staff who execute a controlled restore outside
the application; the Principal Administrator who reviews launch evidence.

**Problem:** the control centre describes restore testing as an open gate but
cannot record which backup was tested, achieved recovery point/time, integrity
checks, failure evidence or accountable review.

**Measurable outcome:** a drill can be linked to one successful immutable backup
manifest, validated and recorded once; a different principal reviewer can
accept only fully passing evidence or reject it with a reason; permissions,
audit, privacy, fresh-schema and full regression tests pass.

## Scope

1. Add append-only `platform_restore_drills` evidence linked to
   `platform_backup_manifests`.
2. Capture a stable drill ID, scenario, isolated target reference, start/end,
   target and achieved recovery points, target RPO/RTO, outcome, six bounded
   integrity checks, safe summary/failure reason, operator identity and recorder.
3. Compute achieved RPO/RTO server-side and store exact integer minutes.
4. Reject future/impossible timestamps, environment mismatch, non-successful
   backup manifests, unsafe references and unbounded/free-form payloads.
5. Add append-only `platform_restore_drill_reviews`, one decision per drill.
6. Enforce segregation: the recorder cannot review the same drill; acceptance
   requires succeeded outcome, RPO/RTO within target and all required integrity
   checks true.
7. Add platform-only list, record and review APIs with existing least-privilege
   permissions and full platform audit evidence.
8. Show recent drills, computed results, review state and accessible record/
   review controls in the Super Admin Operations area.
9. Update the operations evidence gate from “not recorded” only when accepted
   drill evidence exists in the database; do not hard-code a passed claim.
10. Add migration/runbook, tests and completion evidence.

## Permissions

- `platform.backups.read`: list privacy-minimised restore drill evidence.
- `platform.backups.write`: record a completed drill against a backup manifest.
- `platform.security.manage`: accept or reject a recorded drill.
- The recording actor and review actor must be active platform workforce users.
- Tenant users receive no route, row or aggregate access.
- Principal/platform status never grants routine tenant data access.

## Evidence contract

Scenarios are `FULL_DATABASE`, `POINT_IN_TIME` and `DATABASE_AND_OBJECTS`.
Outcomes are `SUCCEEDED`, `PARTIAL` and `FAILED`. Review decisions are
`ACCEPTED` and `REJECTED`.

Required integrity controls:

- backup checksum verified;
- database schema verified;
- tenant-isolation probes passed;
- audit continuity verified;
- sampled ledger journals balance; and
- object recovery verified when the scenario includes objects.

The application records operator assertions and calculations. It does not
independently prove the underlying restore or replace infrastructure telemetry,
qualified accounting review, security review or disaster-recovery sign-off.

## Invariants and failure behaviour

- The source backup manifest must exist and have status `succeeded`.
- Drill and source manifest environments must match exactly.
- `completedAt` must follow `startedAt`; target and achieved recovery points
  must not be in the future or after drill completion.
- Achieved RTO is ceiling(`completedAt - startedAt`) in minutes.
- Achieved RPO is ceiling(max(0, `targetRecoveryPointAt - recoveredThroughAt`))
  in minutes; an achieved point after the target is recorded as zero data loss.
- Target RPO/RTO must be explicit positive integers; they are not hard-coded to
  one country, provider or subscription tier.
- A `SUCCEEDED` drill requires all applicable integrity checks true. Partial or
  failed evidence requires a failure reason.
- No drill or review update/delete API exists. Corrections require a new drill.
- Duplicate drill IDs and duplicate review decisions fail atomically.
- Acceptance fails closed unless every acceptance rule is satisfied.

## Security, privacy and audit

- Store opaque non-secret backup/target references only; reject URLs,
  credentials, tokens, private keys, connection strings and signed URLs.
- Do not store restored tenant payloads, customer data, row samples, journal
  contents, passwords, keys, dump output or infrastructure secrets.
- Record `platform.restore_drill_recorded`,
  `platform.restore_drill_accepted` or `platform.restore_drill_rejected` with
  identifiers and status only.
- The review record preserves decision, actor, timestamp and bounded reason.
- Database constraints backstop lifecycle and metric bounds.

## Mobile, accessibility and localisation

- Operations tables must preserve the existing responsive scroll region,
  keyboard access, visible focus, labelled fields and status text (not colour
  alone).
- Record/review forms must work at 320 CSS pixels without hidden actions.
- All new copy belongs to the existing English catalogue and is structured for
  Shona/Ndebele translation; no business rule depends on display text.

## Deliberate exclusions

- Running `pg_restore`, PITR, object restoration or tenant queries.
- Scheduling backups or drills, binding storage, cloud or database providers,
  managing credentials, sending alerts or changing DNS/failover state.
- Hard-coding the draft runbook’s RPO ≤15 minutes/RTO ≤4 hours as approved
  policy.
- Editing backup manifests, financial records, journal lines, stock movements
  or tenant data.
- Declaring launch readiness from a recorded but unreviewed drill.

## Verification

- legacy and fresh schema migration plus idempotency;
- metric and timestamp boundary tests;
- unsafe reference and secret rejection;
- backup status/environment mismatch denial;
- recorder/reviewer segregation and duplicate-review denial;
- acceptance fail-closed negatives for each integrity/RPO/RTO rule;
- tenant and delegated-platform permission denial;
- audit redaction and append-only/no-mutation surface;
- server full suite/typecheck and web accessibility/design/build gates;
- mobile-width browser verification when an authenticated browser is available;
- dependency, secret and diff integrity scans.

## Release and rollback

Production requires backup, migration review, remote CI, staged record/review
evidence, deployment verification and live permission smoke tests. Roll back
application routes/UI first and retain additive evidence tables and audit logs.
Never delete drill evidence merely to remove a failed launch gate.
