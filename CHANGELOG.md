# Changelog

## [Unreleased]

### Added

- **Internal:** Defined the controlled product and technical requirements for
  branded invoice PDFs, invoice delivery, secure customer access, managed
  company logos, and currency-safe dashboard ageing.

### Security

- **Internal:** Production startup now fails closed when the database URL or a
  strong JWT signing secret is missing. Platform-administrator seeding also
  requires an explicit non-placeholder password.
