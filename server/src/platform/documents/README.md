# Documents Platform Contract

Documents defines tenant-scoped storage and retrieval contracts for invoices,
imports, attachments, and future OCR evidence. P1-007 composes the contract
over the existing immutable invoice-PDF snapshots and encrypted capture
payloads. It does not create a general document-management product, OCR,
external object storage, or a new canonical business table.

Writes require explicit tenant/actor context, descriptors carry a stable kind,
and the service rejects scope or byte-size mismatches before invoking its
provider. The application adapter independently scopes reads by tenant and uses
kind-qualified identifiers so document domains cannot collide.
