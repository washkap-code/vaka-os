# Metadata Platform Contract

Metadata provides extensible, typed definitions for future modules and country
packs. Definitions and values remain provider-backed so metadata cannot bypass
module validation, permissions, or audit rules.

P1-008 composes `METADATA_SERVICE` with an immutable, read-only registry for
Company, Customer, Supplier, Invoice and Product. Each definition records
canonical and physical lineage, tenant scope, permissions, localisation keys,
navigation, search/result posture and explicit future-AI exposure per field.
Company is honestly marked as the current tenant-backed
Organisation/LegalEntity surrogate; Customer and Supplier are roles on
`contacts` until the target Party model exists.

The schema-backed `METADATA_REGISTRY` is a separate internal kernel contract
for canonical object shape and pure payload validation. It registers Company,
Customer, Supplier, Invoice, Payment, Product, Employee and User plus the
internal MailAccount, MailFolder, MailThread, MailMessage, MailAttachment and
MailObjectLink objects, with field names pinned by tests to the current Drizzle
tables. Mail bodies, address JSON and credential envelopes are restricted and
AI-hidden. It provides `getObject`,
`getFields`, `getRelationships`, `listObjects` and `validate`; it does not read
or write the database. `required` describes caller-supplied create shape,
while system-derived tenant, identity, lifecycle and timestamp fields remain
optional to this validator. `unique` records primary/unique-index shape and
rejects empty unique-field values; cross-record uniqueness remains the
database/service responsibility because validation is deliberately pure.

This internal expansion does not replace or broaden the existing P1-008
`METADATA_SERVICE`, authenticated definitions endpoint or search contract.
Those compatibility surfaces keep their current five-object provider. No UI,
dynamic metadata, AI context builder or metadata-driven write path is enabled.

The authenticated definitions endpoint returns descriptors only and filters
objects by verified permissions. It never returns record values. Restricted
fields and internal identifiers are excluded from future AI context by default;
no AI provider, prompt/context builder or model access is enabled. Custom
metadata values and writes remain unimplemented and fail closed.
