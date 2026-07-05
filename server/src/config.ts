const DEVELOPMENT_DATABASE_URL =
  "postgresql://jonomi:jonomi_dev@localhost:5432/jonomi_platform";
const DEVELOPMENT_JWT_SECRET =
  "development-only-vaka-jwt-secret-do-not-use-outside-local-development";

const unsafeSecretValues = new Set([
  "dev-secret",
  "change-me",
  "changeme",
  "generate_64_random_bytes",
  "set_strong_password_before_seed",
]);

type RuntimeEnvironment = NodeJS.ProcessEnv;

function valueOf(env: RuntimeEnvironment, name: string): string | undefined {
  const value = env[name]?.trim();
  return value || undefined;
}

function isProduction(env: RuntimeEnvironment): boolean {
  return valueOf(env, "NODE_ENV") === "production";
}

function assertSafeSecret(name: string, value: string, minimumBytes: number): string {
  if (unsafeSecretValues.has(value.toLowerCase())) {
    throw new Error(`${name} contains a known placeholder value`);
  }
  if (Buffer.byteLength(value, "utf8") < minimumBytes) {
    throw new Error(`${name} must contain at least ${minimumBytes} bytes`);
  }
  return value;
}

export function databaseUrl(env: RuntimeEnvironment = process.env): string {
  const configured = valueOf(env, "DATABASE_URL");
  if (configured) return configured;
  if (isProduction(env)) {
    throw new Error("DATABASE_URL is required in production");
  }
  return DEVELOPMENT_DATABASE_URL;
}

export function jwtSecret(env: RuntimeEnvironment = process.env): string {
  const configured = valueOf(env, "JWT_SECRET");
  if (configured) {
    return isProduction(env)
      ? assertSafeSecret("JWT_SECRET", configured, 64)
      : configured;
  }
  if (isProduction(env)) {
    throw new Error("JWT_SECRET is required in production");
  }
  return DEVELOPMENT_JWT_SECRET;
}

export function platformAdminPassword(
  env: RuntimeEnvironment = process.env,
): string {
  const configured = valueOf(env, "PLATFORM_ADMIN_PASSWORD");
  if (!configured) {
    throw new Error("PLATFORM_ADMIN_PASSWORD is required when seeding");
  }
  return assertSafeSecret("PLATFORM_ADMIN_PASSWORD", configured, 16);
}
