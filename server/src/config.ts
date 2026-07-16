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

export function mfaEnrollmentAvailable(env: RuntimeEnvironment = process.env): boolean {
  return !isProduction(env) || Boolean(valueOf(env, "MFA_ENCRYPTION_KEY"));
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

export type SmtpTlsMode = "implicit" | "starttls" | "none";

export type EmailDeliveryConfig =
  | { mode: "memory" }
  | {
    mode: "console";
    fromAddress: string;
    fromName: string;
    replyTo: string;
  }
  | {
    mode: "smtp";
    host: string;
    port: number;
    authUser: string;
    authPassword: string;
    fromAddress: string;
    fromName: string;
    replyTo: string;
    tls: SmtpTlsMode;
  };

export interface PaynowProviderConfig {
  integrationId: string;
  integrationKey: string;
  currency: "USD" | "ZWG";
}

/**
 * VAKA subscription collection remains disabled unless explicitly enabled and
 * the complete merchant configuration is present. Tenant settings must never
 * contain these values.
 */
export function paynowProviderConfig(
  env: RuntimeEnvironment = process.env,
): PaynowProviderConfig | null {
  const enabledValue = valueOf(env, "PAYNOW_ENABLED")?.toLowerCase();
  if (enabledValue && enabledValue !== "true" && enabledValue !== "false") {
    throw new Error("PAYNOW_ENABLED must be true or false");
  }
  if (enabledValue !== "true") return null;
  const integrationId = valueOf(env, "PAYNOW_INTEGRATION_ID");
  const integrationKey = valueOf(env, "PAYNOW_INTEGRATION_KEY");
  const configuredCurrency = valueOf(env, "PAYNOW_CURRENCY") ?? "USD";
  if (!integrationId || !integrationKey) {
    throw new Error("PAYNOW_INTEGRATION_ID and PAYNOW_INTEGRATION_KEY are required when Paynow is enabled");
  }
  if (!/^\d+$/.test(integrationId)) throw new Error("PAYNOW_INTEGRATION_ID must be numeric");
  if (configuredCurrency !== "USD" && configuredCurrency !== "ZWG") {
    throw new Error("PAYNOW_CURRENCY must be USD or ZWG");
  }
  if (isProduction(env)) assertSafeSecret("PAYNOW_INTEGRATION_KEY", integrationKey, 16);
  return { integrationId, integrationKey, currency: configuredCurrency };
}

export function paynowEncryptionSecret(env: RuntimeEnvironment = process.env): string {
  const configured = valueOf(env, "PAYNOW_ENCRYPTION_KEY");
  if (configured) {
    return isProduction(env)
      ? assertSafeSecret("PAYNOW_ENCRYPTION_KEY", configured, 32)
      : configured;
  }
  if (isProduction(env) && paynowProviderConfig(env)) {
    throw new Error("PAYNOW_ENCRYPTION_KEY is required when Paynow is enabled in production");
  }
  return jwtSecret(env);
}

/** Absolute public origin used only to build revocable customer document links. */
export function publicAppUrl(env: RuntimeEnvironment = process.env): string {
  const vercelProductionDomain = valueOf(env, "VERCEL_PROJECT_PRODUCTION_URL");
  const configured = valueOf(env, "PUBLIC_APP_URL")
    ?? (vercelProductionDomain ? `https://${vercelProductionDomain}` : undefined);
  if (!configured) {
    if (isProduction(env)) throw new Error(
      "PUBLIC_APP_URL or VERCEL_PROJECT_PRODUCTION_URL is required for production public links",
    );
    return "http://localhost:4000";
  }
  let parsed: URL;
  try { parsed = new URL(configured); } catch { throw new Error("PUBLIC_APP_URL must be a valid URL"); }
  if (isProduction(env) && parsed.protocol !== "https:") throw new Error("PUBLIC_APP_URL must use HTTPS in production");
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("PUBLIC_APP_URL must use HTTP or HTTPS");
  return parsed.toString().replace(/\/$/, "");
}

function booleanValue(env: RuntimeEnvironment, name: string): boolean | undefined {
  const configured = valueOf(env, name)?.toLowerCase();
  if (!configured) return undefined;
  if (configured === "true") return true;
  if (configured === "false") return false;
  throw new Error(`${name} must be true or false`);
}

function emailAddress(env: RuntimeEnvironment, name: string): string | undefined {
  const configured = valueOf(env, name);
  if (configured && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(configured)) {
    throw new Error(`${name} must be a valid email address`);
  }
  return configured;
}

/**
 * Single environment contract for transactional email delivery.
 *
 * Production always uses SMTP and fails validation when any required value is
 * missing. Development and staging stay safe by default and emit rendered
 * messages to the console unless SMTP_ENABLED=true. Tests always use memory.
 */
export function emailDeliveryConfig(
  env: RuntimeEnvironment = process.env,
): EmailDeliveryConfig {
  if (valueOf(env, "NODE_ENV") === "test") return { mode: "memory" };

  const enabled = booleanValue(env, "SMTP_ENABLED");
  if (isProduction(env) && enabled === false) {
    throw new Error("SMTP_ENABLED cannot be false in production");
  }

  const fromAddress = emailAddress(env, "SMTP_FROM_ADDRESS");
  const fromName = valueOf(env, "SMTP_FROM_NAME");
  const replyTo = emailAddress(env, "SMTP_REPLY_TO");
  const useSmtp = isProduction(env) || enabled === true;
  if (!useSmtp) {
    return {
      mode: "console",
      fromAddress: fromAddress ?? "notifications@localhost",
      fromName: fromName ?? "VAKA",
      replyTo: replyTo ?? fromAddress ?? "notifications@localhost",
    };
  }

  const host = valueOf(env, "SMTP_HOST");
  const rawPort = valueOf(env, "SMTP_PORT");
  const authUser = valueOf(env, "SMTP_AUTH_USER");
  const authPassword = valueOf(env, "SMTP_AUTH_PASSWORD");
  const rawTls = valueOf(env, "SMTP_TLS")?.toLowerCase();
  const missing = [
    ["SMTP_HOST", host], ["SMTP_PORT", rawPort], ["SMTP_AUTH_USER", authUser],
    ["SMTP_AUTH_PASSWORD", authPassword], ["SMTP_FROM_ADDRESS", fromAddress],
    ["SMTP_FROM_NAME", fromName], ["SMTP_REPLY_TO", replyTo], ["SMTP_TLS", rawTls],
  ].filter(([, value]) => !value).map(([name]) => name);
  if (missing.length) {
    throw new Error(`SMTP configuration is incomplete; missing: ${missing.join(", ")}`);
  }

  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("SMTP_PORT must be an integer between 1 and 65535");
  }
  if (rawTls !== "implicit" && rawTls !== "starttls" && rawTls !== "none") {
    throw new Error("SMTP_TLS must be implicit, starttls or none");
  }
  if (isProduction(env) && rawTls === "none") {
    throw new Error("SMTP_TLS cannot be none in production");
  }
  if (isProduction(env)) assertSafeSecret("SMTP_AUTH_PASSWORD", authPassword!, 16);

  return {
    mode: "smtp",
    host: host!,
    port,
    authUser: authUser!,
    authPassword: authPassword!,
    fromAddress: fromAddress!,
    fromName: fromName!,
    replyTo: replyTo!,
    tls: rawTls,
  };
}
