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
| P1-003 | First kernel audit adoption seam | ✅ Implemented; full DB-backed suite verified green (2026-07-12) |
| P2-001 | Country Pack Engine (Zimbabwe reference) | ✅ Implemented; full DB-backed suite verified green; professional tax review still required before VAT go-live |
| P2-002 | VAT treatment model (standard/zero-rated/exempt) | ✅ Technically verified; qualified accountant/tax approval pending |
| P2-003 | VAT technical return report and evidence export | ✅ Technically verified; qualified accountant/tax approval pending |
| P1-004 | Notification service adapter (email + persisted in-app) | ✅ Implemented; full DB-backed suite verified; provider/product adoption gated |
| P1-005 | Event bus: emit domain events from existing write paths | ✅ Implemented; full DB-backed suite verified; durable delivery gated |
| P1-006 | Tenant-scoped Customer/Invoice/Product search adapter | ✅ Technically verified internal adapter; durable delivery, scale and UI gated |
| P1-008 | Canonical Company/Customer/Invoice/Product metadata registry | ✅ Technically verified read-only registry; dynamic values and AI context gated |
| P9-008 | Account recovery, optional MFA and governed platform workforce | ✅ Released (PR #62–#64); email delivery and stable MFA key activation remain externally configured |
| P3-003 | Customer activity and communication timeline | ✅ Technically verified for manual CRM activity and financial milestones; provider communications gated |
| P3-004 | Customer records, bulk actions and controlled deletion | ✅ Released (PR #61); physical privacy erasure and merge/deduplication remain gated |
| P2-007 | Invoice detail and draft amendment | ✅ Released (PR #61); issued/posted history remains immutable |
| P5-004 | Product reorder rules and in-app low-stock alerts | ✅ Technically verified; durable delivery, external channels and auto-replenishment gated |
| P5-003 | Weighted-average inventory valuation feeding COGS | Implementation complete; hosted DB verification and Zimbabwean accountant sign-off pending |
| P6-006 | Platform Admin Control Centre | ✅ Implemented; full DB-backed suite verified green (2026-07-12) |
| P6-003 | Universal Workbench | ✅ Released (PR #65); full remote quality gate and production deployment passed |
| P6-004 | Universal Command and Search Palette | ✅ Released (PR #66); full remote quality gate and production deployment passed |
| P6-005 | Core-flow Accessibility and Reflow Foundation | ✅ Released (PR #67); full remote quality gate and production deployment passed |
| P6-007 | Operational Record Accessibility and Reflow | ✅ Released (PR #68); full remote quality gate and production deployment passed |
| P6-008 | Settings and Access Administration Accessibility | ✅ Released (PR #71); full remote quality gate, production deployment and live bundle verification passed |
| P6-009 | Financial Reporting and Billing Accessibility | ✅ Released (PR #74); full remote quality gate, production deployment and live bundle verification passed |
| P6-013 | Modern Platform Administration | ✅ Released (PR #69); user-requested interface refinement released and live (PR #72) |
| P6-014 | Imports, Capture and Bank Review Accessibility | ✅ Released (PR #75); full remote quality gate, production deployment and live bundle verification passed |
| P6-015 | Homepage Regression and Redesign Baseline | ✅ Released (PR #77); full remote quality gate, production deployment and live bundle verification passed |
| P6-016 | Homepage Visual Modernisation I: Navigation, Hero and Product Proof | ✅ Released (PR #78); full remote quality gate, production deployment and live browser verification passed |
| CO-006 | Verified Paynow Subscription Collection | ✅ Implementation complete and locally verified; remote DB gates and live merchant activation pending |
| P6-018 | Tenant-branded Secure Holding and Sign-out Experience | ✅ Implementation complete and locally verified; remote DB and release gates pending |
| HOTFIX-2026-07-13-INVOICE-PDF-PREVIEW | Reliable invoice PDF download, preview and VAKA document footer | ✅ Released (PR #65); full remote quality gate and production deployment passed |
| P9-003 | Backup, Disaster-Recovery Evidence and RPO/RTO Tiers | ✅ Implemented foundation; full DB-backed suite verified green (2026-07-12) |
| OPS-010 | Super Admin control centre and in-product user guide | Implemented; focused/browser verification passed; full suite environment-blocked |
| OPS-011 | Backup, restore and disaster-recovery evidence gates | Implemented; focused/browser verification passed; full suite environment-blocked |
| OPS-012 | Backup manifest contract foundation | Implemented; focused/browser verification passed; full suite environment-blocked |
| OPS-013 | Backup manifest registry and recording API | Implemented; focused/browser verification passed; full suite environment-blocked |
| OPS-014 | Backup job adapter foundation | Implemented; focused/browser verification passed; full suite environment-blocked |

## Standards

Templates live in `knowledge-system/14-templates/`. Constitutional authority: `docs/00-foundation/VAKA-CONSTITUTION.md` and `knowledge-system/02-constitution/`.
