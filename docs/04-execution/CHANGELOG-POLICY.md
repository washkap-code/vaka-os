# VAKA Changelog Policy

**Status:** Release documentation standard
**Owner:** Product and Engineering

## 1. Purpose

Maintain an accurate, customer-safe record of meaningful changes without exposing sensitive implementation detail.

## 2. Changelog structure

Use a root `CHANGELOG.md` following:

```text
## [Unreleased]
### Added
### Changed
### Fixed
### Security
### Deprecated
### Removed
### Migration
```

Release headings use version and date.

## 3. Include

- customer-visible capabilities;
- workflow changes;
- API contract/version changes;
- schema/migration requirements;
- permission/role changes;
- security fixes stated safely;
- localisation additions/changes;
- AI model/tool/behavior changes;
- significant accessibility/performance improvements;
- deprecations/removals;
- operational changes customers must understand.

## 4. Exclude

- secrets;
- exploit instructions before safe disclosure;
- customer/tenant identities or data;
- internal-only noise;
- unverifiable marketing claims;
- planned features presented as released.

## 5. Availability labels

Every entry distinguishes:

- Generally Available
- Pilot
- Early Access
- Preview
- Coming Soon
- Internal

Documentation completion does not equal product release.

## 6. Security entries

- Coordinate timing with remediation.
- Describe impact and required customer action without enabling abuse.
- Link advisory/incident communication when appropriate.
- Record internal technical detail in restricted incident records, not public changelog.

## 7. Database and API entries

Record:

- migration name/order;
- compatibility window;
- backfill/rollback requirement;
- API/event version;
- deprecation date;
- mobile-client impact; and
- operator action.

## 8. Localisation entries

State:

- language;
- reviewed scope;
- fallback behavior;
- affected surfaces; and
- known limitations.

Do not state Shona/Ndebele support until the released catalogue is reviewed and enabled.

## 9. AI entries

Record:

- use case and availability;
- model/provider or behavior change when material;
- tool/action scope;
- confirmation/permission changes;
- safety limitation;
- evaluation version; and
- rollback/disable status where relevant.

Do not imply autonomy beyond deployed behavior.

## 10. Workflow

1. Add entries under Unreleased with the change.
2. Review for accuracy, privacy, and availability status.
3. Finalise during release preparation.
4. Link release notes and migration/runbook.
5. Preserve history; corrections append explanatory updates.

## 11. Ownership

- Change author drafts.
- Product validates customer language.
- Engineering validates technical accuracy.
- Security/legal review sensitive entries.
- Release owner publishes.
