CREATE TABLE IF NOT EXISTS "user_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid REFERENCES "tenants"("id"),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "token_hash" text NOT NULL,
  "client_type" text DEFAULT 'web' NOT NULL,
  "app_version" text,
  "device_description" text,
  "ip_hash" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "idle_expires_at" timestamp with time zone NOT NULL,
  "absolute_expires_at" timestamp with time zone NOT NULL,
  "revoked_at" timestamp with time zone,
  "revoked_by" uuid REFERENCES "users"("id"),
  "revoked_reason" text
);
CREATE UNIQUE INDEX IF NOT EXISTS "user_sessions_token_hash"
  ON "user_sessions" ("token_hash");
CREATE INDEX IF NOT EXISTS "user_sessions_tenant_activity"
  ON "user_sessions" ("tenant_id", "last_seen_at");
CREATE INDEX IF NOT EXISTS "user_sessions_user_activity"
  ON "user_sessions" ("user_id", "last_seen_at");
