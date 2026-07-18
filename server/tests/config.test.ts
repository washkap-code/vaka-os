import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  captureEncryptionSecret,
  databaseUrl,
  emailDeliveryConfig,
  errorTrackingConfig,
  jwtSecret,
  mfaEnrollmentAvailable,
  mfaEncryptionSecret,
  mailEncryptionSecret,
  mailSyncIntervalMs,
  paynowEncryptionSecret,
  paynowProviderConfig,
  platformAdminPassword,
  publicAppUrl,
  runtimeConfig,
  runtimeMode,
} from "../src/config.js";

const validProductionEnv = (overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => ({
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://vaka:local-db-password@db.example/vaka",
  JWT_SECRET: "j".repeat(64),
  CAPTURE_ENCRYPTION_KEY: "c".repeat(32),
  MFA_ENCRYPTION_KEY: "m".repeat(32),
  PAYNOW_ENCRYPTION_KEY: "e".repeat(32),
  MAIL_ENCRYPTION_KEY: "l".repeat(32),
  ALLOWED_ORIGINS: "https://app.example.com",
  PUBLIC_APP_URL: "https://app.example.com",
  PAYNOW_ENABLED: "false",
  SMTP_ENABLED: "true",
  SMTP_HOST: "smtp.example.com",
  SMTP_PORT: "587",
  SMTP_AUTH_USER: "vaka-smtp",
  SMTP_AUTH_PASSWORD: "p".repeat(32),
  SMTP_FROM_ADDRESS: "notifications@example.com",
  SMTP_FROM_NAME: "VAKA",
  SMTP_REPLY_TO: "support@example.com",
  SMTP_TLS: "starttls",
  PORT: "4000",
  ...overrides,
});

const serverDirectory = fileURLToPath(new URL("../", import.meta.url));

describe("runtime configuration", () => {
  it("requires an explicit recognised runtime mode", () => {
    expect(() => runtimeMode({})).toThrow("NODE_ENV is required");
    expect(() => runtimeMode({ NODE_ENV: "prod" })).toThrow("must be development, test, staging or production");
    expect(runtimeMode({ NODE_ENV: "production" })).toBe("production");
  });

  it("has no embedded database or secret fallback in any environment", () => {
    expect(() => databaseUrl({ NODE_ENV: "development" })).toThrow("DATABASE_URL is required");
    expect(() => jwtSecret({ NODE_ENV: "test" })).toThrow("JWT_SECRET is required");
    expect(() => databaseUrl({
      NODE_ENV: "development",
      DATABASE_URL: "postgresql://vaka:CHANGE_ME@localhost:5432/vaka",
    })).toThrow("password contains a known placeholder value");
  });

  it("requires the database URL and JWT secret in production", () => {
    expect(() => databaseUrl({ NODE_ENV: "production" })).toThrow(
      "DATABASE_URL is required",
    );
    expect(() => jwtSecret({ NODE_ENV: "production" })).toThrow(
      "JWT_SECRET is required",
    );
  });

  it("rejects weak or placeholder production JWT secrets", () => {
    expect(() =>
      jwtSecret({ NODE_ENV: "production", JWT_SECRET: "dev-secret" }),
    ).toThrow("known placeholder");
    expect(() =>
      jwtSecret({ NODE_ENV: "production", JWT_SECRET: "short-secret" }),
    ).toThrow("at least 64 bytes");
  });

  it("accepts an explicitly configured production environment", () => {
    const secret = "a".repeat(64);
    expect(
      databaseUrl({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://vaka:secret@db.example/vaka",
      }),
    ).toBe("postgresql://vaka:secret@db.example/vaka");
    expect(jwtSecret({ NODE_ENV: "production", JWT_SECRET: secret })).toBe(
      secret,
    );
  });

  it("requires dedicated capture and MFA encryption without JWT fallback", () => {
    const jwt = "j".repeat(64);
    const mfa = "m".repeat(32);
    expect(() => captureEncryptionSecret({ NODE_ENV: "production", JWT_SECRET: jwt }))
      .toThrow("CAPTURE_ENCRYPTION_KEY is required");
    expect(() => mfaEncryptionSecret({ NODE_ENV: "production", JWT_SECRET: jwt }))
      .toThrow("MFA_ENCRYPTION_KEY is required");
    expect(mfaEncryptionSecret({ NODE_ENV: "production", JWT_SECRET: jwt, MFA_ENCRYPTION_KEY: mfa }))
      .toBe(mfa);
    expect(() => mfaEncryptionSecret({
      NODE_ENV: "production", JWT_SECRET: jwt, MFA_ENCRYPTION_KEY: "too-short",
    })).toThrow("at least 32 bytes");
    expect(mfaEnrollmentAvailable({ NODE_ENV: "production", JWT_SECRET: jwt })).toBe(false);
    expect(mfaEnrollmentAvailable({ NODE_ENV: "production", JWT_SECRET: jwt, MFA_ENCRYPTION_KEY: mfa })).toBe(true);
    expect(mfaEnrollmentAvailable({ NODE_ENV: "test" })).toBe(false);
  });

  it("requires a non-placeholder administrator password for seeding", () => {
    expect(() => platformAdminPassword({ NODE_ENV: "development" })).toThrow(
      "required when seeding",
    );
    expect(() =>
      platformAdminPassword({
        PLATFORM_ADMIN_PASSWORD: "SET_STRONG_PASSWORD_BEFORE_SEED",
      }),
    ).toThrow("known placeholder");
    expect(
      platformAdminPassword({
        PLATFORM_ADMIN_PASSWORD: "local-seed-password-2026",
      }),
    ).toBe("local-seed-password-2026");
  });

  it("selects memory for tests and console for development/staging by default", () => {
    expect(emailDeliveryConfig({ NODE_ENV: "test" })).toEqual({ mode: "memory" });
    expect(emailDeliveryConfig({ NODE_ENV: "development" })).toMatchObject({
      mode: "console", fromName: "VAKA",
    });
    expect(emailDeliveryConfig({ NODE_ENV: "staging" })).toMatchObject({ mode: "console" });
  });

  it("requires complete real SMTP configuration in production", () => {
    expect(() => emailDeliveryConfig({ NODE_ENV: "production" }))
      .toThrow("SMTP configuration is incomplete");
    expect(() => emailDeliveryConfig({ NODE_ENV: "production", SMTP_ENABLED: "false" }))
      .toThrow("cannot be false in production");
    expect(() => emailDeliveryConfig({ NODE_ENV: "production", SMTP_ENABLED: "yes" }))
      .toThrow("must be true or false");
  });

  it("fails the production process before importing the app when required configuration is missing", () => {
    const result = spawnSync(process.execPath, ["--import", "tsx", "src/index.ts"], {
      cwd: serverDirectory,
      encoding: "utf8",
      env: { NODE_ENV: "production" },
    });
    expect(result.status).not.toBe(0);
    const output = `${result.stdout}\n${result.stderr}`;
    expect(output).toContain("Invalid runtime configuration");
    expect(output).toContain("DATABASE_URL");
    expect(output).toContain("JWT_SECRET");
    expect(output).toContain("ALLOWED_ORIGINS");
    expect(output).toContain("CAPTURE_ENCRYPTION_KEY");
    expect(output).toContain("MFA_ENCRYPTION_KEY");
    expect(output).toContain("PAYNOW_ENCRYPTION_KEY");
    expect(output).toContain("MAIL_ENCRYPTION_KEY");
    expect(output).toContain("SMTP configuration is incomplete");
    expect(output).not.toContain("VAKA OS API on");
  });

  it("fails production boot validation on wildcard CORS", () => {
    expect(() => runtimeConfig(validProductionEnv({ ALLOWED_ORIGINS: "*" })))
      .toThrow("ALLOWED_ORIGINS must not contain wildcard origins");
  });

  it("validates the complete production environment in one module", () => {
    expect(runtimeConfig(validProductionEnv())).toMatchObject({
      databaseUrl: "postgresql://vaka:local-db-password@db.example/vaka",
      publicAppUrl: "https://app.example.com",
      port: 4000,
      emailDelivery: { mode: "smtp" },
      paynowProvider: null,
      errorTracking: null,
      appVersion: "1.0.0",
      mailSyncIntervalMs: 300000,
    });
  });

  it("keeps error tracking optional and validates Sentry-compatible DSNs", () => {
    expect(errorTrackingConfig({ NODE_ENV: "production" })).toBeNull();
    expect(() => errorTrackingConfig({
      NODE_ENV: "production", SENTRY_DSN: "http://public@sentry.example/42",
    })).toThrow("must use HTTPS");
    expect(errorTrackingConfig({
      NODE_ENV: "production",
      SENTRY_DSN: "https://public-key@sentry.example/42",
      APP_VERSION: "release-2026.07.16",
    })).toMatchObject({
      endpoint: "https://sentry.example/api/42/envelope/",
      publicKey: "public-key",
      environment: "production",
      release: "release-2026.07.16",
    });
  });

  it("accepts provider-neutral SMTP and enforces production TLS", () => {
    const complete = {
      NODE_ENV: "production",
      SMTP_HOST: "smtp.example.com",
      SMTP_PORT: "587",
      SMTP_AUTH_USER: "vaka-smtp",
      SMTP_AUTH_PASSWORD: "p".repeat(32),
      SMTP_FROM_ADDRESS: "notifications@example.com",
      SMTP_FROM_NAME: "VAKA",
      SMTP_REPLY_TO: "support@example.com",
      SMTP_TLS: "starttls",
    };
    expect(emailDeliveryConfig(complete)).toMatchObject({
      mode: "smtp", host: "smtp.example.com", port: 587, tls: "starttls",
    });
    expect(() => emailDeliveryConfig({ ...complete, SMTP_TLS: "none" }))
      .toThrow("cannot be none in production");
    expect(emailDeliveryConfig({ ...complete, NODE_ENV: "staging", SMTP_ENABLED: "true", SMTP_TLS: "none" }))
      .toMatchObject({ mode: "smtp", tls: "none" });
  });

  it("requires an HTTPS public origin for production document links", () => {
    expect(publicAppUrl({ NODE_ENV: "test" })).toBe("http://localhost:4000");
    expect(() => publicAppUrl({ NODE_ENV: "production" }))
      .toThrow("required for production public links");
    expect(() => publicAppUrl({ NODE_ENV: "production", PUBLIC_APP_URL: "http://app.example.com" }))
      .toThrow("must use HTTPS");
    expect(publicAppUrl({ NODE_ENV: "production", PUBLIC_APP_URL: "https://app.example.com/" }))
      .toBe("https://app.example.com");
    expect(publicAppUrl({ NODE_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: "vakaos.com" }))
      .toBe("https://vakaos.com");
    expect(publicAppUrl({
      NODE_ENV: "production",
      PUBLIC_APP_URL: "https://configured.example.com",
      VERCEL_PROJECT_PRODUCTION_URL: "vakaos.com",
    })).toBe("https://configured.example.com");
  });

  it("keeps Paynow disabled by default and requires complete production merchant controls", () => {
    expect(paynowProviderConfig({ NODE_ENV: "test" })).toBeNull();
    expect(paynowProviderConfig({ NODE_ENV: "test", PAYNOW_ENABLED: "false" })).toBeNull();
    expect(() => paynowProviderConfig({ NODE_ENV: "test", PAYNOW_ENABLED: "yes" }))
      .toThrow("true or false");
    expect(() => paynowProviderConfig({ NODE_ENV: "test", PAYNOW_ENABLED: "true" }))
      .toThrow("required when Paynow is enabled");
    expect(paynowProviderConfig({
      NODE_ENV: "test", PAYNOW_ENABLED: "true", PAYNOW_INTEGRATION_ID: "1234",
      PAYNOW_INTEGRATION_KEY: "test-integration-key", PAYNOW_CURRENCY: "USD",
    })).toMatchObject({ integrationId: "1234", currency: "USD" });
    expect(() => paynowEncryptionSecret({ NODE_ENV: "test", JWT_SECRET: "j".repeat(64) }))
      .toThrow("PAYNOW_ENCRYPTION_KEY is required");
  });

  it("requires dedicated mail encryption and validates the sync cadence", () => {
    expect(() => mailEncryptionSecret({ NODE_ENV: "test" }))
      .toThrow("MAIL_ENCRYPTION_KEY is required");
    expect(mailEncryptionSecret({ NODE_ENV: "production", MAIL_ENCRYPTION_KEY: "l".repeat(32) }))
      .toBe("l".repeat(32));
    expect(mailSyncIntervalMs({ NODE_ENV: "test" })).toBe(300000);
    expect(() => mailSyncIntervalMs({ NODE_ENV: "test", MAIL_SYNC_INTERVAL_MS: "29999" }))
      .toThrow("between 30000 and 86400000");
  });
});
