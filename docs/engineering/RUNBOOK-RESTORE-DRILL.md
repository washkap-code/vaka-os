# VAKA OS — Backup Restore Drill Runbook

**Document ID:** OPS-RB-001
**Version:** 1.0 — 16 July 2026
**Owner:** Dr. Washington Kapapiro (Owner, VAKA OS)
**Support owner / alternate operator:** Mr. Anthony Kakurira
**Status:** Launch-gating. The pilot may not launch until this drill has passed once, end to end, with evidence recorded.
**Cadence:** Once before launch, then monthly during the pilot, then quarterly.
**Prerequisite:** Mission LP-006 (backup/restore scripts) merged; at least one real nightly backup has run.

---

## 1. Purpose

A backup that has never been restored is a hope, not a backup. This drill proves, on a schedule, that:

1. The most recent automated backup file exists, is complete, and is readable.
2. It restores into a completely fresh database with zero manual surgery.
3. The restored database is *correct* — schema at the expected migration version, data intact, application boots against it, and the full test suite passes against a copy of it.
4. The whole procedure completes inside the recovery-time target.

## 2. Targets

| Objective | Target | Meaning |
|---|---|---|
| RPO (max data loss) | 24 hours | Nightly backups. If the pilot tenants post significant daily volume, tighten to 6h before adding tenant #3. |
| RTO (max downtime) | 4 hours | From "database is lost" to "pilot tenants working again." The drill measures the restore portion; it must complete in under 60 minutes to leave margin for diagnosis and DNS/config work. |

## 3. Safety Rules

- The drill NEVER touches the production database, production credentials, or the production server. It uses an isolated instance only.
- Use a read-only copy of the backup file. Never move or rename the original.
- The restored drill database is destroyed at the end of the drill. It contains real tenant personal data — it inherits production confidentiality for its entire (short) life: no screenshots of tenant data in evidence, disk-level cleanup on destroy.
- If the drill FAILS, the failure is treated as a production incident: launch (or continued operation) is blocked until a subsequent drill passes.

## 4. Pre-Drill Checklist

- [ ] Isolated environment available (separate VM/container/host from production) with the pinned PostgreSQL major version.
- [ ] Latest nightly backup file identified: record filename, size, timestamp.
- [ ] Backup encryption key accessible from the secure store (never from a chat log or repo).
- [ ] `scripts/verify-backup.sh` and `scripts/restore.sh` present at the deployed application version.
- [ ] Stopwatch/timestamps ready — the drill is timed.

## 5. Drill Procedure

Record the start time. Every step gets a timestamp in the evidence log (Section 7).

**Step 1 — Fetch and verify the artifact.**
Copy the latest backup to the drill host. Verify size is within ±20% of the previous backup (a sudden shrink is a red flag). If encrypted, decrypt a copy; confirm decryption succeeds.

**Step 2 — Provision a fresh database.**
Create a brand-new, empty PostgreSQL database on the drill host. Same major version as production. No pre-existing schema.

**Step 3 — Restore.**
Run `scripts/restore.sh <backup-file> <drill-database>`. Record: duration, warnings, errors. Zero manual intervention permitted — if you have to hand-edit anything to make the restore work, the drill fails and the fix goes into the restore script.

**Step 4 — Schema verification.**
Run the migration-status check against the restored database. Expected result: schema at the exact migration version that was current when the backup was taken. Any drift = fail.

**Step 5 — Data sanity signature.**
Record row counts for the key tables (tenants, users, customers, invoices, journal lines, payments, documents). Compare against the counts logged at backup time (LP-006 logs these). Spot-check: pick one tenant, open its most recent invoice, confirm invoice total equals the sum of its lines, and confirm the corresponding journal entry balances (debits = credits). The financial invariants must hold on restored data, not just live data.

**Step 6 — Application boot.**
Point a locally-run application instance (drill config, real production build) at the restored database. Confirm: `/readyz` returns 200; login works for a test account; the tenant dashboard renders; an invoice PDF/document referenced in the restored data is retrievable (this validates the file-storage backup too, if files are backed up separately).

**Step 7 — Full suite against a restored copy.**
Run the full DB-backed suite (`test:full` from LP-007) against a *copy* of the restored database (never the drill copy you inspected, to keep evidence clean). All green = pass. This is the step that merges Codex's item 4 and item 7 into one proof.

**Step 8 — Timing check.**
Total elapsed time for Steps 1–6 must be under 60 minutes. Record actual.

**Step 9 — Destroy.**
Drop the drill database(s), securely delete the decrypted backup copy, wipe the drill host's working directory. Confirm destruction in the evidence log.

## 6. Pass / Fail Criteria

The drill PASSES only if all of the following are true. There is no partial pass.

- [ ] Restore completed with zero manual intervention.
- [ ] Schema at expected migration version, zero drift.
- [ ] Row counts match backup-time counts; financial spot-check balanced.
- [ ] Application booted, `/readyz` green, login + document retrieval worked.
- [ ] Full DB-backed suite green against restored copy.
- [ ] Steps 1–6 completed in under 60 minutes.
- [ ] Drill data destroyed and destruction recorded.

Any failure: open an incident record, fix the root cause (usually via a Codex mission against the scripts or migrations), and rerun the entire drill from Step 1. A partially-rerun drill does not count.

## 7. Evidence Log Template

Keep one log per drill in `docs/ops/drill-evidence/DRILL-YYYY-MM-DD.md` (or the ops folder of record):

```
Drill date/time (UTC):
Operator:
Backup file (name, size, timestamp):
App version / git SHA:
PostgreSQL version:

Step timestamps:
  1 Fetch/verify:        __:__  result: PASS/FAIL  notes:
  2 Provision:           __:__  result:
  3 Restore:             __:__  duration: ___ min  result:
  4 Schema check:        __:__  migration version: ____  result:
  5 Sanity signature:    __:__  result:  (attach row-count table)
  6 App boot:            __:__  result:
  7 Full suite:          __:__  pass/fail/skip counts:
  8 Total elapsed:       ___ min (target < 60)
  9 Destruction:         __:__  confirmed by:

Overall: PASS / FAIL
Defects raised (IDs):
Next drill due:
```

## 8. Relationship to Launch

Launch checklist dependency: one passed drill, evidence on file, dated within 30 days of the launch date. If launch slips beyond 30 days from the last drill, run it again. During the pilot, a missed monthly drill blocks onboarding of any new tenant until performed.
