# P1-006 — Search Service Adapter

**Status:** Approved for implementation
**Programme:** 1 — Platform Kernel and shared services
**Type:** Tenant-scoped derived index, kernel adapter and read API
**Depends on:** P1-001 search contract; P1-002 identity context; P1-005 event bus

## Outcome

An authenticated tenant user can search the canonical Customer, Invoice and
Product records they are already permitted to read through the Platform Kernel
search contract. Search is backed by a tenant-owned derived index, initially
reconciled from canonical tables and refreshed after commits by best-effort
P1-005 event subscribers.

This is deterministic keyword discovery. It is not semantic/AI search, fuzzy
matching, a cross-tenant platform-admin search, or evidence that durable search
indexing has been completed.

## Current behaviour

- P1-001 defines `SearchServiceContract`, `SearchProvider`, tenant/actor scope,
  entity filters, limits and cursor fields, but no application provider is
  composed.
- P1-005 provides a process-local, post-commit event bus for invoice, payment,
  stock and tenant-lifecycle facts.
- Customers use the canonical `contacts` table; invoices and products already
  have canonical tenant-owned tables. No duplicate master records are needed.
- Users currently navigate separate lists; no unified authenticated search API
  exists.

## Target behaviour

1. Register `SEARCH_SERVICE` in the composition root using the existing kernel
   contract and a PostgreSQL application adapter.
2. Add one derived `search_documents` table with tenant, entity type/entity ID,
   title, normalised searchable text, permission key, minimal result document
   and update time. It is an index, never a canonical business table.
3. Lazily reconcile a tenant's Customer, Invoice and Product index from
   canonical tables before that process serves its first search for the tenant.
   Reconciliation is atomic and idempotent.
4. Add minimal `customer.changed`, `product.changed` and `invoice.changed`
   domain facts where existing events do not identify committed changes. Emit
   them only after successful writes, including contact/product CSV imports.
5. Subscribe through the P1-005 event bus:
   - customer changes re-index that Customer;
   - product changes and stock movements re-index that Product;
   - invoice changes, issue, payment and void events re-index that Invoice.
6. Re-read the canonical tenant-owned record inside every subscriber. Event
   payloads never become index authority.
7. Expose `GET /search` with strict zod query validation for `q`, optional
   `limit`, cursor and an optional allowlist of entity types.
8. Derive tenant, actor and permissions from the verified JWT. The provider
   independently applies tenant and per-result permission filters:
   `crm.read` for Customer, `accounting.read` for Invoice and `inventory.read`
   for Product.
9. Return deterministic ranked results and an opaque cursor. Exact/prefix title
   matches rank ahead of title/keyword matches; ordering is stable.
10. Fail safely on invalid cursors, missing scope or unsupported entity types.

## Indexed document contract

| Entity type | Canonical source | Searchable fields | Returned document | Permission |
|---|---|---|---|---|
| `customer` | `contacts` where `isCustomer = true` | name, tags | id, name, contact type | `crm.read` |
| `invoice` | `invoices` joined to tenant customer | number/status, customer name | id, number, status, currency, total, customer name | `accounting.read` |
| `product` | `products` | SKU, name, description | id, SKU, name, currency, sale price, active/stock flags | `inventory.read` |

Email, phone, address, tax identifiers, notes, costs and ledger detail are not
copied into the index. Search responses contain navigation-safe summaries, not
full records.

## User and measurable business result

- **User:** Any tenant user with at least one relevant read permission.
- **Problem:** Customers, invoices and products can only be discovered in
  separate module lists.
- **Result:** One query returns only the authorised matching entity summaries.
- **Measure:** Cross-tenant and permission tests return no forbidden records;
  event-driven updates are visible after commit; rollbacks publish and index
  nothing; initial reconciliation finds pre-existing records.

## Security, privacy and failure behaviour

- The endpoint accepts no tenant or actor identifier.
- Every canonical read, reconciliation, index write and search query includes
  the authenticated tenant.
- Permission filtering occurs inside the provider even if a route or future
  caller is incorrectly composed.
- Derived documents intentionally minimise personal and financial data.
- Search reads are not material actions and do not add audit noise. Canonical
  writes retain their existing RBAC and audit controls.
- Subscriber failures remain isolated and observable under P1-005. Lazy
  reconciliation repairs missed events after process restart; guaranteed
  continuous delivery still requires an outbox/retry mission.
- Responses use private/no-store caching.

## Localisation, accessibility and mobile

- Normalisation preserves Unicode and uses locale-independent case folding; no
  English-only stemming or country-specific business rule is embedded.
- This mission exposes an API adapter only. A user-facing global-search control,
  keyboard interaction, translated UI copy and mobile result presentation are
  separate product work after P1-008 metadata is available.

## Scope

- Search index schema and additive migration.
- Canonical document mappers, reconciler and event subscribers.
- Composition-root registration behind the kernel search contract.
- Validated authenticated search route.
- Focused service, adapter, tenant, permission, ranking, cursor,
  post-commit/rollback and import-currentness tests.
- Event catalogue, platform-kernel, programme status, changelog and completion
  evidence updates.

## Out of scope

- Duplicate Customer, Company, Invoice or Product tables.
- External search providers, embeddings, AI context, vector indexes, fuzzy
  search, synonyms, saved searches, search analytics or cross-tenant discovery.
- Guaranteed delivery, transactional outbox, retry, replay or dead-letter
  handling.
- A global-search UI; P1-008 metadata adoption; document/attachment search;
  field-level sharing beyond current module permissions.

## Acceptance criteria

- Mission pack is committed before implementation.
- New application code consumes `SearchServiceContract` and the P1-005 event
  bus; the kernel search service is not reimplemented.
- Pre-existing records are found after lazy reconciliation.
- Customer, invoice and product results are correctly ranked and paginated.
- Unsupported filters/cursors and blank/oversized queries fail with 400.
- Tenant A records never appear for Tenant B.
- A user sees only entity types allowed by their verified permissions.
- Successful writes/imports update the derived index after commit; rollback
  events do not change it.
- No unnecessary sensitive fields are stored or returned.
- Migration is additive and applied only to local/CI test databases.
- Full guarded DB suite, server/web typechecks and web production build pass.

## Rollback

Revert the route, composition, event producers/subscribers, adapter, tests and
documentation. The derived `search_documents` table may remain dormant; it is
rebuildable and must never be treated as a retention or canonical-data source.
Do not drop it in a production rollback without a separately reviewed additive
database change.
