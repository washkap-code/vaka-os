const unsafeSecretValues = new Set([
  "dev-secret",
  "change-me",
  "change_me",
  "changeme",
  "generate_32_random_bytes",
  "generate_64_random_bytes",
  "set_strong_password_before_seed",
]);

type RuntimeEnvironment = NodeJS.ProcessEnv;
export type RuntimeMode = "development" | "test" | "staging" | "production";

function valueOf(env: RuntimeEnvironment, name: string): string | undefined {
  const value = env[name]?.trim();
  return value || undefined;
}

function isProduction(env: RuntimeEnvironment): boolean {
  return valueOf(env, "NODE_ENV") === "production";
}

export function runtimeMode(env: RuntimeEnvironment = process.env): RuntimeMode {
  const configured = valueOf(env, "NODE_ENV");
  if (!configured) throw new Error("NODE_ENV is required");
  if (configured !== "development" && configured !== "test"
    && configured !== "staging" && configured !== "production") {
    throw new Error("NODE_ENV must be development, test, staging or production");
  }
  return configured;
}

/** Load an optional local .env file without ever consulting it in production. */
export function loadLocalEnvironment(env: RuntimeEnvironment = process.env): void {
  if (isProduction(env)) return;
  try {
    process.loadEnvFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

function assertNotPlaceholder(name: string, value: string): string {
  if (unsafeSecretValues.has(value.toLowerCase())) {
    throw new Error(`${name} contains a known placeholder value`);
  }
  return value;
}

function assertSafeSecret(name: string, value: string, minimumBytes: number): string {
  assertNotPlaceholder(name, value);
  if (Buffer.byteLength(value, "utf8") < minimumBytes) {
    throw new Error(`${name} must contain at least ${minimumBytes} bytes`);
  }
  return value;
}

export function databaseUrl(env: RuntimeEnvironment = process.env): string {
  const configured = valueOf(env, "DATABASE_URL");
  if (!configured) throw new Error("DATABASE_URL is required");
  let parsed: URL;
  try {
    parsed = new URL(configured);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL");
  }
  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    throw new Error("DATABASE_URL must use the postgresql protocol");
  }
  if (parsed.password) assertNotPlaceholder("DATABASE_URL password", decodeURIComponent(parsed.password));
  return configured;
}

export function jwtSecret(env: RuntimeEnvironment = process.env): string {
  const configured = valueOf(env, "JWT_SECRET");
  if (!configured) throw new Error("JWT_SECRET is required");
  return isProduction(env)
    ? assertSafeSecret("JWT_SECRET", configured, 64)
    : assertNotPlaceholder("JWT_SECRET", configured);
}

/** Dedicated capture encryption material; never falls back to another key. */
export function captureEncryptionSecret(env: RuntimeEnvironment = process.env): string {
  const configured = valueOf(env, "CAPTURE_ENCRYPTION_KEY");
  if (!configured) throw new Error("CAPTURE_ENCRYPTION_KEY is required");
  return isProduction(env)
    ? assertSafeSecret("CAPTURE_ENCRYPTION_KEY", configured, 32)
    : assertNotPlaceholder("CAPTURE_ENCRYPTION_KEY", configured);
}

/** Stable MFA material; separate from JWT signing and required at runtime. */
export function mfaEncryptionSecret(env: RuntimeEnvironment = process.env): string {
  const configured = valueOf(env, "MFA_ENCRYPTION_KEY");
  if (!configured) throw new Error("MFA_ENCRYPTION_KEY is required");
  return isProduction(env)
    ? assertSafeSecret("MFA_ENCRYPTION_KEY", configured, 32)
    : assertNotPlaceholder("MFA_ENCRYPTION_KEY", configured);
}

export function mfaEnrollmentAvailable(env: RuntimeEnvironment = process.env): boolean {
  return Boolean(valueOf(env, "MFA_ENCRYPTION_KEY"));
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

export interface ErrorTrackingConfig {
  dsn: string;
  endpoint: string;
  publicKey: string;
  environment: RuntimeMode;
  release: string;
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
  if (isProduction(env) && !enabledValue) {
    throw new Error("PAYNOW_ENABLED is required in production (set true or false explicitly)");
  }
  if (enabledValue && enabledValue !== "true" && enabledValue !== "false") {
    throw new Error("PAYNOW_ENABLED must be true or false");
  }
  if (enabledValue !== "true") return null;
  const integrationId = valueOf(env, "PAYNOW_INTEGRATION_ID");
  const integrationKey = valueOf(env, "PAYNOW_INTEGRATION_KEY");
  const configuredCurrency = valueOf(env, "PAYNOW_CURRENCY");
  if (!integrationId || !integrationKey || !configuredCurrency) {
    throw new Error("PAYNOW_INTEGRATION_ID, PAYNOW_INTEGRATION_KEY and PAYNOW_CURRENCY are required when Paynow is enabled");
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
  if (!configured) throw new Error("PAYNOW_ENCRYPTION_KEY is required");
  return isProduction(env)
    ? assertSafeSecret("PAYNOW_ENCRYPTION_KEY", configured, 32)
    : assertNotPlaceholder("PAYNOW_ENCRYPTION_KEY", configured);
}

/** Parse and validate the explicit browser origins allowed to use credentials. */
export function allowedOrigins(env: RuntimeEnvironment = process.env): Set<string> {
  const raw = valueOf(env, "ALLOWED_ORIGINS");
  if (!raw) {
    if (isProduction(env)) throw new Error("ALLOWED_ORIGINS is required in production");
    return new Set();
  }
  const origins = new Set<string>();
  for (const candidate of raw.split(",").map((entry) => entry.trim()).filter(Boolean)) {
    if (candidate === "*") throw new Error("ALLOWED_ORIGINS must not contain wildcard origins");
    let parsed: URL;
    try { parsed = new URL(candidate); } catch { throw new Error(`ALLOWED_ORIGINS contains an invalid origin: ${candidate}`); }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new Error(`ALLOWED_ORIGINS contains a non-HTTP origin: ${candidate}`);
    }
    const normalised = candidate.replace(/\/$/, "").toLowerCase();
    if (normalised !== parsed.origin.toLowerCase()) {
      throw new Error(`ALLOWED_ORIGINS entries must be origins without paths: ${candidate}`);
    }
    origins.add(parsed.origin.toLowerCase());
  }
  if (isProduction(env) && origins.size === 0) {
    throw new Error("ALLOWED_ORIGINS must contain at least one origin in production");
  }
  return origins;
}

export function serverPort(env: RuntimeEnvironment = process.env): number {
  const configured = valueOf(env, "PORT") ?? "4000";
  const port = Number(configured);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }
  return port;
}

export function applicationVersion(env: RuntimeEnvironment = process.env): string {
  const version = valueOf(env, "APP_VERSION")
    ?? valueOf(env, "VERCEL_GIT_COMMIT_SHA")
    ?? valueOf(env, "npm_package_version")
    ?? "1.0.0";
  if (!/^[A-Za-z0-9][A-Za-z0-9._+-]{0,99}$/.test(version)) {
    throw new Error("APP_VERSION must be a release identifier of at most 100 characters");
  }
  return version;
}

/** Optional Sentry-compatible ingest configuration; absent means no-op. */
export function errorTrackingConfig(
  env: RuntimeEnvironment = process.env,
): ErrorTrackingConfig | null {
  const dsn = valueOf(env, "SENTRY_DSN");
  if (!dsn) return null;
  let parsed: URL;
  try { parsed = new URL(dsn); } catch { throw new Error("SENTRY_DSN must be a valid URL"); }
  if (parsed.protocol !== "https:") throw new Error("SENTRY_DSN must use HTTPS");
  if (!parsed.username) throw new Error("SENTRY_DSN must include a public key");
  if (parsed.password) throw new Error("SENTRY_DSN must not include a secret key");
  const segments = parsed.pathname.split("/").filter(Boolean);
  const projectId = segments.pop();
  if (!projectId) throw new Error("SENTRY_DSN must include a project id");
  const prefix = segments.length ? `/${segments.join("/")}` : "";
  return {
    dsn,
    endpoint: `${parsed.protocol}//${parsed.host}${prefix}/api/${projectId}/envelope/`,
    publicKey: decodeURIComponent(parsed.username),
    environment: runtimeMode(env),
    release: applicationVersion(env),
  };
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

export interface RuntimeConfig {
  mode: RuntimeMode;
  databaseUrl: string;
  jwtSecret: string;
  captureEncryptionSecret: string;
  mfaEncryptionSecret: string;
  paynowEncryptionSecret: string;
  allowedOrigins: Set<string>;
  publicAppUrl: string;
  emailDelivery: EmailDeliveryConfig;
  paynowProvider: PaynowProviderConfig | null;
  errorTracking: ErrorTrackingConfig | null;
  appVersion: string;
  port: number;
}

/**
 * Validate the complete runtime contract in one pass before importing the
 * application graph. Every failure is reported together so an operator can
 * repair configuration without repeated deploy/fail cycles.
 */
export function runtimeConfig(env: RuntimeEnvironment = process.env): RuntimeConfig {
  const errors: string[] = [];
  const read = <T>(loader: () => T): T | undefined => {
    try { return loader(); } catch (error) {
      errors.push(error instanceof Error ? error.message : "Unknown configuration error");
      return undefined;
    }
  };

  const config = {
    mode: read(() => runtimeMode(env)),
    databaseUrl: read(() => databaseUrl(env)),
    jwtSecret: read(() => jwtSecret(env)),
    captureEncryptionSecret: read(() => captureEncryptionSecret(env)),
    mfaEncryptionSecret: read(() => mfaEncryptionSecret(env)),
    paynowEncryptionSecret: read(() => paynowEncryptionSecret(env)),
    allowedOrigins: read(() => allowedOrigins(env)),
    publicAppUrl: read(() => publicAppUrl(env)),
    emailDelivery: read(() => emailDeliveryConfig(env)),
    paynowProvider: read(() => paynowProviderConfig(env)),
    errorTracking: read(() => errorTrackingConfig(env)),
    appVersion: read(() => applicationVersion(env)),
    port: read(() => serverPort(env)),
  };

  if (errors.length) {
    throw new Error(`Invalid runtime configuration:\n${errors.map((error) => `- ${error}`).join("\n")}`);
  }
  return config as RuntimeConfig;
}
