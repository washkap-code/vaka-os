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

/**
 * Dedicated capture encryption material is preferred. During the migration
 * period, the JWT secret remains a compatibility fallback so existing
 * deployments do not stop serving captured evidence when the new field is
 * introduced. Production environments should set CAPTURE_ENCRYPTION_KEY and
 * rotate it only through a planned decrypt-and-re-encrypt migration.
 */
export function captureEncryptionSecret(env: RuntimeEnvironment = process.env): string {
  const configured = valueOf(env, "CAPTURE_ENCRYPTION_KEY");
  if (configured) {
    return isProduction(env)
      ? assertSafeSecret("CAPTURE_ENCRYPTION_KEY", configured, 32)
      : configured;
  }
  return jwtSecret(env);
}

/**
 * Stable encryption/HMAC material for MFA factors and recovery codes. Keep it
 * separate from JWT signing so routine session-key rotation cannot lock out
 * enrolled users. The fallback keeps existing deployments bootable while the
 * dedicated key is introduced; production must set the dedicated value before
 * any factor is enrolled.
 */
export function mfaEncryptionSecret(env: RuntimeEnvironment = process.env): string {
  const configured = valueOf(env, "MFA_ENCRYPTION_KEY");
  if (configured) {
    return isProduction(env)
      ? assertSafeSecret("MFA_ENCRYPTION_KEY", configured, 32)
      : configured;
  }
  return jwtSecret(env);
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

export interface EmailProviderConfig {
  url: string;
  token: string;
  from: string;
}

/** Absolute public origin used only to build revocable customer document links. */
export function publicAppUrl(env: RuntimeEnvironment = process.env): string {
  const configured = valueOf(env, "PUBLIC_APP_URL");
  if (!configured) {
    if (isProduction(env)) throw new Error("PUBLIC_APP_URL is required for production document delivery");
    return "http://localhost:4000";
  }
  let parsed: URL;
  try { parsed = new URL(configured); } catch { throw new Error("PUBLIC_APP_URL must be a valid URL"); }
  if (isProduction(env) && parsed.protocol !== "https:") throw new Error("PUBLIC_APP_URL must use HTTPS in production");
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("PUBLIC_APP_URL must use HTTP or HTTPS");
  return parsed.toString().replace(/\/$/, "");
}

/** Provider-neutral HTTP email transport. An absent provider remains unavailable; partial config is invalid. */
export function emailProviderConfig(
  env: RuntimeEnvironment = process.env,
): EmailProviderConfig | null {
  const url = valueOf(env, "EMAIL_PROVIDER_URL");
  const token = valueOf(env, "EMAIL_PROVIDER_TOKEN");
  const from = valueOf(env, "EMAIL_FROM");
  if (!url && !token && !from) return null;
  if (!url || !token || !from) {
    throw new Error("EMAIL_PROVIDER_URL, EMAIL_PROVIDER_TOKEN and EMAIL_FROM must be configured together");
  }
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new Error("EMAIL_PROVIDER_URL must be a valid HTTPS URL"); }
  if (parsed.protocol !== "https:") throw new Error("EMAIL_PROVIDER_URL must use HTTPS");
  if (isProduction(env)) assertSafeSecret("EMAIL_PROVIDER_TOKEN", token, 24);
  return { url: parsed.toString(), token, from };
}
