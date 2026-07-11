# P2-001 — Country Pack Engine (Zimbabwe reference implementation)

**Status:** Approved — next after P1-003
**Programme:** 2 — Finance & Localisation
**Type:** Infrastructure (extraction, zero behaviour change)
**Depends on:** P1-002 (merged)

## Objective

Extract Zimbabwe-specific configuration out of core modules into a declarative country pack, so adding the next country is configuration plus provider adapters — never a rewrite. Zimbabwe becomes the reference implementation.

## Deliverables

1. `server/src/platform/localisation/` — CountryPack contract:
   - country code, currencies (with customer-facing labels: ZiG vs ZWG)
   - effective-dated tax rates and treatments (standard/zero-rated/exempt)
   - statutory identifier fields (BP number, VAT number)
   - compliance calendar entries (VAT returns, annual returns, licence renewals)
   - language catalogue references
2. `server/src/countries/zw.ts` — the Zimbabwe pack, sourcing today's values (15% VAT default, USD/ZWG) from the existing implementation with parity tests.
3. Registry: packs registered in the Platform Kernel container; modules resolve country config through the kernel, never import country files directly.
4. Tests: parity with current hard-coded values; effective-dating; unknown-country fail-closed.

## Forbidden

- Changing any current tax computation or posted financial data.
- Adding a second country in this mission.
- Schema changes (defer until effective-dated rates need persistence).

## Acceptance criteria

- Typecheck + full suite pass; parity tests prove identical VAT/currency behaviour.
- `knowledge-system/10-country-packs/Zimbabwe/README.md` stays in sync.

## Rollback

Revert the merge commit; no data implications (config extraction only).
