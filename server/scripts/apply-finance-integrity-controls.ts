import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";
import { assertSafeFinanceTestDatabase } from "../tests/finance/test-db-guard.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required.");
}
assertSafeFinanceTestDatabase();

const sqlFiles = [
  "drizzle/0007_financial_integrity_controls.sql",
  "drizzle/0029_weighted_average_inventory_valuation.sql",
];
const client = new Client({ connectionString: databaseUrl });

await client.connect();
try {
  for (const file of sqlFiles) {
    await client.query(readFileSync(resolve(file), "utf8"));
  }
  console.log("Applied finance integrity and inventory valuation controls to guarded test database.");
} finally {
  await client.end();
}
