import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (process.env.NODE_ENV !== "test") {
  throw new Error("Finance integrity control application requires NODE_ENV=test.");
}
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required.");
}
const parsed = new URL(databaseUrl);
if (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost" && parsed.hostname !== "::1") {
  throw new Error("Refusing to apply finance integrity controls to a non-local database.");
}
if (parsed.pathname.replace(/^\//, "") !== "vaka_os_test") {
  throw new Error("Refusing to apply finance integrity controls outside vaka_os_test.");
}

const sql = readFileSync(resolve("drizzle/0007_financial_integrity_controls.sql"), "utf8");
const client = new Client({ connectionString: databaseUrl });

await client.connect();
try {
  await client.query(sql);
  console.log("Applied finance integrity controls to guarded test database.");
} finally {
  await client.end();
}
