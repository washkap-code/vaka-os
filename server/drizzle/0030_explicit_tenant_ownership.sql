-- Accountable tenant ownership is an explicit identity invariant. Role names
-- continue to describe permissions but no longer confer principal authority.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_id_tenant_unique') THEN
    ALTER TABLE "users" ADD CONSTRAINT "users_id_tenant_unique" UNIQUE ("id", "tenant_id");
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "tenant_ownerships" (
  "tenant_id" uuid PRIMARY KEY REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "owner_user_id" uuid NOT NULL,
  "established_at" timestamptz NOT NULL DEFAULT now(),
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "tenant_ownerships_owner_unique"
  ON "tenant_ownerships" ("owner_user_id");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenant_ownerships_owner_membership_fk') THEN
    ALTER TABLE "tenant_ownerships"
      ADD CONSTRAINT "tenant_ownerships_owner_membership_fk"
      FOREIGN KEY ("owner_user_id", "tenant_id")
      REFERENCES "users"("id", "tenant_id")
      ON DELETE RESTRICT;
  END IF;
END $$;

-- Fail closed if an unmigrated tenant has no single active legacy system Owner.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "tenants" t
    WHERE NOT EXISTS (
      SELECT 1 FROM "tenant_ownerships" ownership WHERE ownership."tenant_id" = t."id"
    )
    AND 1 <> (
      SELECT count(*)
      FROM "users" u
      JOIN "roles" r ON r."id" = u."role_id" AND r."tenant_id" = t."id"
      WHERE u."tenant_id" = t."id"
        AND u."status" = 'active'
        AND r."name" = 'Owner'
        AND r."is_system" = true
    )
  ) THEN
    RAISE EXCEPTION 'Explicit tenant ownership backfill requires exactly one active system Owner per unmigrated tenant';
  END IF;
END $$;

WITH candidates AS (
  SELECT t."id" AS "tenant_id", min(u."id"::text)::uuid AS "owner_user_id"
  FROM "tenants" t
  JOIN "users" u ON u."tenant_id" = t."id" AND u."status" = 'active'
  JOIN "roles" r ON r."id" = u."role_id" AND r."tenant_id" = t."id"
    AND r."name" = 'Owner' AND r."is_system" = true
  WHERE NOT EXISTS (
    SELECT 1 FROM "tenant_ownerships" ownership WHERE ownership."tenant_id" = t."id"
  )
  GROUP BY t."id"
), inserted AS (
  INSERT INTO "tenant_ownerships" ("tenant_id", "owner_user_id")
  SELECT "tenant_id", "owner_user_id" FROM candidates
  ON CONFLICT ("tenant_id") DO NOTHING
  RETURNING "tenant_id", "owner_user_id"
)
INSERT INTO "audit_logs" (
  "tenant_id", "user_id", "action", "entity_type", "entity_id", "metadata"
)
SELECT
  "tenant_id", "owner_user_id", 'security.tenant_ownership_established',
  'tenant_ownership', "tenant_id"::text, '{"source":"migration"}'::jsonb
FROM inserted;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "tenant_ownerships" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "tenant_ownerships" FROM authenticated;
  END IF;
END $$;
