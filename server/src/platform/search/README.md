# Search Platform Contract

Search exposes a tenant-scoped query contract. Index providers must enforce
tenant scope themselves and return only records the supplied actor is allowed
to discover. P1-001 provides the boundary, not a production index.
