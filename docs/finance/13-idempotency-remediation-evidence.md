# VAKA Finance Mission 2E - Idempotency Remediation Evidence

## Executive Result

`IDEMPOTENCY_REMEDIATED`

Mission 2E closes the residual duplicate-effect risk from Mission 2D for externally triggered risky financial create routes. Payments, expenses, and manual stock adjustments now require an idempotency identity at the API boundary and store a deterministic payload fingerprint so same-key/different-payload retries are rejected.

## Scope

This mission did not change legal entities, currency precision, VAT logic, fiscal periods, accounting events, or ledger design. It only strengthened idempotency controls around existing financial write paths.

## Protected Actions

| Action | Idempotency Source | Conflict Detection | DB Enforced | Status |
| ------ | ------------------ | ------------------ | ----------: | ------ |
| Invoice payment API | Client-supplied `Idempotency-Key` header, with request-field fallback | SHA-256 payload fingerprint over invoice, amount, bank account, requested date, and reference | Yes | REMEDIATED |
| Expense API | Client-supplied `Idempotency-Key` header, with request-field fallback | SHA-256 payload fingerprint over account, vendor, amount, currency, rate, date, and description | Yes | REMEDIATED |
| Manual stock adjustment API | Client-supplied `Idempotency-Key` header, with request-field fallback | SHA-256 payload fingerprint over product, warehouse, quantity delta, and note | Yes | REMEDIATED |
| Bank transaction to invoice match | Server-derived key from bank transaction ID and invoice ID | SHA-256 payload fingerprint over bank transaction, invoice, and amount | Yes | REMEDIATED |
| Split bank transaction invoice match | Server-derived key from bank transaction ID and each invoice ID | SHA-256 payload fingerprint over bank transaction, invoice, and allocation amount | Yes | REMEDIATED |
| Invoice issue | Server business-state guard | DRAFT-only transition prevents repeat issue | Not by idempotency key | REMEDIATED_BY_STATE |
| Purchase order receipt | Server business-state guard | RECEIVED status prevents repeat receipt | Not by idempotency key | REMEDIATED_BY_STATE |

## Behavioural Evidence

- Missing idempotency key on risky payment, expense, and stock-adjustment API routes is rejected.
- Same key with the same payload returns the original effect where practical and does not create a second payment, expense, stock movement, or journal.
- Same key with a materially different payload is rejected as an idempotency conflict.
- Database partial unique indexes on `(tenant_id, idempotency_key)` remain the atomic duplicate backstop for payments, expenses, and stock movements.
- Internal bank reconciliation payment creation uses a server-derived business identity instead of relying on a client header.

## Data Impact

No production data repair is performed by Mission 2E. The migration adds nullable fingerprint columns to existing financial tables and preserves existing records. Historical rows without idempotency keys remain valid history; new protected paths write keys and fingerprints.

## Verification Commands

Mission 2E verification should be run against the guarded local PostgreSQL database only:

```bash
cd server
npm run typecheck
NODE_ENV=test DATABASE_URL="postgresql://vaka_test:vaka_test@127.0.0.1:5432/vaka_os_test" npm run test:db:prepare
NODE_ENV=test DATABASE_URL="postgresql://vaka_test:vaka_test@127.0.0.1:5432/vaka_os_test" npm run test:finance
NODE_ENV=test DATABASE_URL="postgresql://vaka_test:vaka_test@127.0.0.1:5432/vaka_os_test" npx vitest run --fileParallelism=false tests/critical.test.ts tests/bank-statement-imports.test.ts tests/bank-invoice-matching.test.ts tests/opening-stock-imports.test.ts
NODE_ENV=test DATABASE_URL="postgresql://vaka_test:vaka_test@127.0.0.1:5432/vaka_os_test" npm test
```

## Residual Non-Idempotency Risks

- Rejected financial-integrity attempts are still not fully audited.
- Zero-value journal lines remain allowed inside otherwise valid non-zero journals.
- Enterprise fiscal-period, legal-entity, close, tax, and high-precision money architecture remain future work and were intentionally out of scope.
