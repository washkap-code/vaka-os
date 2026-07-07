UPDATE "public"."roles"
SET "permissions" = ARRAY(
  SELECT DISTINCT permission
  FROM unnest("permissions" || ARRAY[
    'bank_transactions.match'
  ]::text[]) AS permission
)
WHERE "name" IN ('Owner', 'Admin');

UPDATE "public"."roles"
SET "permissions" = ARRAY(
  SELECT DISTINCT permission
  FROM unnest("permissions" || ARRAY[
    'bank_accounts.read',
    'bank_transactions.read',
    'bank_transactions.match'
  ]::text[]) AS permission
)
WHERE "name" = 'Accountant';
