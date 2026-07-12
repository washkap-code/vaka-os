# Book Fifteen - Country Packs

**Version:** 1.0  
**Definition:** Accepted country-pack contract  
**Implementation:** Zimbabwe reference configuration foundation; other markets planned

## 1. Principle

Africa is not one regulatory, linguistic, monetary or commercial market. Core domain logic stays country-neutral. A Country Pack provides approved effective-dated configuration, terminology, documents, rules and adapters for one jurisdiction without forking VAKA OS.

## 2. Pack contract

Every pack declares:

- ISO country and subdivision identifiers, name and supported time zones;
- supported/default currencies, display names, precision, cash rounding and FX sources;
- languages/locales, formatting, terminology and reviewed catalogues;
- organisation/person/address/statutory identifier schemas;
- tax registrations, types, treatments, rates, effective dates, thresholds, documents, returns and evidence;
- payroll/social-security and employment configuration when in scope;
- chart-of-accounts/report/document templates;
- numbering, fiscal periods, retention and electronic-record/signature rules;
- payment, bank, communications, identity, fiscalisation and government adapter catalogue;
- compliance calendar and source provenance;
- data protection/residency/processor considerations;
- research, legal/accounting/tax/security/native-review owners;
- migrations, fixtures, tests, version, release/rollback and availability.

Country packs provide approved rule content to Platform engines. They cannot weaken tenant, permission, audit, ledger, stock, AI or security invariants.

## 3. Zimbabwe reference pack

Current configuration foundation includes country code ZW, USD and technical currency code ZWG displayed to customers as ZiG, standard/zero-rated/exempt treatment vocabulary, effective-dated standard VAT configuration, BP/VAT identifiers and selected ZIMRA/NSSA/company compliance entries.

This is not professional approval of current tax, payroll, fiscalisation, filing dates, terminology or legal completeness. Before GA, qualified Zimbabwe reviewers must approve sources, effective dates, fixtures, documents, reports and customer guidance. English, Shona and Ndebele catalogues require native/domain review.

## 4. Expansion catalogue

Candidate packs include South Africa, Zambia, Botswana, Namibia, Malawi, Mozambique, Kenya, Tanzania, Nigeria and Ghana. Catalogue inclusion means research target only. Each market receives its own discovery, legal/accounting/tax/privacy/security research, partner/provider validation, pack implementation, migration, pilot, professional sign-off and go/no-go.

No market is enabled by copying Zimbabwe or changing currency symbols.

## 5. Research and provenance

Every material rule cites an authoritative source, publication/effective date, reviewer, interpretation, last checked date and next review trigger. Conflicting or uncertain requirements are marked and gated. Changes produce new effective-dated versions; historical transactions retain their original snapshots.

## 6. Pack lifecycle

`research -> proposed -> professional review -> accepted configuration -> implementation -> automated fixtures -> internal -> pilot -> market approval -> GA -> monitored update -> superseded/retired`.

Emergency statutory updates are still reviewed, versioned, tested, communicated and reconciled.

## 7. Acceptance matrix

Currency/exchange; tax determination/calculation/returns; statutory IDs/documents/numbering; payroll where enabled; banking/payments/fiscalisation; privacy/retention; calendar/timezone; language/terminology/layout; mobile/connectivity; migrations; tenant and historical snapshot integrity; provider outage/manual fallback; support/training; and professional approval must pass for the declared scope.

Country availability is an entitlement and release decision, not a tenant-editable flag.
