# Backup & Disaster Recovery Runbook

**Objectives:** RPO ≤ 15 minutes (WAL archiving) · RTO ≤ 4 hours (restore to standby)

## What is backed up
1. PostgreSQL nightly full dumps (encrypted client-side, uploaded to foreign S3, Object-Locked 35 days)
2. Continuous WAL archive (encrypted) for point-in-time recovery
3. Uploaded assets (logos/receipts) — object storage with cross-region replication
4. Infrastructure-as-code + `.env` secrets in an offline password manager (never in git)

## Restore procedure (drill quarterly — record each drill)
```bash
aws s3 cp s3://jonomi-dr-backups/nightly/jbp-<STAMP>.dump.age .
age -d -i backup-private-key.txt jbp-<STAMP>.dump.age > jbp.dump
createdb jonomi_platform_restore && pg_restore -d jonomi_platform_restore jbp.dump
# verify: row counts, latest audit_logs timestamp, trial balance of a sample tenant balances
```
For point-in-time: restore last nightly, replay WAL to target timestamp (standard PITR).

## Failure scenarios
| Scenario | Response |
|---|---|
| Primary DB host fails | Promote local streaming replica (minutes) |
| Harare facility offline > RTO | Restore latest backup in foreign region; repoint DNS; announce via status page |
| Ransomware / data corruption | Object-Locked backups are immutable; restore to point before corruption; incident-response plan |
| Key person unavailable | Runbook + offline key escrow means any competent engineer can execute |

## Drill log
| Date | Backup restored | Time to restore | Verified by | Issues |
|---|---|---|---|---|
| (start at go-live) | | | | |
