import { describe, expect, it } from "vitest";
import {
  databaseUrl,
  jwtSecret,
  platformAdminPassword,
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
});
