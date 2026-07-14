import pg from "pg";

const databaseUrl = process.env.DATABASE_URL;
const isProductionBuild = process.env.VERCEL_ENV === "production";

if (!databaseUrl) {
  if (isProductionBuild) {
    throw new Error("DATABASE_URL is required to verify the production runtime schema");
  }
  console.log("Skipping runtime schema check: DATABASE_URL is not set");
  process.exit(0);
}

const required = [
  ["tenants", "country_code"],
  ["users", "must_change_password"],
  ["users", "platform_role_key"],
  ["tenant_ownerships", "tenant_id"],
  ["tenant_ownerships", "owner_user_id"],
  ["user_sessions", "id"],
  ["user_sessions", "refresh_token_hash"],
  ["user_sessions", "previous_refresh_token_hash"],
  ["user_sessions", "assurance_level"],
  ["platform_roles", "key"],
  ["password_reset_requests", "token_hash"],
  ["user_mfa_factors", "encrypted_secret"],
  ["platform_staff_profiles", "user_id"],
  ["platform_restore_drills", "drill_id"],
  ["platform_restore_drills", "achieved_rpo_minutes"],
  ["platform_restore_drill_reviews", "restore_drill_id"],
  ["invoices", "tax_jurisdiction"],
  ["invoices", "tax_date"],
  ["invoices", "tax_treatment"],
  ["invoice_line_items", "tax_treatment"],
  ["invoice_line_items", "tax_amount"],
  ["invoice_line_items", "tax_rate_effective_from"],
  ["invoice_line_items", "tax_rate_effective_to"],
  ["contacts", "address_line_1"],
  ["contacts", "address_line_2"],
  ["contacts", "city"],
  ["contacts", "region"],
  ["contacts", "postal_code"],
  ["contacts", "country_code"],
  ["contacts", "website"],
  ["contacts", "industry"],
  ["contacts", "registration_number"],
  ["contacts", "notes"],
  ["contacts", "deleted_at"],
  ["contacts", "deleted_by"],
  ["record_deletion_requests", "id"],
  ["record_deletion_requests", "status"],
];
const client = new pg.Client({ connectionString: databaseUrl });

try {
  await client.connect();
  const requiredValues = required
    .map(([table, column]) => `('${table}', '${column}')`)
    .join(", ");
  const result = await client.query(
    `select table_name, column_name
       from information_schema.columns
      where table_schema = 'public'
        and (table_name, column_name) in (${requiredValues})`,
  );
  const present = new Set(result.rows.map((row) => `${row.table_name}.${row.column_name}`));
  const missing = required.map(([table, column]) => `${table}.${column}`).filter((key) => !present.has(key));
  if (missing.length) throw new Error(`Runtime schema is not deployment-ready. Missing: ${missing.join(", ")}`);
  console.log("Runtime schema is deployment-ready");
} finally {
  await client.end();
}
