# Search Platform Contract

Search exposes a tenant-scoped query contract. Index providers must enforce
tenant scope themselves and return only records the supplied actor is allowed
to discover.

P1-006 composes `SEARCH_SERVICE` with a PostgreSQL adapter over a rebuildable
`search_documents` index. It covers canonical Customers, Suppliers, Invoices and Products,
reconciles existing tenant records lazily, and consumes post-commit P1-005
events to refresh affected documents. The provider independently filters by
tenant and `crm.read`/`accounting.read`/`inventory.read`; indexed result
documents exclude contact details, tax identifiers, notes, product costs and
ledger detail.

PB-003 adds Black Book discovery through the same provider contract without
copying global registry rows into the tenant index. The provider derives the
country from the authenticated tenant, independently checks
`blackbook.directory`, selects only active entries and returns a minimal
key/name/category/evidence summary. The gated `/blackbook/search` projection
keeps the universal palette available to authenticated Black Book users who do
not otherwise hold a Customer, Supplier, Invoice or Product read permission.
Full payloads and sources remain on the gated Black Book detail endpoint.

The current adapter is bounded deterministic keyword search. P1-005 delivery is
best-effort and process-local, cursors are offset-based, and no scale/SLO,
external provider, fuzzy/semantic search, deletion-event catalogue or global UI
is claimed. A durable outbox/retry path and operational evidence remain future
gates.
