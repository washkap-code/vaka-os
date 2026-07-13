import pg from "pg";

const databaseUrl = process.env.DATABASE_URL;
const isProductionBuild = process.env.VERCEL_ENV === "production";

if (!databaseUrl) {
  if (isProductionBuild) {
    throw new Error("DATABASE_URL is required to verify the production authentication schema");
  }
  console.log("Skipping authentication schema check: DATABASE_URL is not set");
  process.exit(0);
}

const required = [
  ["tenants", "country_code"],
  ["users", "must_change_password"],
  ["user_sessions", "id"],
];
const client = new pg.Client({ connectionString: databaseUrl });

try {
  await client.connect();
  const result = await client.query(
    `select table_name, column_name
       from information_schema.columns
      where table_schema = 'public'
        and (table_name, column_name) in (('tenants', 'country_code'), ('users', 'must_change_password'), ('user_sessions', 'id'))`,
  );
  const present = new Set(result.rows.map((row) => `${row.table_name}.${row.column_name}`));
  const missing = required.map(([table, column]) => `${table}.${column}`).filter((key) => !present.has(key));
  if (missing.length) throw new Error(`Authentication schema is not deployment-ready. Missing: ${missing.join(", ")}`);
  console.log("Authentication schema is deployment-ready");
} finally {
  await client.end();
}
