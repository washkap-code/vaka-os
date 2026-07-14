import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";
import { assertSafeFinanceTestDatabase } from "../tests/finance/test-db-guard.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");
assertSafeFinanceTestDatabase();

const sql = readFileSync(resolve("drizzle/0027_finance_report_snapshots.sql"), "utf8");
const client = new Client({ connectionString: databaseUrl });

await client.connect();
try {
  await client.query(sql);
  console.log("Applied finance report snapshot controls to guarded test database.");
} finally {
  await client.end();
}
