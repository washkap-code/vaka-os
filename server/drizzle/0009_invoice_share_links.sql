CREATE TABLE IF NOT EXISTS "invoice_share_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "invoice_id" uuid NOT NULL REFERENCES "invoices"("id"),
  "token_hash" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "revoked_at" timestamp with time zone,
  "viewed_at" timestamp with time zone,
  "created_by" uuid REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "invoice_share_link_token_hash"
  ON "invoice_share_links" ("token_hash");
CREATE INDEX IF NOT EXISTS "invoice_share_link_tenant_invoice"
  ON "invoice_share_links" ("tenant_id", "invoice_id", "created_at");
