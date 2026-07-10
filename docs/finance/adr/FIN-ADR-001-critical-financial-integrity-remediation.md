# Finance Engineering Decision Record

## Decision ID

`FIN-ADR-001`

## Title

Critical financial integrity remediation

## Date

2026-07-09

## Status

Accepted for Mission 2D implementation.

## Context

Mission 2B established an executable PostgreSQL finance baseline. The baseline proved that the current kernel can post valid journals and stock movements, but also proved critical weaknesses before enterprise finance migration:

- `postJournal()` can post a journal for one tenant using another tenant's account ID.
- `journal_entries` and `journal_lines` can be updated or deleted through direct ORM/database operations.
- `journal_lines.journal_entry_id` uses cascade deletion, so deleting a journal header can delete posted line history.
- `stock_movements` can be updated or deleted through direct ORM/database operations.
- repeated payment, expense, and stock-adjustment actions can create duplicate financial effects when the caller supplies no stable request identity.

The current schema has no draft journal lifecycle. All journal rows inserted by the existing posting service are treated as posted history. Current correction behavior uses reversals or offsetting records, especially invoice voids and stock adjustments.

## Decision

Mission 2D will remediate only the proven integrity weaknesses, without adding legal entities, fiscal periods, a new accounting-event architecture, or enterprise migration structures.

### Service-Layer Controls

- `postJournal()` will validate all unique account IDs before inserting the journal header or lines.
- Account validation will require every account to exist, belong to the posting tenant, and be active.
- Invalid account references will raise a safe generic error and roll back the full transaction.
- Existing posting workflows will continue to call `postJournal()` as the authoritative posting service.
- Repeated payment, expense, and stock-adjustment requests will support explicit idempotency keys where no safe natural key exists.

### Database Constraints

- `journal_lines.journal_entry_id` will be changed from cascade delete to restrictive/no-action behavior.
- Idempotency columns will be added narrowly to the vulnerable tables:
  - `payments.idempotency_key`;
  - `expenses.idempotency_key`;
  - `stock_movements.idempotency_key`.
- Partial unique indexes on `(tenant_id, idempotency_key)` will enforce key reuse per tenant when the key is present.

### Database Triggers Or Equivalent Enforcement

- PostgreSQL triggers will block direct `UPDATE` and `DELETE` on `journal_entries`, `journal_lines`, and `stock_movements`.
- The triggers are deliberately narrow: they do not block inserts, so legitimate posting and offsetting corrections continue to work.
- Trigger error messages will be stable and non-sensitive.

### Idempotency Controls

The targeted idempotency matrix is:

| Action | Duplicate Currently Possible? | Financial Effect | Existing Natural Key | Proposed Protection |
|---|---:|---|---|---|
| Manual invoice payment | Yes | duplicate payment row and duplicate Bank/AR journal | none for separate partial payments | optional explicit `idempotencyKey`; duplicate key returns the existing invoice state without a second payment/journal. |
| Expense recording | Yes | duplicate expense row and duplicate expense journal | none | optional explicit `idempotencyKey`; duplicate key returns the existing expense without a second journal. |
| Stock adjustment | Yes | duplicate stock movement and duplicate stock-adjustment journal | none | optional explicit `idempotencyKey`; duplicate key returns the existing movement without a second stock/journal effect. |
| PO receipt | No through service | duplicate inventory/AP if status control failed | purchase order ID | preserve current `RECEIVED` state check. |
| Bank import/matching | No for tested paths | duplicate bank lines or matches | source key / bank transaction ID | preserve current source-key and matched-state controls. |

Idempotency keys are optional in Mission 2D to avoid inventing unsafe duplicate detection from amount/date/description. A repeated request can be safely recognised only when the caller supplies the same explicit key or the workflow has an existing natural key. Mandatory client-side idempotency for all high-risk writes remains a later API/UI contract hardening task.

## Accounting Impact

This affects:

- ledger: yes, unsafe journals are rejected and posted rows become database-protected;
- journal: yes, account validation and immutability are enforced;
- subledger: yes, payment/expense/stock idempotency keys protect repeated effects;
- tax: no;
- currency: no;
- reporting: no intended calculation change;
- audit: rejected integrity attempts are not fully audited yet; this remains a documented audit gap;
- AI authority: no.

## Alternatives Considered

- Full enterprise accounting-event architecture: rejected as Mission 3 scope.
- Legal entity or fiscal period additions: rejected as outside Mission 2D.
- Duplicate detection by amount/date/description: rejected because it would block legitimate separate transactions.
- Comments-only append-only documentation: rejected because Mission 2B proved direct mutation was possible.
- Orphaning journal lines on header deletion: rejected because it damages referential integrity.

## Risks

- Existing databases may contain cross-tenant journal lines or orphaned ledger rows that would violate new constraints.
- Triggers can break legitimate workflows if any current code mutates protected rows unexpectedly.
- Optional idempotency keys reduce duplicate risk only when callers provide them.
- Drizzle schema push does not execute raw SQL trigger migrations by itself; the SQL migration must be applied through the documented migration path or guarded test preparation.

## Controls

- Run read-only preflight SQL before applying database protections.
- Stop if preflight finds violating financial records.
- Apply only constraint-hardening and append-only protections.
- Run finance tests, existing accounting tests, and full server tests against the guarded PostgreSQL database.

## Migration Impact

Migration is constraint-hardening only:

- no financial record deletion;
- no financial record rewrite;
- no balance recalculation;
- no account remapping;
- no tax or currency recalculation.

Rollback can drop the triggers, drop idempotency indexes/columns, and restore the journal-line cascade foreign key, but rollback would intentionally re-open proven integrity weaknesses and should be used only for emergency compatibility recovery.

## Testing Required

- Tenant account integrity tests for valid, cross-tenant, and mixed account references.
- Atomicity checks proving rejected journals create no header or lines.
- Direct database mutation tests for journal headers, journal lines, and stock movements.
- Cascade protection test proving journal headers with lines cannot be deleted.
- Stock offsetting correction test proving insertion still works while update/delete fail.
- Idempotency tests for payment, expense, and stock adjustment with duplicate and distinct keys.
- Existing finance, accounting-oriented, and full server suites must remain green.

## Approval

Product: Mission 2D prompt.

Accounting: Requires qualified review before production reliance.

Engineering: Codex implementation.

Security: Requires review before production launch.
