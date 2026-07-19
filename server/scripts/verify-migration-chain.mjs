import { execFileSync } from "node:child_process";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;
const serverDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoDir = resolve(serverDir, "..");
const drizzleDir = resolve(serverDir, "drizzle");
const migrationReservationsPath = resolve(drizzleDir, "migration-reservations.json");
const scratchDir = resolve(serverDir, ".migration-verification");
const baselineSchemaPath = resolve(scratchDir, "baseline-schema.ts");
const baselineCommit = "0c0472f7591725ad758fdc0f6dbabdca98d03c21";
const targetUrl = process.env.DATABASE_URL?.trim();

if (process.env.NODE_ENV !== "test") {
  throw new Error("Migration verification requires NODE_ENV=test.");
}
if (!targetUrl) throw new Error("Migration verification requires DATABASE_URL.");

const parsedTarget = new URL(targetUrl);
const databaseName = parsedTarget.pathname.replace(/^\//, "");
const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "postgres"]);
if (!["postgres:", "postgresql:"].includes(parsedTarget.protocol)) {
  throw new Error("Migration verification requires PostgreSQL.");
}
if (!databaseName.toLowerCase().includes("test")) {
  throw new Error("Migration verification database name must include 'test'.");
}
if (!localHosts.has(parsedTarget.hostname.toLowerCase()) && !parsedTarget.hostname.endsWith(".local")) {
  throw new Error("Migration verification refuses non-local databases.");
}
if (!/^[a-zA-Z0-9_]+$/.test(databaseName)) {
  throw new Error("Migration verification requires a simple database name.");
}

const referenceDatabase = `${databaseName}_drizzle_reference`;
if (referenceDatabase.length > 63) throw new Error("Reference database name exceeds PostgreSQL's limit.");
const adminUrl = new URL(parsedTarget);
adminUrl.pathname = "/postgres";
const referenceUrl = new URL(parsedTarget);
referenceUrl.pathname = `/${referenceDatabase}`;

// Historical migrations use a mixture of explicit and PostgreSQL-generated
// constraint names. The 0042–0044 tables are checked by name because those
// migrations were repaired to match Drizzle's generated names; older tables
// remain compared by type and definition, which is the portable contract.
const namedConstraintTables = new Set([
  "migration_projects",
  "migration_steps",
  "migration_open_items",
  "directory_enquiries",
  "document_approvals",
]);

function runDrizzlePush(schemaPath, databaseUrl) {
  const drizzle = resolve(serverDir, "node_modules/.bin/drizzle-kit");
  return execFileSync(drizzle, [
    "push",
    "--force",
    "--dialect", "postgresql",
    "--schema", schemaPath,
    "--url", databaseUrl,
  ], {
    cwd: serverDir,
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function assertEmptyDatabase(client) {
  const result = await client.query(`
    SELECT count(*)::integer AS count
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relkind IN ('r', 'p')
  `);
  if (result.rows[0].count !== 0) {
    throw new Error(`Migration verification requires an empty database; found ${result.rows[0].count} tables.`);
  }
}

async function prepareHistoricalBaseline(client) {
  let baselineSource;
  try {
    baselineSource = execFileSync(
      "git",
      ["show", `${baselineCommit}:server/src/db/schema.ts`],
      { cwd: repoDir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch {
    throw new Error(`Historical baseline commit ${baselineCommit} is unavailable. CI checkout must use fetch-depth: 0.`);
  }

  await mkdir(scratchDir, { recursive: true });
  await writeFile(baselineSchemaPath, baselineSource, "utf8");
  runDrizzlePush(baselineSchemaPath, targetUrl);

  // Migrations 0022, 0023 and 0025 predate the dedicated-database plan and
  // revoke access from Supabase roles without checking for their existence.
  // NOLOGIN compatibility roles reproduce that historical environment without
  // granting access and make a vanilla PostgreSQL replay deterministic.
  await client.query(`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      CREATE ROLE anon NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      CREATE ROLE authenticated NOLOGIN;
    END IF;
  END $$;`);
}

async function numberedMigrations() {
  const names = (await readdir(drizzleDir))
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort();
  const actualByPrefix = new Map();
  for (const name of names) {
    const prefix = Number(name.slice(0, 4));
    if (actualByPrefix.has(prefix)) throw new Error(`Migration prefix ${name.slice(0, 4)} is duplicated.`);
    actualByPrefix.set(prefix, name);
  }
  const parsed = JSON.parse(await readFile(migrationReservationsPath, "utf8"));
  if (!parsed || !Array.isArray(parsed.reserved)) {
    throw new Error("Migration reservations must contain a reserved array.");
  }
  const reservedByPrefix = new Map();
  for (const reservation of parsed.reserved) {
    if (!Number.isInteger(reservation?.prefix) || reservation.prefix < 0
      || typeof reservation.filename !== "string"
      || !/^\d{4}_.+\.sql$/.test(reservation.filename)
      || Number(reservation.filename.slice(0, 4)) !== reservation.prefix
      || typeof reservation.mission !== "string" || !reservation.mission.trim()) {
      throw new Error("Migration reservation is malformed.");
    }
    if (reservedByPrefix.has(reservation.prefix)) {
      throw new Error(`Migration reservation prefix ${reservation.prefix} is duplicated.`);
    }
    reservedByPrefix.set(reservation.prefix, reservation);
  }
  const lastPrefix = Math.max(...actualByPrefix.keys());
  for (let position = 0; position <= lastPrefix; position += 1) {
    const actual = actualByPrefix.get(position);
    const reservation = reservedByPrefix.get(position);
    if (!actual && !reservation) {
      throw new Error(`Migration sequence is not contiguous at ${String(position).padStart(4, "0")}.`);
    }
    if (actual && reservation && actual !== reservation.filename) {
      throw new Error(`Migration ${actual} conflicts with reserved filename ${reservation.filename}.`);
    }
  }
  return names;
}

async function applyMigrations(client) {
  const migrations = await numberedMigrations();
  const forbiddenInTransaction = /\b(CREATE\s+(UNIQUE\s+)?INDEX\s+CONCURRENTLY|REINDEX\s+CONCURRENTLY|VACUUM|ALTER\s+TYPE\b[\s\S]*\bADD\s+VALUE)\b/i;

  for (const name of migrations) {
    const migrationSql = await readFile(resolve(drizzleDir, name), "utf8");
    if (forbiddenInTransaction.test(migrationSql)) {
      throw new Error(`${name} contains a statement that cannot run in the enforced transaction.`);
    }
    try {
      await client.query("BEGIN");
      await client.query(migrationSql);
      await client.query("COMMIT");
      console.log(`Applied transactionally: ${name}`);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`${name} failed and was rolled back: ${reason}`);
    }
  }
  return migrations;
}

const catalogueQueries = {
  tables: `
    SELECT relation.relname AS table_name, relation.relrowsecurity AS row_level_security
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public' AND relation.relkind IN ('r', 'p')
    ORDER BY relation.relname
  `,
  columns: `
    SELECT relation.relname AS table_name,
           attribute.attname AS column_name,
           format_type(attribute.atttypid, attribute.atttypmod) AS data_type,
           attribute.attnotnull AS not_null,
           COALESCE(pg_get_expr(default_value.adbin, default_value.adrelid), '') AS default_value
    FROM pg_attribute attribute
    JOIN pg_class relation ON relation.oid = attribute.attrelid
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    LEFT JOIN pg_attrdef default_value
      ON default_value.adrelid = attribute.attrelid AND default_value.adnum = attribute.attnum
    WHERE namespace.nspname = 'public'
      AND relation.relkind IN ('r', 'p')
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
    ORDER BY relation.relname, attribute.attname
  `,
  constraints: `
    SELECT relation.relname AS table_name,
           constraint_record.conname AS constraint_name,
           constraint_record.contype AS constraint_type,
           pg_get_constraintdef(constraint_record.oid, true) AS definition
    FROM pg_constraint constraint_record
    JOIN pg_class relation ON relation.oid = constraint_record.conrelid
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND constraint_record.contype <> 'u'
    ORDER BY relation.relname, constraint_record.contype, constraint_record.conname, definition
  `,
  indexes: `
    SELECT table_record.relname AS table_name,
           regexp_replace(
             pg_get_indexdef(index_record.indexrelid),
             '^CREATE (UNIQUE )?INDEX [^ ]+ ON ',
             'CREATE \\1INDEX ON '
           ) AS definition
    FROM pg_index index_record
    JOIN pg_class table_record ON table_record.oid = index_record.indrelid
    JOIN pg_namespace namespace ON namespace.oid = table_record.relnamespace
    WHERE namespace.nspname = 'public'
    ORDER BY table_record.relname, definition
  `,
  enums: `
    SELECT type_record.typname AS enum_name,
           enum_record.enumsortorder AS sort_order,
           enum_record.enumlabel AS enum_value
    FROM pg_type type_record
    JOIN pg_enum enum_record ON enum_record.enumtypid = type_record.oid
    JOIN pg_namespace namespace ON namespace.oid = type_record.typnamespace
    WHERE namespace.nspname = 'public'
    ORDER BY type_record.typname, enum_record.enumsortorder
  `,
};

async function readCatalogue(client) {
  const catalogue = {};
  for (const [section, query] of Object.entries(catalogueQueries)) {
    const rows = (await client.query(query)).rows;
    catalogue[section] = section === "columns"
      ? rows.map((row) => ({
          ...row,
          default_value: row.default_value.replace(/^'(-?\d+(?:\.\d+)?)'::numeric$/, "$1"),
        }))
      : rows;
  }
  return catalogue;
}

function comparableRows(section, rows) {
  if (section !== "constraints") return rows;
  return rows.map((row) => {
    if (namedConstraintTables.has(row.table_name)) return row;
    const { constraint_name: _constraintName, ...withoutName } = row;
    return withoutName;
  });
}

function diffRows(section, actualRows, expectedRows) {
  const actual = new Set(comparableRows(section, actualRows).map((row) => JSON.stringify(row)));
  const expected = new Set(comparableRows(section, expectedRows).map((row) => JSON.stringify(row)));
  return {
    missing: [...expected].filter((row) => !actual.has(row)).map(JSON.parse),
    unexpected: [...actual].filter((row) => !expected.has(row)).map(JSON.parse),
  };
}

function assertNoStructuralDrift(migrated, expected) {
  let hasDrift = false;
  for (const section of Object.keys(catalogueQueries)) {
    const difference = diffRows(section, migrated[section], expected[section]);
    if (difference.missing.length || difference.unexpected.length) {
      hasDrift = true;
      console.error(`Schema drift in ${section}:`);
      if (difference.missing.length) console.error("  Missing from migrated database:", difference.missing);
      if (difference.unexpected.length) console.error("  Unexpected in migrated database:", difference.unexpected);
    }
  }
  if (hasDrift) throw new Error("Migration-produced schema differs from the current Drizzle model.");
}

const adminClient = new Client({ connectionString: adminUrl.toString() });
const targetClient = new Client({ connectionString: targetUrl });
let referenceClient;
let adminConnected = false;

try {
  await targetClient.connect();
  await assertEmptyDatabase(targetClient);
  await prepareHistoricalBaseline(targetClient);
  const migrations = await applyMigrations(targetClient);

  await adminClient.connect();
  adminConnected = true;
  await adminClient.query(`DROP DATABASE IF EXISTS "${referenceDatabase}" WITH (FORCE)`);
  await adminClient.query(`CREATE DATABASE "${referenceDatabase}"`);
  runDrizzlePush(resolve(serverDir, "src/db/schema.ts"), referenceUrl.toString());

  referenceClient = new Client({ connectionString: referenceUrl.toString() });
  await referenceClient.connect();
  assertNoStructuralDrift(
    await readCatalogue(targetClient),
    await readCatalogue(referenceClient),
  );
  console.log(`Migration verification passed: ${migrations[0]} through ${migrations.at(-1)}; zero structural drift.`);
} finally {
  if (referenceClient) await referenceClient.end().catch(() => {});
  await targetClient.end().catch(() => {});
  if (!adminConnected) {
    await adminClient.connect().then(() => { adminConnected = true; }).catch(() => {});
  }
  if (adminConnected) {
    await adminClient.query(`DROP DATABASE IF EXISTS "${referenceDatabase}" WITH (FORCE)`).catch(() => {});
    await adminClient.end().catch(() => {});
  }
  await rm(scratchDir, { recursive: true, force: true }).catch(() => {});
}
