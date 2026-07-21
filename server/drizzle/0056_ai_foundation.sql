-- P12-001: governed, evidence-backed AI foundation.
-- Agent policy is platform content. Conversation, evidence and call audit are
-- tenant/user scoped; no trigger or function grants AI any business write path.

CREATE TABLE IF NOT EXISTS "ai_agents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "code" text NOT NULL CONSTRAINT "ai_agents_code_unique" UNIQUE,
  "name" text NOT NULL,
  "purpose" text NOT NULL,
  "allowed_tools_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "data_scopes_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "requires_approval_for_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  CONSTRAINT "ai_agents_code_check" CHECK ("code" ~ '^[a-z][a-z0-9-]{2,63}$'),
  CONSTRAINT "ai_agents_name_check" CHECK (length(trim("name")) > 0),
  CONSTRAINT "ai_agents_purpose_check" CHECK (length(trim("purpose")) > 0)
);

CREATE TABLE IF NOT EXISTS "ai_conversations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "user_id" uuid NOT NULL,
  "agent_code" text NOT NULL REFERENCES "ai_agents"("code") ON DELETE RESTRICT,
  "title" text NOT NULL,
  "started_at" timestamptz DEFAULT now() NOT NULL,
  "last_message_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "ai_conversations_user_tenant_fk"
    FOREIGN KEY ("user_id", "tenant_id") REFERENCES "users"("id", "tenant_id") ON DELETE RESTRICT,
  CONSTRAINT "ai_conversations_title_check" CHECK (length(trim("title")) > 0)
);
CREATE INDEX IF NOT EXISTS "ai_conversations_tenant_user_time"
  ON "ai_conversations" ("tenant_id", "user_id", "last_message_at");

CREATE TABLE IF NOT EXISTS "ai_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "conversation_id" uuid NOT NULL REFERENCES "ai_conversations"("id") ON DELETE CASCADE,
  "role" text NOT NULL,
  "content" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "ai_messages_role_check" CHECK ("role" IN ('user', 'assistant', 'system')),
  CONSTRAINT "ai_messages_content_check" CHECK (length(trim("content")) > 0)
);
CREATE INDEX IF NOT EXISTS "ai_messages_conversation_time"
  ON "ai_messages" ("conversation_id", "created_at");

CREATE TABLE IF NOT EXISTS "ai_evidence" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "message_id" uuid NOT NULL REFERENCES "ai_messages"("id") ON DELETE CASCADE,
  "object_type" text NOT NULL,
  "object_id" text NOT NULL,
  "field_names_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "snippet" text NOT NULL,
  CONSTRAINT "ai_evidence_object_type_check" CHECK (length(trim("object_type")) > 0),
  CONSTRAINT "ai_evidence_object_id_check" CHECK (length(trim("object_id")) > 0)
);
CREATE INDEX IF NOT EXISTS "ai_evidence_message" ON "ai_evidence" ("message_id");
CREATE INDEX IF NOT EXISTS "ai_evidence_object" ON "ai_evidence" ("object_type", "object_id");

CREATE TABLE IF NOT EXISTS "ai_audit" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "user_id" uuid NOT NULL,
  "agent_code" text NOT NULL REFERENCES "ai_agents"("code") ON DELETE RESTRICT,
  "action" text NOT NULL,
  "prompt_hash" text NOT NULL,
  "model" text NOT NULL,
  "tokens_in" integer DEFAULT 0 NOT NULL,
  "tokens_out" integer DEFAULT 0 NOT NULL,
  "evidence_count" integer DEFAULT 0 NOT NULL,
  "at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "ai_audit_user_tenant_fk"
    FOREIGN KEY ("user_id", "tenant_id") REFERENCES "users"("id", "tenant_id") ON DELETE RESTRICT,
  CONSTRAINT "ai_audit_action_check" CHECK (length(trim("action")) > 0),
  CONSTRAINT "ai_audit_prompt_hash_check" CHECK ("prompt_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "ai_audit_model_check" CHECK (length(trim("model")) > 0),
  CONSTRAINT "ai_audit_token_counts_check" CHECK ("tokens_in" >= 0 AND "tokens_out" >= 0),
  CONSTRAINT "ai_audit_evidence_count_check" CHECK ("evidence_count" >= 0)
);
CREATE INDEX IF NOT EXISTS "ai_audit_tenant_time" ON "ai_audit" ("tenant_id", "at");
CREATE INDEX IF NOT EXISTS "ai_audit_user_time" ON "ai_audit" ("tenant_id", "user_id", "at");

INSERT INTO "ai_agents" (
  "id", "code", "name", "purpose", "allowed_tools_json",
  "data_scopes_json", "requires_approval_for_json", "active"
) VALUES (
  '12000000-0000-4000-8000-000000000001',
  'object-summariser',
  'Object timeline summariser',
  'Produce evidence-backed, read-only summaries of canonical object timelines.',
  '[]'::jsonb,
  '["Company","Customer","Supplier","Invoice","Payment","Product"]'::jsonb,
  '[]'::jsonb,
  true
) ON CONFLICT ("code") DO NOTHING;

COMMENT ON TABLE "ai_audit" IS
  'P12-001 AI call evidence. Stores prompt hashes and token counts, never raw assembled prompts.';
