# Runbook: VAKA database backup and restore

**Owner:** VAKA Operations | **Frequency:** Nightly backup; restore drill monthly and before launch
**Last Updated:** 2026-07-16 | **Last Production Run:** Not performed by LP-006

## Purpose

This runbook creates encrypted, locally retained PostgreSQL backups, verifies
that a backup restores into a throwaway database, and controls an authorised
restore into an explicitly named target. Backup and recovery are trust
features: a backup is not accepted merely because `pg_dump` exited zero; the
restore drill must also reproduce the expected 0045-equivalent schema and the
10-table sanity signature.

The current VAKA document adapters store capture documents and workspace-file
payloads inside PostgreSQL, protected in `capture_documents.data_url` and
`workspace_document_versions.data_url`. They are therefore included in the
database dump. `BACKUP_UPLOADS_DIR` remains available for a deployment that
also uses a local filesystem document directory; when set, that directory is
archived beside the dump.

## Production identity and safety boundary

The dedicated production project is **`vaka-os-prod`**, Supabase project
reference **`ewljdjvqngxweacgwedu`**. The restore safety rail recognises:

- the database or logical name `vaka-os-prod`;
- the project reference in either a direct hostname or pooler username;
- optional `PRODUCTION_DATABASE_NAME` and `PRODUCTION_PROJECT_REF` overrides;
- the former `vaka-platform` name and `kjabilwcdwpncthbskvy` reference during
  the cutover hold period.

Matching any protected marker refuses the restore before connecting to the
target unless `--i-know-this-is-production` is supplied. `--yes` only bypasses
the confirmation prompt; it never bypasses this rail.

## Prerequisites

- [ ] Run from a controlled operations host with the VAKA repository checked
  out at the deployed release.
- [ ] Install Bash, Node.js, `psql`, `pg_dump` and `pg_restore`. PostgreSQL
  client tools must be the same major version as production or newer.
- [ ] Use a direct or session-pooler PostgreSQL URL for backup. Transaction
  poolers cannot safely hold the exported snapshot used by `pg_dump` and the
  manifest signature.
- [ ] Store `DATABASE_URL` and `BACKUP_ENCRYPTION_KEY` in the operations secret
  store. The backup key must be independent from JWT, MFA, capture and Paynow
  keys, and recoverable under the incident-access process.
- [ ] Create `BACKUP_DIR` on encrypted storage, owned by the backup service
  account and mode 0700.
- [ ] For optional S3-compatible replication, install the AWS CLI and provision
  least-privileged write credentials for one backup prefix.
- [ ] For a restore drill, provide a local or explicitly approved
  non-production PostgreSQL administrator URL capable of creating and dropping
  throwaway databases. Never use either protected production project.

## Configuration

Create `/etc/vaka/backup.env` with mode 0600. Values below are names and
examples only; do not commit the populated file.

```bash
DATABASE_URL="postgresql://BACKUP_ROLE:SECRET@DIRECT_OR_SESSION_HOST:5432/postgres?sslmode=require"
BACKUP_DIR="/var/backups/vaka"
BACKUP_RETENTION_DAYS="14"
BACKUP_ENCRYPTION_KEY="LOAD_FROM_SECRET_STORE"

# Set only when a deployment stores additional files on local disk.
BACKUP_UPLOADS_DIR=""

# Optional S3-compatible copy. Local artifacts are retained even when enabled.
BACKUP_S3_URI="s3://vaka-backups/production"
BACKUP_S3_ENDPOINT_URL="https://s3-compatible.example"
AWS_ACCESS_KEY_ID="LOAD_FROM_SECRET_STORE"
AWS_SECRET_ACCESS_KEY="LOAD_FROM_SECRET_STORE"
AWS_DEFAULT_REGION="eu-west-2"

PRODUCTION_DATABASE_NAME="vaka-os-prod"
PRODUCTION_PROJECT_REF="ewljdjvqngxweacgwedu"
```

Recommended retention is 14 daily local copies. Apply a separate object-store
lifecycle of at least 35 daily copies plus the agreed monthly/annual retention.
Retention and privacy periods require owner and professional review before
launch. Encryption must be enabled for every production backup.

## Procedure

### Step 1: Confirm tool and target readiness

```bash
cd /srv/vaka-os
pg_dump --version
pg_restore --version
psql --version
stat -f '%Sp %N' /etc/vaka/backup.env 2>/dev/null || stat -c '%A %n' /etc/vaka/backup.env
```

**Expected result:** PostgreSQL clients are present and the environment file is
readable only by its owner.

**If it fails:** stop. Install a compatible PostgreSQL client or correct file
ownership; never copy secrets into shell history or the repository.

### Step 2: Run a manual backup

```bash
cd /srv/vaka-os
set -a
source /etc/vaka/backup.env
set +a
./scripts/backup.sh
```

**Expected result:** the final line is one JSON event with
`"event":"backup.succeeded"`. The artifact name follows
`vaka-YYYYMMDDTHHMMSSZ-GITSHA.dump.enc`; its encrypted manifest has the same
prefix and `.manifest.json.enc`. A configured local documents directory adds
`.documents.tar.gz.enc`. Local artifacts remain even after an S3 upload.

**If it fails:** search the same output for `backup.failed` and its safe `step`
field. Correct only that prerequisite, then rerun. Do not treat a partial file
or an object-store upload alone as a valid backup.

### Step 3: Schedule the nightly backup

Install this exact cron entry for the dedicated backup account after replacing
`/srv/vaka-os` only if the deployment path differs:

```cron
15 1 * * * cd /srv/vaka-os && /usr/bin/env bash -lc 'set -a; source /etc/vaka/backup.env; set +a; ./scripts/backup.sh' >> /var/log/vaka-backup.log 2>&1
```

**Expected result:** one encrypted backup set is created at 01:15 UTC daily;
local files older than `BACKUP_RETENTION_DAYS` are pruned only after dump,
manifest, encryption and optional upload succeed.

**If it fails:** disable repeated retries that could flood storage, retain the
last known-good set, and investigate using the troubleshooting table. Alert on
any `backup.failed` or on the absence of `backup.succeeded` for 26 hours.

### Step 4: Verify a backup with a throwaway restore

Use a local PostgreSQL instance for the routine drill. The admin URL must not
point to `vaka-os-prod` or the legacy hold project.

```bash
cd /srv/vaka-os
set -a
source /etc/vaka/backup.env
set +a
export VERIFY_ADMIN_DATABASE_URL="postgresql://vaka_restore:SECRET@127.0.0.1:5432/postgres"
./scripts/verify-backup.sh \
  --backup "/var/backups/vaka/vaka-YYYYMMDDTHHMMSSZ-GITSHA.dump.enc" \
  --admin-url "$VERIFY_ADMIN_DATABASE_URL"
```

**Expected result:** the script creates a uniquely named test database,
restores the dump, verifies `0045_schema_runtime_alignment`, compares all ten
row counts with the manifest, prints `backup.verification.succeeded`, and drops
the throwaway database on success or failure.

**If it fails:** preserve the backup set and log, confirm the matching manifest
and encryption key, then retry on a clean local PostgreSQL 16+ instance. A
signature mismatch means the set is not accepted. Escalate rather than editing
the manifest or weakening the check.

For an approved remote non-production drill, add `--allow-remote-admin`. The
flag never permits either protected production project.

### Step 5: Restore into an explicitly named non-production target

This operation replaces existing objects in the target. The interactive form
is preferred:

```bash
cd /srv/vaka-os
set -a
source /etc/vaka/backup.env
set +a
export RESTORE_TARGET_DATABASE_URL="postgresql://vaka_restore:SECRET@127.0.0.1:5432/vaka_restore_test"
./scripts/restore.sh \
  --backup "/var/backups/vaka/vaka-YYYYMMDDTHHMMSSZ-GITSHA.dump.enc" \
  --target-url "$RESTORE_TARGET_DATABASE_URL"
```

Review the printed host and database, then type `RESTORE`. Automation may add
`--yes`, but only for a pre-created non-production target.

**Expected result:** restore succeeds atomically, migration status is 0045,
and the ten row counts are printed.

**If it fails:** do not route traffic to the target. Keep the failed target for
diagnosis only if it contains no production data; otherwise restrict access
and follow incident evidence-preservation rules.

### Step 6: Production recovery (incident/change approval only)

The following flag exists for an authorised disaster-recovery event; it is not
a routine command:

```bash
./scripts/restore.sh \
  --backup "/secure/path/approved-vaka-backup.dump.enc" \
  --target-url "$AUTHORITATIVELY_CONFIRMED_PRODUCTION_DATABASE_URL" \
  --i-know-this-is-production
```

Do not add `--yes`. Two people must verify the project reference, incident or
change record, backup timestamp, encryption key access and rollback plan before
typing `RESTORE`. LP-006 did not run or validate this production path.

## Verification checklist

- [ ] The artifact filename contains UTC timestamp and deployed git SHA.
- [ ] Production dump and manifest are encrypted; no plaintext twin remains.
- [ ] `backup.succeeded` appears once and no `backup.failed` follows it.
- [ ] Object-store copy exists when configured, while the local copy remains.
- [ ] `verify-backup.sh` reports migration 0045 and a matching 10-table
  signature.
- [ ] The throwaway database no longer exists after verification.
- [ ] Restore-drill evidence is recorded through the existing OPS-016 review
  process without copying secrets or customer data into tickets.

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `checking schema` fails | Source is not at the 0045-equivalent baseline | Stop and reconcile schema through the approved migration process; never force the backup check. |
| Snapshot export or `pg_dump --snapshot` fails | Transaction pooler or insufficient backup-role privileges | Use the direct/session connection for the dedicated project and a read-only role able to dump all VAKA objects. |
| `pg_dump` reports server-version incompatibility | Client major version is older than PostgreSQL | Install the production major version or newer and rerun. |
| Encryption fails | Missing/wrong key or incompatible OpenSSL | Restore the dedicated key from the secret store; never substitute an application encryption key. |
| S3 upload fails | Credentials, endpoint, bucket policy or network failure | Keep the complete local set, correct least-privileged object-store access, then rerun or upload that exact set manually. |
| Manifest missing | Artifact set was copied incompletely | Retrieve the matching manifest with the same timestamp/SHA; do not invent one. |
| Sanity signature mismatch | Wrong manifest/backup pair, damaged set or non-snapshot backup | Quarantine the set and verify an earlier backup; escalate if it is the newest recovery point. |
| Production restore refused | Target matched `vaka-os-prod`, its project ref, or the legacy hold project | This is expected. Proceed only under an authorised recovery with the explicit production flag. |
| Throwaway database cannot be created | Admin role lacks `CREATEDB`, target is remote, or active connections conflict | Use the approved local drill role; add `--allow-remote-admin` only for a confirmed non-production service. |

## Rollback

Backup is read-only and needs no database rollback. Delete only a confirmed
failed/partial artifact set; retain the last known-good set.

A restore replaces target objects. Before any production restore, preserve the
current database as a separate verified backup. If post-restore smoke checks
fail, isolate the target and restore that pre-change backup or switch the
application back under the approved cutover rollback. Never delete the former
`vaka-platform` VAKA tables before the owner smoke test and hold period finish.

## Escalation

| Situation | Contact | Method |
| --- | --- | --- |
| Nightly backup absent or failed twice | VAKA Operations owner | Open an incident and attach only event timestamps/steps, never URLs or secrets. |
| No verified restore point inside the recovery objective | Incident commander and VAKA owner | Declare a recovery-risk incident and freeze destructive changes. |
| Production restore requested | VAKA owner plus second authorised reviewer | Approved incident/change record and live two-person verification. |
| Suspected backup exposure or lost encryption key | Security incident lead | Follow `docs/engineering/INCIDENT-RESPONSE.md`; preserve evidence and rotate affected access. |

## History

| Date | Run by | Notes |
| --- | --- | --- |
| 2026-07-16 | Codex LP-006 | Scripts and CI round-trip implemented against disposable local/test PostgreSQL only; no production backup or restore performed. |
