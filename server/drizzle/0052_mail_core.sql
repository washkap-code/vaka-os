-- P9-001: tenant-scoped VAKA Mail core (IMAP/SMTP accounts, folders,
-- messages, threading, document-backed attachments and object links).

CREATE TABLE IF NOT EXISTS "mail_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "owner_user_id" uuid NOT NULL,
  "type" text NOT NULL,
  "email_address" text NOT NULL,
  "display_name" text NOT NULL,
  "imap_config_encrypted" text NOT NULL,
  "smtp_config_encrypted" text NOT NULL,
  "sync_status" text DEFAULT 'IDLE' NOT NULL,
  "last_sync_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "mail_accounts_id_tenant_unique" UNIQUE ("id", "tenant_id"),
  CONSTRAINT "mail_accounts_id_tenant_owner_unique" UNIQUE ("id", "tenant_id", "owner_user_id"),
  CONSTRAINT "mail_accounts_owner_tenant_fk" FOREIGN KEY ("owner_user_id", "tenant_id")
    REFERENCES "users"("id", "tenant_id") ON DELETE RESTRICT,
  CONSTRAINT "mail_accounts_type_check" CHECK ("type" IN ('imap', 'shared')),
  CONSTRAINT "mail_accounts_address_check" CHECK (length(trim("email_address")) BETWEEN 3 AND 254),
  CONSTRAINT "mail_accounts_display_name_check" CHECK (length(trim("display_name")) BETWEEN 1 AND 160),
  CONSTRAINT "mail_accounts_sync_status_check" CHECK ("sync_status" IN ('IDLE', 'SYNCING', 'ERROR', 'DISABLED'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "mail_accounts_tenant_address_unique"
  ON "mail_accounts" ("tenant_id", lower("email_address"));
CREATE INDEX IF NOT EXISTS "mail_accounts_tenant_owner" ON "mail_accounts" ("tenant_id", "owner_user_id");
CREATE INDEX IF NOT EXISTS "mail_accounts_tenant_sync" ON "mail_accounts" ("tenant_id", "sync_status", "last_sync_at");

CREATE TABLE IF NOT EXISTS "mail_folders" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "account_id" uuid NOT NULL,
  "name" text NOT NULL,
  "remote_ref" text NOT NULL,
  "type" text NOT NULL,
  "uid_validity" text,
  "last_uid" bigint DEFAULT 0 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "mail_folders_id_tenant_unique" UNIQUE ("id", "tenant_id"),
  CONSTRAINT "mail_folders_id_account_tenant_unique" UNIQUE ("id", "account_id", "tenant_id"),
  CONSTRAINT "mail_folders_account_remote_unique" UNIQUE ("account_id", "remote_ref"),
  CONSTRAINT "mail_folders_account_tenant_fk" FOREIGN KEY ("account_id", "tenant_id")
    REFERENCES "mail_accounts"("id", "tenant_id") ON DELETE RESTRICT,
  CONSTRAINT "mail_folders_name_check" CHECK (length(trim("name")) BETWEEN 1 AND 255),
  CONSTRAINT "mail_folders_remote_ref_check" CHECK (length(trim("remote_ref")) BETWEEN 1 AND 1000),
  CONSTRAINT "mail_folders_type_check" CHECK ("type" IN ('INBOX', 'SENT', 'DRAFTS', 'TRASH', 'ARCHIVE', 'CUSTOM')),
  CONSTRAINT "mail_folders_last_uid_check" CHECK ("last_uid" >= 0)
);
CREATE INDEX IF NOT EXISTS "mail_folders_tenant_account_type" ON "mail_folders" ("tenant_id", "account_id", "type");

CREATE TABLE IF NOT EXISTS "mail_threads" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "account_id" uuid NOT NULL,
  "subject_normalized" text NOT NULL,
  "last_message_at" timestamptz NOT NULL,
  "message_count" integer DEFAULT 0 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "mail_threads_id_tenant_unique" UNIQUE ("id", "tenant_id"),
  CONSTRAINT "mail_threads_id_account_tenant_unique" UNIQUE ("id", "account_id", "tenant_id"),
  CONSTRAINT "mail_threads_account_tenant_fk" FOREIGN KEY ("account_id", "tenant_id")
    REFERENCES "mail_accounts"("id", "tenant_id") ON DELETE RESTRICT,
  CONSTRAINT "mail_threads_subject_check" CHECK (length("subject_normalized") <= 998),
  CONSTRAINT "mail_threads_message_count_check" CHECK ("message_count" >= 0)
);
CREATE INDEX IF NOT EXISTS "mail_threads_tenant_account_time" ON "mail_threads" ("tenant_id", "account_id", "last_message_at");
CREATE INDEX IF NOT EXISTS "mail_threads_tenant_subject" ON "mail_threads" ("tenant_id", "account_id", "subject_normalized");

CREATE TABLE IF NOT EXISTS "mail_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "account_id" uuid NOT NULL,
  "thread_id" uuid NOT NULL,
  "folder_id" uuid NOT NULL,
  "remote_uid" bigint,
  "remote_uid_validity" text,
  "message_id_hdr" text NOT NULL,
  "in_reply_to" text,
  "references_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "from_json" jsonb NOT NULL,
  "to_json" jsonb NOT NULL,
  "cc_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "subject" text NOT NULL,
  "body_text" text,
  "body_html_sanitized" text,
  "sent_at" timestamptz,
  "received_at" timestamptz,
  "is_read" boolean DEFAULT false NOT NULL,
  "is_draft" boolean DEFAULT false NOT NULL,
  "direction" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "mail_messages_id_tenant_unique" UNIQUE ("id", "tenant_id"),
  CONSTRAINT "mail_messages_id_account_tenant_unique" UNIQUE ("id", "account_id", "tenant_id"),
  CONSTRAINT "mail_messages_thread_account_tenant_fk" FOREIGN KEY ("thread_id", "account_id", "tenant_id")
    REFERENCES "mail_threads"("id", "account_id", "tenant_id") ON DELETE RESTRICT,
  CONSTRAINT "mail_messages_folder_account_tenant_fk" FOREIGN KEY ("folder_id", "account_id", "tenant_id")
    REFERENCES "mail_folders"("id", "account_id", "tenant_id") ON DELETE RESTRICT,
  CONSTRAINT "mail_messages_message_id_check" CHECK (length(trim("message_id_hdr")) BETWEEN 3 AND 998),
  CONSTRAINT "mail_messages_subject_check" CHECK (length("subject") <= 998),
  CONSTRAINT "mail_messages_direction_check" CHECK ("direction" IN ('inbound', 'outbound')),
  CONSTRAINT "mail_messages_timestamp_check" CHECK ("sent_at" IS NOT NULL OR "received_at" IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS "mail_messages_account_message_id_unique" ON "mail_messages" ("account_id", "message_id_hdr");
CREATE UNIQUE INDEX IF NOT EXISTS "mail_messages_remote_uid_unique"
  ON "mail_messages" ("folder_id", "remote_uid_validity", "remote_uid") WHERE "remote_uid" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "mail_messages_tenant_thread_time" ON "mail_messages" ("tenant_id", "thread_id", "received_at", "sent_at");
CREATE INDEX IF NOT EXISTS "mail_messages_tenant_account_folder" ON "mail_messages" ("tenant_id", "account_id", "folder_id");

CREATE TABLE IF NOT EXISTS "mail_attachments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "account_id" uuid NOT NULL,
  "message_id" uuid NOT NULL,
  "filename" text NOT NULL,
  "mime_type" text NOT NULL,
  "size" integer NOT NULL,
  "document_id" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "mail_attachments_message_account_tenant_fk" FOREIGN KEY ("message_id", "account_id", "tenant_id")
    REFERENCES "mail_messages"("id", "account_id", "tenant_id") ON DELETE RESTRICT,
  CONSTRAINT "mail_attachments_filename_check" CHECK (length(trim("filename")) BETWEEN 1 AND 255),
  CONSTRAINT "mail_attachments_mime_type_check" CHECK (length(trim("mime_type")) BETWEEN 1 AND 255),
  CONSTRAINT "mail_attachments_size_check" CHECK ("size" > 0 AND "size" <= 1500000),
  CONSTRAINT "mail_attachments_document_id_check" CHECK (length(trim("document_id")) > 0)
);
CREATE INDEX IF NOT EXISTS "mail_attachments_tenant_message" ON "mail_attachments" ("tenant_id", "message_id");

CREATE TABLE IF NOT EXISTS "mail_object_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "account_id" uuid NOT NULL,
  "message_id" uuid,
  "thread_id" uuid,
  "object_type" text NOT NULL,
  "object_id" text NOT NULL,
  "linked_by" uuid NOT NULL,
  "method" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "mail_object_links_message_account_tenant_fk" FOREIGN KEY ("message_id", "account_id", "tenant_id")
    REFERENCES "mail_messages"("id", "account_id", "tenant_id") ON DELETE RESTRICT,
  CONSTRAINT "mail_object_links_thread_account_tenant_fk" FOREIGN KEY ("thread_id", "account_id", "tenant_id")
    REFERENCES "mail_threads"("id", "account_id", "tenant_id") ON DELETE RESTRICT,
  CONSTRAINT "mail_object_links_actor_tenant_fk" FOREIGN KEY ("linked_by", "tenant_id")
    REFERENCES "users"("id", "tenant_id") ON DELETE RESTRICT,
  CONSTRAINT "mail_object_links_subject_check" CHECK (("message_id" IS NOT NULL) <> ("thread_id" IS NOT NULL)),
  CONSTRAINT "mail_object_links_object_type_check" CHECK (length(trim("object_type")) > 0),
  CONSTRAINT "mail_object_links_object_id_check" CHECK (length(trim("object_id")) > 0),
  CONSTRAINT "mail_object_links_method_check" CHECK ("method" IN ('manual', 'auto'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "mail_object_links_message_object_unique"
  ON "mail_object_links" ("tenant_id", "message_id", "object_type", "object_id") WHERE "message_id" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "mail_object_links_thread_object_unique"
  ON "mail_object_links" ("tenant_id", "thread_id", "object_type", "object_id") WHERE "thread_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "mail_object_links_tenant_object"
  ON "mail_object_links" ("tenant_id", "object_type", "object_id", "created_at");

-- Existing workspaces receive the new capability only through their built-in
-- Owner/Admin roles. Other role assignment remains an explicit tenant choice.
UPDATE "roles"
   SET "permissions" = ARRAY(
     SELECT DISTINCT permission
       FROM unnest("permissions" || ARRAY['mail.read', 'mail.send', 'mail.manage']::text[]) permission
   )
 WHERE "name" IN ('Owner', 'Admin');

COMMENT ON COLUMN "mail_accounts"."imap_config_encrypted" IS
  'AES-256-GCM encrypted IMAP configuration. Plaintext credentials must never be returned or logged.';
COMMENT ON COLUMN "mail_accounts"."smtp_config_encrypted" IS
  'AES-256-GCM encrypted SMTP configuration. Plaintext credentials must never be returned or logged.';
