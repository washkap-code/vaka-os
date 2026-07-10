# VAKA Finance Mission 2D - Critical Remediation Evidence

## Executive Result

`CRITICAL_REMEDIATION_COMPLETE_WITH_MISSION_2E_IDEMPOTENCY`

Critical tenant-account and append-only history defects are remediated. Mission 2E closes the remaining targeted idempotency gap by requiring idempotency identities on risky financial create routes and rejecting same-key/different-payload retries.

## Defect Matrix

| Defect | Baseline | Remediation | Test Evidence | DB Enforced? | Status |
|---|---|---|---|---:|---|
| Cross-tenant journal account reference | Tenant B could post using Tenant A account IDs. | `postJournal()` validates account existence, tenant ownership, and active status before insert. | `tenant-isolation.test.ts` | No | REMEDIATED |
| Posted journal header mutation | Direct update/delete possible. | Append-only trigger rejects update/delete. | `journal-immutability.test.ts` | Yes | REMEDIATED |
| Posted journal line mutation | Direct update/delete possible. | Append-only trigger rejects update/delete. | `journal-immutability.test.ts` | Yes | REMEDIATED |
| Journal line cascade deletion | Header delete cascaded lines. | FK changed to `ON DELETE RESTRICT`; trigger also rejects header delete. | direct DB verification and `journal-immutability.test.ts` | Yes | REMEDIATED |
| Stock movement mutation | Direct update/delete possible. | Append-only trigger rejects update/delete. | `stock-ledger-integrity.test.ts` | Yes | REMEDIATED |
| Payment duplicate effect | Repeated partial payments duplicated journals. | Required idempotency key plus payload fingerprint prevents duplicate journals and rejects conflicting retries. | `journal-idempotency.test.ts` | Yes | REMEDIATED |
| Expense duplicate effect | Repeated expense requests duplicated effects. | Required idempotency key plus payload fingerprint returns the original expense or rejects conflicting retries. | `journal-idempotency.test.ts` | Yes | REMEDIATED |
| Stock adjustment duplicate effect | Repeated adjustments duplicated movements/journals. | Required idempotency key plus payload fingerprint prevents duplicate movements/journals and rejects conflicting retries. | `journal-idempotency.test.ts` | Yes | REMEDIATED |

## Cross-Tenant Integrity

Original defect: `postJournal()` accepted account IDs without verifying they belonged to the posting tenant.

Corrected control: every unique journal line account is validated inside `postJournal()` before any journal header or line is inserted. Invalid, inactive, missing, or cross-tenant accounts fail with a stable safe error.

Atomicity evidence: the cross-tenant and mixed-tenant tests reject the journal and verify no partial tenant B journal was added.

## Journal Immutability

Service protection: no normal application service exposes journal update/delete.

Database protection: `journal_entries_append_only` and `journal_lines_append_only` triggers reject direct `UPDATE` and `DELETE`.

Direct mutation evidence: `journal-immutability.test.ts` attempts direct ORM update/delete and receives database rejection. Existing lines remain intact.

## Cascade Deletion

Old relationship: `journal_lines.journal_entry_id` referenced `journal_entries.id` with `ON DELETE CASCADE`.

New relationship: `journal_lines.journal_entry_id` references `journal_entries.id` with `ON DELETE RESTRICT`.

Migration evidence: direct DB verification reports `FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id) ON DELETE RESTRICT`.

## Stock Immutability

Database protection: `stock_movements_append_only` trigger rejects direct `UPDATE` and `DELETE`.

Service behaviour: stock corrections continue through new offsetting movements.

Offsetting correction evidence: `stock-ledger-integrity.test.ts` rejects direct update/delete and then successfully inserts a new adjustment.

## Idempotency

| Action | Old Behaviour | Chosen Identity | Corrected Behaviour | Unresolved Limitations |
|---|---|---|---|---|
| Payment | repeated partial request created duplicate payment journals | required client idempotency identity | duplicate key creates no second payment journal; conflicting payload is rejected | none for targeted route |
| Expense | repeated request created duplicate expense effects | required client idempotency identity | duplicate key returns original expense; conflicting payload is rejected | future service extraction recommended |
| Stock adjustment | repeated request created duplicate movement/journal | required client idempotency identity | duplicate key creates no second movement/journal; conflicting payload is rejected | none for targeted route |
| PO receipt | state check already prevented duplicate receipt | purchase order status | unchanged | none found in Mission 2D |

Mission 2E update: the payment, expense, and stock-adjustment route contract now requires an idempotency identity. Each protected record stores a payload fingerprint. Same-key/same-payload retries return the original result where practical; same-key/different-payload retries fail with an idempotency conflict. Bank reconciliation payment creation records safe server-derived keys from bank transaction and invoice identities.

## Regression Results

- Finance tests: 17 passed, 0 failed.
- Existing accounting-oriented tests: 17 passed, 0 failed.
- Full server suite: 86 passed, 0 failed.
- Server typecheck: PASS.

## Residual Risks

- Medium: rejected financial-integrity attempts are not fully audited.
- Medium: full enterprise audit before/after evidence remains a Mission 3 concern.
- Low: zero-value journal lines remain allowed inside non-zero balanced journals.

## Mission 3 Readiness

`READY_FOR_MISSION_3_IDEMPOTENCY_GATE`

The critical append-only, tenant-account, and targeted idempotency boundaries are now in place. Remaining risks should be carried into Mission 3 planning as explicit scope, not treated as blockers to the idempotency gate.
