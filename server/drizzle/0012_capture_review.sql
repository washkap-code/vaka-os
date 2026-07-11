ALTER TABLE "capture_documents"
  ADD COLUMN IF NOT EXISTS "reviewed_by" uuid REFERENCES "users"("id"),
  ADD COLUMN IF NOT EXISTS "reviewed_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "review_note" text;
