-- P1-005 rollback. Refuse silent loss of operational event evidence.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "platform_events" LIMIT 1) THEN
    RAISE EXCEPTION 'Cannot roll back 0050 while platform event evidence exists';
  END IF;
END $$;

DROP TABLE IF EXISTS "processed_events";
DROP TABLE IF EXISTS "platform_events";
