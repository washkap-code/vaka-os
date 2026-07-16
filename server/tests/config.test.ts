import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  databaseUrl,
  emailDeliveryConfig,
  jwtSecret,
  mfaEnrollmentAvailable,
  mfaEncryptionSecret,
  paynowEncryptionSecret,
  paynowProviderConfig,
  platformAdminPassword,
  publicAppUrl,
} from "../src/config.js";

describe("runtime configuration", () => {
  it("keeps explicit local-development defaults outside production", () => {
    expect(databaseUrl({ NODE_ENV: "development" })).toContain("localhost");
    expect(jwtSecret({ NODE_ENV: "test" })).toContain("development-only");
  });

  it("requires the database URL and JWT secret in production", () => {
    expect(() => databaseUrl({ NODE_ENV: "production" })).toThrow(
      "DATABASE_URL is required in production",
    );
    expect(() => jwtSecret({ NODE_ENV: "production" })).toThrow(
      "JWT_SECRET is required in production",
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

  it("keeps MFA encryption stable and independently configurable", () => {
    const jwt = "j".repeat(64);
    const mfa = "m".repeat(32);
    expect(mfaEncryptionSecret({ NODE_ENV: "production", JWT_SECRET: jwt, MFA_ENCRYPTION_KEY: mfa }))
      .toBe(mfa);
    expect(mfaEncryptionSecret({ NODE_ENV: "production", JWT_SECRET: jwt })).toBe(jwt);
    expect(() => mfaEncryptionSecret({
      NODE_ENV: "production", JWT_SECRET: jwt, MFA_ENCRYPTION_KEY: "too-short",
    })).toThrow("at least 32 bytes");
    expect(mfaEnrollmentAvailable({ NODE_ENV: "production", JWT_SECRET: jwt })).toBe(false);
    expect(mfaEnrollmentAvailable({ NODE_ENV: "production", JWT_SECRET: jwt, MFA_ENCRYPTION_KEY: mfa })).toBe(true);
    expect(mfaEnrollmentAvailable({ NODE_ENV: "test" })).toBe(true);
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

  it("fails the production process before listening when SMTP is missing", () => {
    const result = spawnSync(process.execPath, ["--import", "tsx", "src/index.ts"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://vaka:test@127.0.0.1:5432/vaka_test",
        JWT_SECRET: "j".repeat(64),
        PUBLIC_APP_URL: "https://app.example.com",
        SMTP_ENABLED: "",
        SMTP_HOST: "",
        SMTP_PORT: "",
        SMTP_AUTH_USER: "",
        SMTP_AUTH_PASSWORD: "",
        SMTP_FROM_ADDRESS: "",
        SMTP_FROM_NAME: "",
        SMTP_REPLY_TO: "",
        SMTP_TLS: "",
      },
    });
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain("SMTP configuration is incomplete");
    expect(`${result.stdout}\n${result.stderr}`).not.toContain("VAKA OS API on");
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
    expect(() => paynowEncryptionSecret({
      NODE_ENV: "production", JWT_SECRET: "j".repeat(64), PAYNOW_ENABLED: "true",
      PAYNOW_INTEGRATION_ID: "1234", PAYNOW_INTEGRATION_KEY: "k".repeat(32),
    })).toThrow("PAYNOW_ENCRYPTION_KEY is required");
  });
});
