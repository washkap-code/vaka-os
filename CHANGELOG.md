# Changelog

## [Unreleased]

### Security

- **Internal:** Production startup now fails closed when the database URL or a
  strong JWT signing secret is missing. Platform-administrator seeding also
  requires an explicit non-placeholder password.
