import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";
import { assertSafeFinanceTestDatabase } from "../tests/finance/test-db-guard.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");
assertSafeFinanceTestDatabase();

const migrationPaths = [
  "drizzle/0026_canonical_supplier_fields.sql",
  "drizzle/0027_controlled_procurement_lifecycle.sql",
  "drizzle/0028_supplier_bill_three_way_match.sql",
];
const client = new Client({ connectionString: databaseUrl });

await client.connect();
try {
  for (const migrationPath of migrationPaths) {
    await client.query(readFileSync(resolve(migrationPath), "utf8"));
  }
  console.log("Applied procurement integrity controls to guarded test database.");
} finally {
  await client.end();
}
