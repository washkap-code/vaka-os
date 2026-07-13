# P1-008 — Canonical Metadata Registry

**Status:** Technically verified read-only registry; dynamic metadata and AI context gated
**Programme:** 1 — Platform Kernel and shared services
**Type:** Read-only governed object/field registry and kernel adapter
**Depends on:** P1-001 metadata contract; P1-002 identity; P1-005 events; P1-006 search adapter

## Outcome

VAKA has one kernel-composed registry describing the canonical Company,
Customer, Invoice and Product objects, their current physical mappings,
permissions, localisation keys, searchable fields, result summaries and future
AI exposure boundaries. Search consumes these definitions instead of owning a
second object/permission catalogue.

The registry is descriptive governance. It does not create new master records,
make metadata dynamically executable, expose business data to AI, or complete
the target Organisation/LegalEntity/Party model.

## Current behaviour

- P1-001 defines provider-backed field definitions and record values, but no
  application metadata provider is composed.
- P1-006 has a tenant-safe Customer/Invoice/Product index with a small hard-coded
  entity/permission map.
- Canonical language is governed by the Business Ontology, Canonical
  Information Model and Enterprise Data Dictionary, while the current compact
  schema uses `tenants`, `contacts`, `invoices` and `products`.
- Tenant currently acts as company/workspace and accounting-entity surrogate;
  it is not the target Organisation or LegalEntity architecture.

## Target behaviour

1. Extend the kernel metadata contract additively with typed object and field
   definitions while preserving existing definition/read/write methods.
2. Compose `METADATA_SERVICE` with an immutable code-seeded provider. Custom
   tenant metadata values remain unsupported; writes fail closed.
3. Seed four governed object definitions:
   - `company` — current `tenants` workspace/company projection, explicitly
     marked as an Organisation/LegalEntity surrogate;
   - `customer` — the CustomerAccount role projected from canonical `contacts`
     where `isCustomer = true`;
   - `invoice` — canonical Invoice from `invoices`;
   - `product` — canonical Product/SKU projection from `products`.
4. Every object records stable key/version, canonical name, source table,
   ownership/surrogate note, title field, lifecycle field, read/write
   permissions, localisation keys, navigation target, search eligibility and
   future AI-context posture.
5. Every governed field records source field, value type, classification,
   localisation key, search/result eligibility and AI exposure (`allowed` or
   `excluded`).
6. Explicitly exclude sensitive or authority-bearing fields from future AI
   context by default, including credentials/session data, contact details/tax
   identifiers, invoice notes, product cost, and all direct ledger/stock writes.
7. Expose an authenticated, tenant-scoped read endpoint for definitions. Return
   only object definitions the verified user can read; metadata membership never
   grants record access.
8. Refactor P1-006 to obtain Customer/Invoice/Product read permissions and
   object descriptors from the metadata registry. Canonical query/mapping code
   remains explicit—metadata cannot select arbitrary tables or execute code.
9. Include stable object descriptors in search results so future UI/navigation
   can use governed labels and navigation targets.
10. Keep future AI consumption read-only, permission-bound and disabled: the
    registry states eligible fields but does not fetch values or call a model.

## Seeded object summary

| Key | Canonical mapping | Current source | Read permission | Search | Current limitation |
|---|---|---|---|---|---|
| `company` | Organisation projection | `tenants` | authenticated tenant user | no | Tenant is not a LegalEntity |
| `customer` | CustomerAccount role | `contacts.isCustomer` | `crm.read` | yes | Party model not yet separated |
| `invoice` | Invoice | `invoices` | `accounting.read` | yes | Tenant remains entity surrogate |
| `product` | Product/SKU projection | `products` | `inventory.read` | yes | Category/variant model incomplete |

## AI boundary

- `aiContext = future-read-only` means a field may be considered by a future
  permission-aware context builder; it is not enabled for model use now.
- `aiExposure = allowed` is still subject to verified tenant, user permission,
  minimisation, purpose, provenance and provider policy at request time.
- `aiExposure = excluded` is fail-closed and cannot be overridden by a client.
- Metadata never gives AI authority to post, change permissions, mutate stock,
  change tax treatment or execute workflow.

## User and measurable business result

- **User:** Platform modules and authorised tenant users inspecting definitions.
- **Problem:** Object names, permissions and exposure rules otherwise drift
  across search, future AI and UI implementations.
- **Result:** One versioned registry describes the supported canonical
  projections and search consumes it.
- **Measure:** Registry invariants, permission filtering and search descriptor
  parity are tested; no forbidden object or field value is returned.

## Security, privacy, localisation and failure behaviour

- Tenant and actor are derived from verified auth; clients cannot choose a
  tenant for definition reads.
- The provider validates tenant scope even though seeds are global code.
- Definitions expose schema/governance descriptors, not record values.
- Object read permission is checked before definitions are returned. Record
  APIs and search still perform their own authorization.
- Stable localisation keys are stored separately from English fallback labels.
  This mission does not claim Shona/Ndebele translations are complete.
- Duplicate object/field keys, invalid navigation targets, ungoverned search permissions or
  unsafe AI exposure fail during registry construction.
- Metadata record writes remain unsupported and fail closed; no write endpoint
  is added.

## Scope

- Additive kernel metadata object/field types and service/provider methods.
- Immutable canonical registry seed and application provider.
- Composition-root `METADATA_SERVICE` registration.
- Authenticated definitions endpoint.
- P1-006 metadata consumption and governed search descriptors.
- Registry, tenant, permission, composition and search-parity tests.
- Ontology/CIM/data-dictionary implementation mapping, platform docs,
  programme status, changelog and completion evidence.

## Out of scope

- New Company, Customer, Invoice, Product, Party, Organisation or LegalEntity
  tables; dynamic schema/custom fields; arbitrary table/field access; metadata
  editing UI; workflow/rule execution; reporting measure registry.
- AI provider calls, value retrieval, embeddings, prompt construction, memory,
  autonomous actions or claims that VAKA AI is live.
- Full target Party/Organisation/LegalEntity migration.
- Metadata for every VAKA object; later missions add governed definitions
  incrementally.

## Acceptance criteria

- Mission pack is committed before implementation.
- Registry contains exactly one stable definition for Company, Customer,
  Invoice and Product with unique fields and documented physical lineage.
- Company and finance definitions disclose the tenant/legal-entity surrogate.
- Sensitive fields default to excluded from future AI context and search.
- Metadata service is composed behind the kernel contract; unsupported writes
  fail closed.
- Definition endpoint is tenant-authenticated, permission-filtered, validated
  and private/no-store.
- P1-006 consumes registry permissions/descriptors without weakening its own
  tenant/result authorization.
- Search results carry stable metadata labels/navigation targets and retain tenant,
  permission, ranking and cursor behaviour.
- No migration or duplicate canonical table is added.
- Full guarded DB suite, server/web typechecks and web build pass.

## Rollback

Revert the registry provider, kernel extensions/composition, endpoint, search
adoption, tests and documentation. P1-006 can return to its prior static
permission/object descriptor map without changing canonical or indexed data.
No schema or stored business record requires rollback.
