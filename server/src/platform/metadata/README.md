# Metadata Platform Contract

Metadata provides extensible, typed definitions for future modules and country
packs. Definitions and values remain provider-backed so metadata cannot bypass
module validation, permissions, or audit rules.

P1-008 composes `METADATA_SERVICE` with an immutable, read-only registry for
Company, Customer, Invoice and Product. Each definition records canonical and
physical lineage, tenant scope, permissions, localisation keys, navigation,
search/result posture and explicit future-AI exposure per field. Company is
honestly marked as the current tenant-backed Organisation/LegalEntity surrogate;
Customer is a role on `contacts` until the target Party model exists.

The authenticated definitions endpoint returns descriptors only and filters
objects by verified permissions. It never returns record values. Restricted
fields and internal identifiers are excluded from future AI context by default;
no AI provider, prompt/context builder or model access is enabled. Custom
metadata values and writes remain unimplemented and fail closed.
