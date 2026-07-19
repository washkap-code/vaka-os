-- P12-001 rollback. Refuse to discard tenant AI history. The seeded agent may
-- be removed safely when no conversation or call evidence exists.
DO $block$
BEGIN
  IF EXISTS (SELECT 1 FROM "ai_conversations" LIMIT 1)
     OR EXISTS (SELECT 1 FROM "ai_audit" LIMIT 1) THEN
    RAISE EXCEPTION 'Cannot roll back 0056 while AI conversation or audit evidence exists';
  END IF;
END;
$block$;

DELETE FROM "ai_agents" WHERE "code" = 'object-summariser';
DROP TABLE IF EXISTS "ai_audit";
DROP TABLE IF EXISTS "ai_evidence";
DROP TABLE IF EXISTS "ai_messages";
DROP TABLE IF EXISTS "ai_conversations";
DROP TABLE IF EXISTS "ai_agents";
