# CO-006 — Verified Paynow Subscription Collection

**Status:** Approved by the product owner for implementation  
**Programme:** Commercial operations  
**Type:** VAKA subscription payment collection, provider reconciliation and billing-run clarity  
**Depends on:** Existing recurring subscription billing; P1-005 events; platform audit; Zimbabwe provider catalogue

## Outcome

An authorised tenant billing user can pay an open VAKA subscription invoice by
card, EcoCash or OneMoney through Paynow. VAKA records an idempotent payment
attempt, redirects only after verifying the provider initiation response, and
marks the subscription invoice paid only after server-side verification of the
provider result. Platform staff see a clear billing-run summary rather than raw
JSON when no subscriptions are due for action.

Live collection is configuration-gated. The repository must not claim that
payments are active until an approved VAKA Paynow merchant account, production
Integration ID/key, callback origin and live end-to-end evidence exist.

## Current behaviour

- The platform billing run issues due subscription invoices and transitions
  trial, past-due and suspended lifecycle states. A zero result is a successful
  no-op but the administration UI displays its raw JSON.
- Tenant billing can list VAKA subscription invoices but offers no online
  collection action or provider-status evidence.
- Platform staff can manually mark a subscription invoice paid. That route has
  no provider evidence and remains an exceptional operations control.
- No Paynow credential, adapter, payment-attempt record, signed callback or
  reconciliation workflow exists.

## Target behaviour

1. Add a provider-neutral, tenant-owned subscription payment-attempt record
   with exact invoice amount/currency snapshot, immutable merchant reference,
   lifecycle status, provider reference, confidential poll URL, idempotency key,
   actor and timestamps.
2. Add a versioned Paynow adapter using official merchant Integration ID/key
   supplied only through production environment configuration.
3. Initiation re-reads the tenant-owned open subscription invoice, derives all
   amount/currency/reference values server-side and requires `billing.manage`.
4. One active attempt per invoice/idempotency key is replay-safe. The browser
   cannot supply an amount, tenant, status, paid time or provider result.
5. Verify the hash on Paynow initiation before returning a redirect URL. A bad
   or missing hash fails closed and produces no payment-state transition.
6. Process Paynow result notifications as untrusted form data: validate shape,
   resolve the stored attempt, poll Paynow server-to-server, verify the response
   hash and apply only a monotonic normalized status transition.
7. A browser return page may request status refresh but cannot mark an invoice
   paid. Only a verified `PAID` provider result may call the existing controlled
   subscription settlement service.
8. Successful settlement, failure and cancellation are audited without storing
   the Integration Key, poll token, full provider body or unnecessary personal
   data in logs/audit metadata.
9. Provider timeout/unavailability leaves the attempt pending and the invoice
   unchanged. Reconciliation can retry safely.
10. Replace the platform billing-run raw JSON with a dated, labelled result and
    an explicit no-actions-due explanation.

## Finance readiness

1. **Accounting event:** Collection of a VAKA commercial subscription invoice.
2. **Journal:** No tenant ERP journal is created by this bounded mission; VAKA
   corporate ledger integration and reconciliation remain a controlled future
   finance boundary.
3. **Legal entity:** The platform merchant legal entity configured with Paynow;
   legal-entity evidence must be approved before production activation.
4. **Currency:** Exact stored subscription-invoice currency and amount only;
   unsupported provider currency fails closed and no conversion is inferred.
5. **Tax:** Existing subscription invoice treatment is unchanged. This mission
   does not calculate or approve tax.
6. **Audit:** Initiated, provider-confirmed, failed/cancelled and settled events,
   plus the existing tenant-reactivation evidence where applicable.
7. **Reversal:** No refund/reversal is introduced. A later mission must map
   verified refund/reversal/dispute states without editing settled history.
8. **Explanation:** Each attempt links invoice, merchant reference, normalized
   status, provider reference and evidence timestamps.
9. **AI:** No AI access or authority.
10. **Permission:** `billing.manage` to initiate/read tenant attempts;
    `platform.billing.payment.manage` retains manual exception settlement.

## Security, tenant isolation and data protection

- Tenant/user identity comes from authenticated server context. Every invoice
  and attempt read/write is tenant-scoped; callback resolution uses an opaque,
  unique merchant reference and never accepts tenant identity as authority.
- Provider secrets remain environment-only. They are never returned to the
  browser, stored in tenant settings, committed, logged or placed in audit.
- Provider callbacks are rate-limited, bounded and independently verified.
- Redirect and callback origins come from approved server configuration, not
  request headers. Open redirects are prohibited.
- The confidential poll URL is never exposed after initiation and is absent
  from tenant/platform list responses and audit metadata.
- Existing suspend-then-escrow and export/read access are preserved.

## Localisation, accessibility and mobile

- New visible copy enters the typed English catalogue. Shona and Ndebele use
  the documented English fallback pending qualified financial terminology
  review.
- Payment choices, pending state, provider hand-off and failure recovery are
  text-visible, keyboard operable and usable at 320px without relying on colour.
- The user is warned that Paynow opens a secure external payment page and can
  return safely to a status view if the provider is interrupted.

## Acceptance criteria

- Mission Pack is committed before implementation.
- Exact amount/currency and tenant boundaries are derived server-side and tested.
- Duplicate initiation and duplicate callback delivery are idempotent.
- Invalid hashes, spoofed returns and cross-tenant IDs cannot settle an invoice.
- Only verified provider evidence can mark paid/reactivate; pending/failure
  never mutates subscription or tenant lifecycle.
- Configuration absence is truthful and safe; no UI claims live activation.
- Platform billing run displays a useful no-op result and labelled action counts.
- Server tests/typecheck, web typecheck/build, accessibility, migration/runtime
  schema checks and `git diff --check` pass.

## Rollout and rollback

Deploy the additive schema and disabled adapter first. Add approved sandbox
credentials and execute successful, cancelled, invalid-hash and duplicate
callback tests. Production enablement requires merchant/account approval,
configured live callback/return origins and reconciled live evidence. Rollback
disables the provider environment flag and UI initiation; stored attempts and
audit evidence remain for reconciliation and are never deleted.
