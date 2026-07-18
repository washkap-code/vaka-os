# PI18N-003 — isiNdebele (nd-ZW) translation certification

**Status:** CERTIFIED — owner self-certification
**Certified by:** Dr. Washington Kapapiro, Owner, VAKA OS
**Date:** 2026-07-18
**Scope:** `web/src/locales/app.nd.ts` and `web/src/locales/home.nd.ts` as at
branch `feature/pi18n-001-locale-framework` (this commit).

## Decision

The original PI18N-003 gate required review by an external qualified
translator. The owner has decided to close the gate by self-certification.

Rationale recorded by the owner: Nguni varieties spoken across Matabeleland
vary regionally. VAKA standardises on widely understood standard isiNdebele
(Zimbabwean isiNdebele) rather than privileging a single regional variety, and the owner — as accountable product owner — accepts and
certifies that terminology on that basis.

## Basis and honesty notes

- The dictionary was machine-drafted in-session (Cowork, session 16b) and then
  reviewed and accepted by the owner. This certification is an owner-level
  product acceptance, not an independent professional translation review.
- English remains the authoritative reference language. Every untranslated key
  falls back to English at runtime, so partial coverage never misleads users.
- Business terms with no settled vernacular equivalent deliberately use
  widely understood borrowings (for example i-invoyisi, iphasiwedi, i-akhawunti).

## Change control

Corrections and additions follow normal change control: edit the dictionary,
keep the key structure identical to `app.en.ts` / `home.en.ts`, run the web
guardrail suites, and record material terminology decisions in this file.
