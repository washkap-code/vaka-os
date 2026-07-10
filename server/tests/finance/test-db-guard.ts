import { pathToFileURL } from "node:url";

type TestDatabaseEnv = Record<string, string | undefined>;

const blockedDatabaseNames = new Set([
  "jonomi_platform",
  "vaka",
  "vaka_platform",
  "postgres",
  "template0",
  "template1",
]);

const localHostnames = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "[::1]",
  "postgres",
]);

function maskDatabaseUrl(url: URL): string {
  const safe = new URL(url.toString());
  safe.username = safe.username ? "***" : "";
  safe.password = safe.password ? "***" : "";
  return safe.toString();
}

export function assertSafeFinanceTestDatabase(env: TestDatabaseEnv = process.env): string {
  if (env.NODE_ENV !== "test") {
    throw new Error("Finance tests require NODE_ENV=test.");
  }

  const rawDatabaseUrl = env.DATABASE_URL?.trim();
  if (!rawDatabaseUrl) {
    throw new Error("Finance tests require an explicit DATABASE_URL.");
  }

  let parsed: URL;
  try {
    parsed = new URL(rawDatabaseUrl);
  } catch {
    throw new Error("Finance test DATABASE_URL is not a valid URL.");
  }

  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    throw new Error("Finance tests require a PostgreSQL DATABASE_URL.");
  }

  const databaseName = parsed.pathname.replace(/^\//, "");
  if (!databaseName || !databaseName.toLowerCase().includes("test")) {
    throw new Error("Finance test database name must clearly include 'test'.");
  }

  if (blockedDatabaseNames.has(databaseName.toLowerCase())) {
    throw new Error("Finance tests refused a non-test database name.");
  }

  const hostname = parsed.hostname.toLowerCase();
  const allowedRemote = env.ALLOW_REMOTE_TEST_DATABASE === "true";
  if (!localHostnames.has(hostname) && !hostname.endsWith(".local") && !allowedRemote) {
    throw new Error("Finance tests require a local test database unless ALLOW_REMOTE_TEST_DATABASE=true.");
  }

  return maskDatabaseUrl(parsed);
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) {
  const maskedUrl = assertSafeFinanceTestDatabase();
  console.log(`Finance test database guard passed for ${maskedUrl}`);
}
