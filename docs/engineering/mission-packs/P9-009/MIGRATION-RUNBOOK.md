# P9-009 Explicit Ownership Migration Runbook

## Purpose and authority

Apply `server/drizzle/0024_explicit_tenant_ownership.sql` before deploying code
that resolves principal-owner authority from `tenant_ownerships`. This is an
identity/security migration. It does not establish legal or beneficial
ownership and must not be used to perform ownership transfer.

## Preconditions

1. Confirm the target is the VAKA database and record the redacted environment,
   release and operator identity.
2. Confirm a current recoverable backup and rollback connection path.
3. Stop or coordinate workspace signup during the short migration window so a
   tenant cannot be created between preflight and migration.
4. Run the ambiguity query below. It must return zero rows:

```sql
SELECT t.id, t.company_name, count(u.id) AS active_system_owner_candidates
FROM tenants t
LEFT JOIN roles r
  ON r.tenant_id = t.id AND r.name = 'Owner' AND r.is_system = true
LEFT JOIN users u
  ON u.tenant_id = t.id AND u.role_id = r.id AND u.status = 'active'
LEFT JOIN tenant_ownerships existing ON existing.tenant_id = t.id
WHERE existing.tenant_id IS NULL
GROUP BY t.id, t.company_name
HAVING count(u.id) <> 1;
```

If the table does not yet exist, omit the `tenant_ownerships` join and `WHERE`
line for preflight. Any result blocks migration and requires a separately
approved identity-recovery decision; never choose an owner by earliest date,
email, activity or role permissions.

## Apply

1. Apply `0024_explicit_tenant_ownership.sql` using the approved migration
   channel and service/database role.
2. The script creates the ownership table and constraints, rejects ambiguity,
   backfills missing tenants and records one migration-source audit event per
   inserted ownership.
3. Do not deploy application code if the migration fails or if any verification
   query below fails.

## Verification

```sql
SELECT
  (SELECT count(*) FROM tenants) AS tenants,
  (SELECT count(*) FROM tenant_ownerships) AS ownerships;

SELECT ownership.tenant_id, ownership.owner_user_id
FROM tenant_ownerships ownership
JOIN users owner ON owner.id = ownership.owner_user_id
WHERE owner.tenant_id IS DISTINCT FROM ownership.tenant_id;

SELECT tenant_id, count(*)
FROM tenant_ownerships
GROUP BY tenant_id
HAVING count(*) <> 1;
```

- Tenant and ownership counts must match.
- The mismatch and duplicate queries must return zero rows.
- Confirm the runtime-schema gate passes.
- Smoke test one explicit owner and one ordinary administrator: the owner may
  open Users & Activity; the administrator is denied. Do not mutate production
  roles solely for smoke testing.
- Confirm signup in staging creates tenant, owner, ownership and both ownership/
  tenant-created audit events atomically.

## Rollback and incident handling

- If migration fails before deployment, keep the old application running,
  preserve evidence and investigate the exact ambiguous tenant records.
- If application deployment fails after successful migration, roll back code;
  retain the additive ownership rows and audit evidence. Do not drop the table
  automatically.
- A temporary return to role-name owner resolution is an explicit security
  regression requiring incident/change approval and a time-bounded remediation.
- Ownership corrections or transfers require a future step-up, notified,
  audited workflow; do not repair them with unreviewed ad-hoc SQL.
