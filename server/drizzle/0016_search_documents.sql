-- P1-006: rebuildable, tenant-scoped search index. Canonical Customer,
-- Invoice and Product records remain in their existing owning tables.
CREATE TABLE IF NOT EXISTS "search_documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "entity_type" text NOT NULL,
  "entity_id" uuid NOT NULL,
  "title" text NOT NULL,
  "search_text" text NOT NULL,
  "permission" text NOT NULL,
  "document" jsonb NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "search_documents_entity_type_check"
    CHECK ("entity_type" IN ('customer', 'invoice', 'product')),
  CONSTRAINT "search_documents_permission_check"
    CHECK ("permission" IN ('crm.read', 'accounting.read', 'inventory.read'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "search_documents_tenant_entity"
  ON "search_documents" ("tenant_id", "entity_type", "entity_id");
CREATE INDEX IF NOT EXISTS "search_documents_tenant_title"
  ON "search_documents" ("tenant_id", "entity_type", "title");
