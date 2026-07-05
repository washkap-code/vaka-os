ALTER TABLE "public"."users"
  ADD COLUMN IF NOT EXISTS "must_change_password" boolean DEFAULT false NOT NULL;

CREATE TABLE IF NOT EXISTS "public"."platform_audit_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid,
  "action" text NOT NULL,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "platform_audit_user_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
);

CREATE INDEX IF NOT EXISTS "platform_audit_time"
  ON "public"."platform_audit_logs" USING btree ("created_at");
