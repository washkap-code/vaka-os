# LP-006 — Completion report

**Mission:** Backup and Restore Scripts

**Branch:** `ops/backup-restore`

**Date:** 2026-07-16

**Status:** Implementation and disposable-database verification complete; operator provisioning and a controlled restore drill remain launch operations.

**Reconciliation:** Rebasing onto post-LP-005 `origin/main` (`45f46bc`)
rewrote the LP-006 implementation commit to `3f86a1b`. LP-005 did not add a
separate workflow step: its 10 observability tests remain enforced by the full
server `npm test` gate. That gate and LP-006's explicit seeded backup/restore
round-trip coexist in the rebased quality workflow.

## 1. Files created

| File | Purpose |
| --- | --- |
| `scripts/backup.sh` | Consistent custom-format PostgreSQL backup, optional encryption/document archive/S3-compatible copy, retention and structured outcome events |
| `scripts/restore.sh` | Explicit-target atomic restore with production refusal rail, confirmation, schema check and 10-table signature |
| `scripts/verify-backup.sh` | Throwaway-database restore and manifest/signature comparison |
| `scripts/lib/backup-common.sh` | Shared URL safety, production identity, schema sentinel, signature and structured-event helpers |
| `scripts/tests/backup-restore.test.sh` | CI round-trip, failure-event, encryption, archive, upload, retention and production-rail tests |
| `docs/ops/backup-restore.md` | Operator runbook, prerequisites, recovery procedure, troubleshooting, rollback and escalation |
| `docs/engineering/mission-packs/LP-006/COMPLETION.md` | Mission evidence and handoff |

No migration or package file was created. Migration `0046` remains free.

## 2. Files modified

| File | Change |
| --- | --- |
| `.github/workflows/quality.yml` | Installs PostgreSQL client tools when required and runs the seeded backup/restore CI check after migration replay |
| `docs/engineering/SESSION-HANDOFF.md` | Records LP-006, the dedicated production project and 0045-equivalent cutover state in the final session commit |

## 3. Behaviour changes

- A backup now uses one exported, repeatable-read PostgreSQL snapshot for both
  the custom-format dump and its manifest signature. The artifact name includes
  a UTC timestamp and application git SHA.
- Setting `BACKUP_ENCRYPTION_KEY` encrypts the database, manifest and optional
  local-document archive with AES-256-CBC/PBKDF2 and removes plaintext twins.
- Setting `BACKUP_S3_URI` optionally copies the complete set through an
  S3-compatible CLI while retaining the local set. Local pruning happens only
  after all requested backup stages succeed.
- Backup failure is non-zero and emits `backup.failed`; success emits
  `backup.succeeded`. Events contain operational metadata, not database URLs,
  credentials or document contents.
- Restore requires both a named backup and explicit target URL. It replaces
  target objects in one transaction, then verifies the 0045-equivalent schema
  and prints counts for tenants, users, contacts, products, invoices, payments,
  journal entries, journal lines, stock movements and audit logs.
- The restore rail refuses `vaka-os-prod`, project reference
  `ewljdjvqngxweacgwedu`, configured production markers, and the former
  `vaka-platform` project during the hold. `--yes` cannot bypass the rail;
  only the conspicuous production recovery flag can do so.
- Verification restores into a uniquely named non-production throwaway
  database, compares the restored signature with the matching manifest, and
  drops the database on success or failure.
- Current capture and workspace-document payloads are database-resident and
  are included in the dump. `BACKUP_UPLOADS_DIR` covers an optional future or
  deployment-specific local files directory.
- No runtime route, tenant, accounting, migration or production data behaviour
  changed.

## 4. Tests executed

All database work used disposable local PostgreSQL only.

| Check | Result |
| --- | --- |
| Fresh migration replay `0000` through `0045` | Passed transactionally; zero structural drift and no manual step |
| Seeded backup/restore CI test | Passed |
| Plain custom dump → throwaway restore → 10-table signature | Passed; exact match |
| Invalid configuration failure event and URL-redaction assertion | Passed; non-zero `backup.failed` |
| New production logical-name refusal | Passed; exit 64 before connection |
| New Supabase pooler project-reference refusal | Passed; exit 64 before connection |
| Encrypted dump, manifest and local-document archive | Passed; no plaintext dump remained |
| Encrypted throwaway verification | Passed |
| S3-compatible upload contract using a local fake client | Passed; database and manifest copied, local dump retained |
| Retention pruning | Passed; expired artifact removed only after successful backup |
| Tenant-isolation regression | Passed: 13/13 |
| Settings test at repository default timeout | Passed: 4/4 |
| Inventory-valuation test at repository default timeout | Passed: 7/7 |
| Full server suite at the repository's default 15-second timeout | Passed: 96/96 files, 454/454 tests |
| Server typecheck | Passed |
| Web typecheck | Passed |
| Web production build | Passed; existing chunk-size advisory only |
| Shell syntax and `git diff --check` | Passed |
| Quality workflow YAML parse | Passed |

The complete post-rebase suite passed unchanged at the repository's default
timeout. No test, check, timeout or application behaviour was weakened. Earlier
pre-rebase local timing failures documented during implementation did not recur
in this clean run.

### Exact operator commands

Nightly cron (01:15 UTC):

```cron
15 1 * * * cd /srv/vaka-os && /usr/bin/env bash -lc 'set -a; source /etc/vaka/backup.env; set +a; ./scripts/backup.sh' >> /var/log/vaka-backup.log 2>&1
```

Manual backup:

```bash
cd /srv/vaka-os
set -a
source /etc/vaka/backup.env
set +a
./scripts/backup.sh
```

Restore drill against a local throwaway-database administrator:

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

## 5. Verification status

LP-006 implementation acceptance is met locally: backup → verified restore is
repeatable, the signature matches, the production rail is tested against the
new project identity, CI contains the check, and documentation is complete.
The entire post-rebase verification matrix passed against `origin/main` at
`45f46bc`: migrations, seeded backup/restore, tenant isolation, all 454 server
tests, both typechecks and the web production build.
The scripts were tested with PostgreSQL client 18.4 against disposable
PostgreSQL 18.4. No production or shared database, cloud account, credential or
customer record was accessed.

The migration ledger is unchanged: production is recorded at an effective
0045-equivalent baseline and `0046` remains the next free number.

## 6. Risks and human decisions

- The owner must provision the least-privileged direct/session backup URL,
  independent encryption key, encrypted local directory, cron service account,
  log alert and chosen S3-compatible retention policy. A transaction-pooler
  URL cannot support the exported snapshot.
- S3 behaviour was contract-tested with a fake local client; credentials,
  endpoint policy, object lifecycle, encryption and actual network delivery
  require an operator test against the selected non-production bucket.
- The production override was deliberately not exercised. A real recovery
  requires incident/change approval, two-person target verification, a
  pre-restore backup and an interactive confirmation.
- Backup RPO, restore RTO and key-recovery access are not proven until the owner
  runs and records the controlled restore drill.
- The user-referenced `vaka-os-prod-CUTOVER-RUNBOOK.md` was not present on the
  current main branch. The handoff records only the explicit mission facts:
  project `vaka-os-prod` / `ewljdjvqngxweacgwedu`, provisioned 2026-07-16 at a
  verified 0045-equivalent baseline.
- DB separation is complete pending the owner smoke test and hold period. The
  former VAKA tables in `vaka-platform` remain protected by the restore rail
  and must not be decommissioned before the hold is formally closed.
- Retention duration and backup exposure controls need owner/privacy review
  before launch. The runbook recommends 14 local daily copies and a separately
  approved object-store lifecycle.

## 7. Recommended next mission

Push and review the rebased `ops/backup-restore` branch, then merge LP-006 and
complete one controlled encrypted backup plus non-production restore drill.
The next engineering mission is **LP-007 — Full DB-Backed Suite: Run Green on
Production-Like Database**, including the LP-006 round trip as a final launch
gate.
