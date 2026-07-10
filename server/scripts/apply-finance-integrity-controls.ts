import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";
import { assertSafeFinanceTestDatabase } from "../tests/finance/test-db-guard.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required.");
}
assertSafeFinanceTestDatabase();

const sql = readFileSync(resolve("drizzle/0007_financial_integrity_controls.sql"), "utf8");
const client = new Client({ connectionString: databaseUrl });

await client.connect();
try {
  await client.query(sql);
  console.log("Applied finance integrity controls to guarded test database.");
} finally {
  await client.end();
}
