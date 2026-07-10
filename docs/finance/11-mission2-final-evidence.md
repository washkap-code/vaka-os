# VAKA Finance Mission 2 / 2B / 2D Evidence Log

## Purpose

Preserve executable evidence gathered during the finance kernel verification and remediation missions.

## Mission 2B Baseline Evidence

- Server typecheck: PASS.
- Mission 2 finance tests: 17 passed, 0 failed.
- Existing accounting-oriented tests: 17 passed, 0 failed.
- Full server suite: 86 passed, 0 failed.
- Baseline outcome: `CRITICAL_REMEDIATION_REQUIRED_BEFORE_MISSION_3`.

## Preserved Cross-Tenant Violation Evidence Before Test DB Reset

Mission 2D preflight on the dedicated local test database `vaka_os_test` found 2 cross-tenant journal/account references left behind by the Mission 2B vulnerability-proof tests. These are test evidence, not production-data corruption.

| Journal Entry | Journal Tenant | Source | Journal Line | Account | Account Tenant | Account Code | Debit | Credit |
|---|---|---|---|---|---|---|---:|---:|
| `0db4e63d-9af9-4b26-9e4d-1bf909fa14b6` | `8d4faa56-bc02-407f-b2b6-1b8986a7455f` | `manual_test/cross-tenant-account` | `2d70568b-36cc-4cdd-956e-1a323c24e8a5` | `e12e0125-dd4e-4250-80dd-ea4beda72bd9` | `2e06f7a1-1b48-4c7f-a177-c3d1788dfe31` | `6900` | `7.00` | `0.00` |
| `229b4b46-963b-4428-ae07-787940cd3f5f` | `72b831c4-8618-45b2-bead-e3951e70be90` | `manual_test/cross-tenant-account` | `f86673a7-8003-4fe2-9f5b-6c12641a8731` | `b10ec7f3-243c-4c66-a57c-ca0f4d512940` | `1caab617-d828-4e7a-89af-0dfa581887a8` | `6900` | `7.00` | `0.00` |

The database was reset only after this evidence was recorded and after explicit approval limited to the local guarded `vaka_os_test` database.

## Mission 2D Outcome

Mission 2D applied critical financial integrity remediation and reran the guarded verification stack:

- Finance tests: 17 passed, 0 failed.
- Existing accounting-oriented tests: 17 passed, 0 failed.
- Full server suite: 86 passed, 0 failed.
- Direct database verification: zero cross-tenant journal/account references, zero orphaned journal lines, zero invalid stock references.
- Database controls verified: journal-line FK is `ON DELETE RESTRICT`; update/delete triggers exist for `journal_entries`, `journal_lines`, and `stock_movements`.

Mission 2D did not delete, rewrite, recalculate, or repair existing financial records. The only reset was the explicitly approved local test database reset of `vaka_os_test`.
