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
| P1-003 | First call-site migration to kernel services | Planned |
| P2-001 | Country Pack Engine (Zimbabwe reference) | Approved — next after P1-003 |

## Standards

Templates live in `knowledge-system/14-templates/`. Constitutional authority: `docs/00-foundation/VAKA-CONSTITUTION.md` and `knowledge-system/02-constitution/`.
