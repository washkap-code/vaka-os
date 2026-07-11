# Audit Platform Contract

Audit defines the minimum structured evidence required for material platform
actions. It accepts an injected sink so the existing audit-table writer can be
adapted later without making Platform depend on the current database schema.
