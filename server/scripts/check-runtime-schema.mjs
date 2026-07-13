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
  ["user_sessions", "id"],
  ["invoices", "tax_jurisdiction"],
  ["invoices", "tax_date"],
  ["invoices", "tax_treatment"],
  ["invoice_line_items", "tax_treatment"],
  ["invoice_line_items", "tax_amount"],
  ["invoice_line_items", "tax_rate_effective_from"],
  ["invoice_line_items", "tax_rate_effective_to"],
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
