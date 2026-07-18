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

const alwaysRequired = [
  ["tenants", "country_code"],
  ["tenants", "invoice_payment_terms"],
  ["tenants", "invoice_bank_name"],
  ["tenants", "invoice_bank_account_name"],
  ["tenants", "invoice_bank_account_number"],
  ["tenants", "invoice_bank_branch"],
  ["tenants", "invoice_bank_swift_code"],
  ["tenants", "invoice_bank_currency"],
  ["tenants", "show_vat_number_on_invoices"],
  ["tenants", "sign_out_destination"],
  ["tenants", "idle_sign_out_enabled"],
  ["tenants", "idle_sign_out_minutes"],
  ["tenants", "holding_page_heading"],
  ["tenants", "holding_page_message"],
  ["tenants", "holding_offer_title"],
  ["tenants", "holding_offer_body"],
  ["tenants", "holding_offer_cta_label"],
  ["tenants", "holding_offer_cta_url"],
  ["users", "must_change_password"],
  ["users", "platform_role_key"],
  ["tenant_ownerships", "tenant_id"],
  ["tenant_ownerships", "owner_user_id"],
  ["user_sessions", "id"],
  ["user_sessions", "refresh_token_hash"],
  ["user_sessions", "previous_refresh_token_hash"],
  ["user_sessions", "refresh_rotated_at"],
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
  ["subscription_payment_attempts", "merchant_reference"],
  ["subscription_payment_attempts", "encrypted_poll_url"],
  ["subscription_payment_attempts", "status"],
  ["finance_report_snapshots", "tenant_id"],
  ["finance_report_snapshots", "report_document"],
  ["finance_report_snapshots", "branding_document"],
  ["finance_report_snapshots", "checksum"],
  ["finance_report_snapshots", "idempotency_key"],
  ["accounting_periods", "tenant_id"],
  ["accounting_periods", "period_month"],
  ["accounting_periods", "status"],
  ["workflow_definitions", "steps_json"],
  ["workflow_instances", "current_step"],
  ["workflow_actions", "action"],
  ["notifications", "user_id"],
  ["notifications", "priority"],
  ["notifications", "read_at"],
  ["notification_preferences", "user_id"],
  ["notification_preferences", "enabled"],
  ["platform_events", "event_type"],
  ["platform_events", "payload_json"],
  ["platform_events", "status"],
  ["platform_events", "retry_count"],
  ["processed_events", "handler_name"],
  ["processed_events", "event_id"],
];
const gatedRequirements = {
  "migration.hub": [
    ["migration_projects", "tenant_id"],
    ["migration_steps", "project_id"],
    ["migration_open_items", "step_id"],
  ],
  "network.directory": [
    ["business_profiles", "accept_enquiries"],
    ["directory_enquiries", "profile_id"],
  ],
  "documents.workspace": [
    ["workspace_documents", "retention_until"],
    ["document_approvals", "document_id"],
  ],
};
const client = new pg.Client({ connectionString: databaseUrl });

try {
  await client.connect();
  const enabledResult = await client.query(
    `select distinct feature_key
       from tenant_feature_flags
      where enabled is true
        and feature_key = any($1::text[])`,
    [Object.keys(gatedRequirements)],
  );
  const enabledFeatures = new Set(enabledResult.rows.map((row) => row.feature_key));
  const required = [
    ...alwaysRequired,
    ...Object.entries(gatedRequirements)
      .filter(([featureKey]) => enabledFeatures.has(featureKey))
      .flatMap(([, requirements]) => requirements),
  ];
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
  const enabledSummary = [...enabledFeatures].sort().join(", ") || "none";
  console.log(`Runtime schema is deployment-ready (enabled gated features: ${enabledSummary})`);
} finally {
  await client.end();
}
