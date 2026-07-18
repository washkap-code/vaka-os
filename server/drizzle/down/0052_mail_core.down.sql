-- P9-001 rollback. Mail content is business correspondence and is never
-- silently discarded: rollback must be preceded by a governed export/removal.
DO $block$
BEGIN
  IF EXISTS (SELECT 1 FROM "mail_accounts" LIMIT 1) THEN
    RAISE EXCEPTION 'Refusing P9-001 rollback while mail account or message data exists';
  END IF;
END;
$block$;

DROP TABLE IF EXISTS "mail_object_links";
DROP TABLE IF EXISTS "mail_attachments";
DROP TABLE IF EXISTS "mail_messages";
DROP TABLE IF EXISTS "mail_threads";
DROP TABLE IF EXISTS "mail_folders";
DROP TABLE IF EXISTS "mail_accounts";

UPDATE "roles"
   SET "permissions" = ARRAY(
     SELECT permission
       FROM unnest("permissions") permission
      WHERE permission NOT IN ('mail.read', 'mail.send', 'mail.manage')
   );
