# Security & Compliance Posture

## Regulatory position (Zimbabwe)

| Obligation | Status in this build | Action before launch |
|---|---|---|
| Cyber and Data Protection Act [Ch 12:07] — controller/processor registration & licence | Architecture supports it | **Register/license with POTRAZ; appoint a Data Protection Officer** |
| Cross-border transfer notification (offsite backups) | Encrypted-before-transfer design (see deployment doc) | Notify POTRAZ; record in client DPAs |
| Data subject rights (access, correction, deletion) | Export endpoints live; audit trail on all access/export events | Publish a rights-request procedure; counsel-reviewed privacy policy |
| ZIMRA-compliant invoicing | Immutable sequential numbers, VAT as ledger accounts, tenant + customer BP/VAT fields | Accountant sign-off on CoA/VAT; fiscalisation integration is Phase 3 |
| Breach response | Audit log gives forensic trail | Written incident-response plan incl. POTRAZ/client notification timelines |

## Technical controls implemented in this codebase

**Tenant isolation** — every business query filters by `tenant_id` from the
verified JWT (never from client input); cross-tenant object access returns 404;
covered by automated tests.

**Access control** — RBAC with 6 seeded roles / 10 permissions checked
per-endpoint; platform-admin endpoints gated separately; suspended tenants are
enforced read-only+export in middleware (not just hidden in the UI).

**Financial integrity** — double-entry journal engine rejects unbalanced entries;
money handled as integer cents; append-only ledgers (corrections are offsetting
entries, history never mutated); immutable document numbers; per-transaction
exchange-rate snapshots.

**Auditability** — mandatory `audit_logs` writes on: journal postings, stock
movements/adjustments, invoice lifecycle, payments, exchange-rate changes,
permission/user changes, branding changes, data exports, and every tenant
lifecycle transition (past-due, suspension, reactivation) with the policy
recorded in the metadata.

**Auth** — bcrypt cost 12, 10-char minimum passwords, 1-hour JWTs, generic
"invalid credentials" errors (no user enumeration), disabled-user checks on
every request.

**App hardening** — input validation on every endpoint (zod), global error
handler that never leaks internals, security headers, JSON body limits,
parameterised queries throughout (no string-built SQL).

## Client protection = Jonomi protection (the liability design)

The features that protect the client's business are the same ones that protect
Jonomi from claims:

1. **They can always get their data out.** Export works in every account state,
   including suspended and closed. No "hostage data" claim can stick.
2. **Non-payment never destroys their records.** Suspend-then-escrow, stated in
   the UI, the ToS, and enforced in code.
3. **Every number is explainable.** Reports compute from the journal; the journal
   is append-only; the audit log says who did what, when.
4. **Disclaimers where they matter** (see ToS skeleton): the platform records and
   computes; statutory filings remain the client's responsibility with their
   accountant — Jonomi is not a tax adviser.

## Residual risks to manage operationally

- Payroll/PAYE (Phase 2) must not ship without a Zimbabwean accountant's sign-off.
- The default chart of accounts and 15% VAT default require professional review.
- Dunning events are recorded but delivery (SMS/WhatsApp/email) needs a gateway
  integration — reminders that never arrive undermine the fairness of suspension.
- Rate limiting and WAF are deployment-level (see deployment doc), not in-app.
