INSERT INTO plans (name, user_limit, price_amount, price_currency, features)
VALUES
  ('Starter', 1, '19.00', 'USD', '{"inventoryLocations":1}'::jsonb),
  ('Growth', 5, '69.00', 'USD', '{"inventoryLocations":2,"resourceCentre":true}'::jsonb),
  ('Business', 15, '249.00', 'USD', '{"inventoryLocations":5,"approvals":true}'::jsonb),
  ('Enterprise', 999, '599.00', 'USD', '{"whiteLabel":true,"sla":true,"customModules":true}'::jsonb)
ON CONFLICT (name) DO UPDATE SET
  user_limit = EXCLUDED.user_limit,
  price_amount = EXCLUDED.price_amount,
  price_currency = EXCLUDED.price_currency,
  features = EXCLUDED.features;

WITH corrected AS (
  UPDATE users
     SET email = 'washington@africaprocure.com',
         full_name = 'VAKA Platform Administrator',
         status = 'active'
   WHERE tenant_id IS NULL
     AND is_platform_admin = true
     AND email IN ('platform-admin@jonomi.digital', 'waskap@me.com')
     AND NOT EXISTS (
       SELECT 1 FROM users existing
        WHERE existing.email = 'washington@africaprocure.com'
          AND existing.id <> users.id
     )
  RETURNING id, email
)
INSERT INTO platform_audit_logs (user_id, action, metadata)
SELECT id, 'platform_admin.identity_corrected',
       jsonb_build_object('newEmail', email, 'source', 'migration_0020')
  FROM corrected;
