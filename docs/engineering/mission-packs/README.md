# VAKA OS — Engineering Mission Packs

Every significant engineering change is executed as a **Mission Pack**: a version-controlled specification that an implementer (Codex, Claude, or a human engineer) executes exactly, without inventing architecture.

## Workflow

```
Mission Pack (.md)  →  Implementation branch  →  Code review  →  Verification  →  Merge  →  Completion Report
```

## Rules

1. No implementation begins without a Mission Pack in this directory.
2. Missions are small: reviewable in one sitting, reversible in one revert.
3. Missions never expand scope. New ideas become new missions or ADRs (`knowledge-system/18-decisions/`).
4. Every mission ends with a Completion Report appended to its folder.
5. Existing behaviour is preserved unless the mission explicitly changes it.

## Index

| ID | Title | Status |
|----|-------|--------|
| P1-001 | Platform Kernel Foundation | ✅ Complete (PR #44, #45) |
| P1-002 | Identity & Audit Adapters | ✅ Complete |
| P1-003 | First kernel audit adoption seam | Implemented; focused verification passed; full suite environment-blocked |
| P2-001 | Country Pack Engine (Zimbabwe reference) | Implemented; focused verification passed; professional review/full suite open |
| P1-004 | Notification service adapter (email + persisted in-app) | Approved — ready to build |
| P1-005 | Event bus: emit domain events from existing write paths | Approved — ready to build |
| P6-006 | Platform Admin Control Centre | Implemented; full database-backed verification blocked in current sandbox |
| P9-003 | Backup, Disaster-Recovery Evidence and RPO/RTO Tiers | Implemented foundation; full database-backed verification blocked in current sandbox |
| OPS-010 | Super Admin control centre and in-product user guide | Implemented; focused/browser verification passed; full suite environment-blocked |
| OPS-011 | Backup, restore and disaster-recovery evidence gates | Implemented; focused/browser verification passed; full suite environment-blocked |
| OPS-012 | Backup manifest contract foundation | Implemented; focused/browser verification passed; full suite environment-blocked |
| OPS-013 | Backup manifest registry and recording API | Implemented; focused/browser verification passed; full suite environment-blocked |
| OPS-014 | Backup job adapter foundation | Implemented; focused/browser verification passed; full suite environment-blocked |

## Standards

Templates live in `knowledge-system/14-templates/`. Constitutional authority: `docs/00-foundation/VAKA-CONSTITUTION.md` and `knowledge-system/02-constitution/`.
