# Changelog

## [Unreleased]

### Added

- **Workspace settings:** Added personal-name and company-identity settings,
  colour/logo preview, workspace branding application, registration/tax/address
  fields, and a complete managed-upload/white-label specification.
- **Security:** Added forced first-login password changes for temporary
  credentials, server-side route enforcement, and platform password-change
  audit evidence.
- **Referral foundation:** Added platform-managed codes, immutable
  transactional signup attribution, rule-version snapshots, self-referral
  protection, tenant audit evidence, and referral-link signup capture. This
  does not calculate commissions, grant client access, or issue payouts.
- **Referral review:** Added a platform-only attribution review queue with
  append-only pending, qualified, rejected, and held events, recorded actors,
  reason codes, tenant audit evidence, and database mutation protection.
- **Internal:** Defined the controlled product and technical requirements for
  branded invoice PDFs, invoice delivery, secure customer access, managed
  company logos, and currency-safe dashboard ageing.
- **Internal:** Defined the iOS/Android mobile direction, camera-assisted
  document capture, Zimbabwe payment-provider strategy, governed WhatsApp
  integration, and advanced-capability role/permission model.
- **Internal:** Defined secure Zimbabwean bank statement import, contracted
  read-only feed, transaction matching, and reconciliation requirements.
- **Internal:** Defined explicit tenant ownership, server-side session
  visibility, revocation, and owner-only privacy-minimised activity history.
- **Internal:** Revised Starter, Growth, Business, and Enterprise packaging
  around operational outcomes and defined the required versioned entitlement
  architecture.
- **Internal:** Rebased recommended package prices to USD 19, USD 69, USD 249,
  and Enterprise from USD 599/month, with implementation and provider usage
  separated; prices remain proposed pending commercial validation.
- **Internal:** Defined general referral and Professional Partner account
  models, consent-based client portfolios, recurring commission hypotheses,
  append-only commission accounting, and controlled payouts.

### Changed

- **Internal:** Dashboard and aged-receivables totals are now calculated with
  exact minor-unit arithmetic and displayed separately for USD and ZWG.

### Security

- **Internal:** Production startup now fails closed when the database URL or a
  strong JWT signing secret is missing. Platform-administrator seeding also
  requires an explicit non-placeholder password.
