import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";
import { assertSafeFinanceTestDatabase } from "../tests/finance/test-db-guard.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");
assertSafeFinanceTestDatabase();

const migration = readFileSync(resolve("drizzle/0051_platform_universal_audit.sql"), "utf8");
const client = new Client({ connectionString: databaseUrl });

await client.connect();
try {
  await client.query("BEGIN");
  await client.query(migration);
  await client.query("COMMIT");
  console.log("Applied universal audit hash-chain and append-only controls to guarded test database.");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}

