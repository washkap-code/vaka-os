# OPS-016 Restore-evidence Migration Runbook

## Purpose

Apply `server/drizzle/0026_restore_drill_evidence.sql` before deploying routes
or control-centre queries that use restore evidence. The migration is additive
and installs append-only triggers for both drill and review records.

## Preconditions

1. Confirm the target database, redacted environment, release commit and
   operator identity.
2. Confirm a current recoverable backup and tested rollback connection.
3. Confirm OPS-013 backup manifest storage exists and its migration/readiness
   checks pass.
4. Check for incompatible pre-existing table/index/function names:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('platform_restore_drills', 'platform_restore_drill_reviews');

SELECT indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname LIKE 'platform_restore_drill%';
```

On first application these return no rows. On retry, compare the exact deployed
shape with migration `0026`; `CREATE TABLE IF NOT EXISTS` does not repair an
incompatible manually created table.

## Apply and verify

1. Apply `0026_restore_drill_evidence.sql` through the approved migration role.
2. Rerun it in staging to prove idempotency.
3. Run runtime-schema readiness and the focused OPS-016 suite.
4. Verify constraints, triggers and empty initial state:

```sql
SELECT conname
FROM pg_constraint
WHERE conrelid IN (
  'platform_restore_drills'::regclass,
  'platform_restore_drill_reviews'::regclass
)
ORDER BY conname;

SELECT event_object_table, trigger_name
FROM information_schema.triggers
WHERE trigger_name IN (
  'platform_restore_drills_append_only',
  'platform_restore_drill_reviews_append_only'
)
ORDER BY trigger_name;

SELECT
  (SELECT count(*) FROM platform_restore_drills) AS drills,
  (SELECT count(*) FROM platform_restore_drill_reviews) AS reviews;
```

Both append-only triggers must exist. Initial counts should be zero unless the
environment intentionally received controlled evidence after migration.

## Staged smoke test

1. Use a dedicated successful staging backup manifest and two different active
   platform identities: Operations recorder and Principal reviewer.
2. Confirm a tenant user and a read-only platform role cannot record/review.
3. Record a failed/partial drill first and confirm it remains visible and cannot
   be accepted.
4. Record passing evidence, confirm server-calculated RPO/RTO, then accept it as
   the different Principal reviewer.
5. Confirm a second review is refused and direct update/delete attempts fail.
6. Confirm platform audit metadata contains identifiers/status only and no
   target reference, summary, tenant data or credential material.
7. Confirm the control-centre restore gate changes from open to recorded only
   after accepted evidence exists.

Do not manufacture a successful drill solely for a smoke test. Use controlled
staging evidence and retain failed results.

## Rollback and incident handling

- Roll back application/API/UI code first and retain both additive evidence
  tables, triggers and audit records.
- Do not drop or mutate failed/accepted drill evidence during ordinary rollback.
- If a migration defect requires database rollback, export and preserve
  privacy-reviewed evidence, obtain security/operations approval and document
  the chain of custody.
- If secrets or tenant data were entered despite validation, treat it as an
  incident; restrict access, preserve audit, rotate exposed credentials and use
  the approved privacy/security remediation process. Do not silently edit rows.
