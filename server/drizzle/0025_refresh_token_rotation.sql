-- Compatible refresh-session state. Existing access-only sessions remain valid
-- through their current access-token lifetime but cannot renew.

ALTER TABLE "user_sessions"
  ADD COLUMN IF NOT EXISTS "refresh_token_hash" text,
  ADD COLUMN IF NOT EXISTS "previous_refresh_token_hash" text,
  ADD COLUMN IF NOT EXISTS "refresh_rotated_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "assurance_level" text NOT NULL DEFAULT 'aal1';

CREATE UNIQUE INDEX IF NOT EXISTS "user_sessions_refresh_token_hash"
  ON "user_sessions" ("refresh_token_hash")
  WHERE "refresh_token_hash" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "user_sessions_previous_refresh_token_hash"
  ON "user_sessions" ("previous_refresh_token_hash")
  WHERE "previous_refresh_token_hash" IS NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_sessions_assurance_level_check'
  ) THEN
    ALTER TABLE "user_sessions"
      ADD CONSTRAINT "user_sessions_assurance_level_check"
      CHECK ("assurance_level" IN ('aal1', 'aal2'));
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ("refresh_token_hash", "previous_refresh_token_hash")
      ON "user_sessions" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ("refresh_token_hash", "previous_refresh_token_hash")
      ON "user_sessions" FROM authenticated;
  END IF;
END $$;
