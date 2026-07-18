import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { pool } from "../src/lib.js";

if (process.env.NODE_ENV !== "test") {
  throw new Error("Migration Core test controls require NODE_ENV=test.");
}

const migrationPath = fileURLToPath(new URL("../drizzle/0054_migration_core.sql", import.meta.url));

try {
  // Drizzle push creates the declarative tables and constraints, but custom
  // dependency/audit functions live in SQL migrations. Replaying this fully
  // idempotent additive migration gives local test databases production parity.
  await pool.query(await readFile(migrationPath, "utf8"));
  console.log("Migration Core database controls applied.");
} finally {
  await pool.end();
}
