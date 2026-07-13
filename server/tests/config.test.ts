import { describe, expect, it } from "vitest";
import {
  databaseUrl,
  emailProviderConfig,
  jwtSecret,
  mfaEnrollmentAvailable,
  mfaEncryptionSecret,
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

  it("keeps email disabled in local development and fails closed on incomplete production config", () => {
    expect(emailProviderConfig({ NODE_ENV: "development" })).toBeNull();
    expect(emailProviderConfig({ NODE_ENV: "production" })).toBeNull();
    expect(() => emailProviderConfig({
      NODE_ENV: "production",
      EMAIL_PROVIDER_URL: "https://mail.example/send",
    })).toThrow("must be configured together");
    expect(() => emailProviderConfig({
      NODE_ENV: "production",
      EMAIL_PROVIDER_URL: "http://mail.example/send",
      EMAIL_PROVIDER_TOKEN: "a".repeat(32),
      EMAIL_FROM: "notifications@example.com",
    })).toThrow("must use HTTPS");
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
});
