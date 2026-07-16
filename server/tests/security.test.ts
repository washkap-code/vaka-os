import { describe, expect, it } from "vitest";
import type { Request, Response } from "express";
import {
  allowedOrigins, AUTH_RATE_LIMIT_POLICIES, corsMiddleware, createRateLimiter,
  sanitisedInternalError, securityHeaders,
} from "../src/security.js";

function fakeRes() {
  const headers: Record<string, string> = {};
  let statusCode = 0;
  let jsonBody: unknown;
  let sent: number | null = null;
  const res = {
    setHeader: (name: string, value: string) => { headers[name] = value; },
    status: (code: number) => { statusCode = code; return res; },
    json: (body: unknown) => { jsonBody = body; return res; },
    sendStatus: (code: number) => { sent = code; return res; },
  } as unknown as Response;
  return { res, headers, status: () => statusCode, body: () => jsonBody, sentStatus: () => sent };
}

const fakeReq = (overrides: Partial<{ method: string; ip: string; origin: string }> = {}) =>
  ({
    method: overrides.method ?? "GET",
    ip: overrides.ip ?? "203.0.113.5",
    headers: overrides.origin ? { origin: overrides.origin } : {},
  }) as unknown as Request;

describe("allowedOrigins", () => {
  it("parses, trims, lowercases and de-slashes the allowlist", () => {
    const set = allowedOrigins({ ALLOWED_ORIGINS: " https://App.vakaos.com/ , https://vakaos.com " } as NodeJS.ProcessEnv);
    expect(set).toEqual(new Set(["https://app.vakaos.com", "https://vakaos.com"]));
  });

  it("is empty when unset", () => {
    expect(allowedOrigins({} as NodeJS.ProcessEnv).size).toBe(0);
  });

  it("rejects missing, wildcard, malformed and path-bearing production origins", () => {
    expect(() => allowedOrigins({ NODE_ENV: "production" })).toThrow("required in production");
    expect(() => allowedOrigins({ NODE_ENV: "production", ALLOWED_ORIGINS: "*" }))
      .toThrow("must not contain wildcard");
    expect(() => allowedOrigins({ NODE_ENV: "production", ALLOWED_ORIGINS: "not-an-origin" }))
      .toThrow("invalid origin");
    expect(() => allowedOrigins({ NODE_ENV: "production", ALLOWED_ORIGINS: "https://app.vakaos.com/path" }))
      .toThrow("without paths");
  });
});

describe("securityHeaders", () => {
  it("applies the strict header set", () => {
    const { res, headers } = fakeRes();
    let called = false;
    securityHeaders(fakeReq(), res, () => { called = true; });
    expect(called).toBe(true);
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["Strict-Transport-Security"]).toContain("max-age=31536000");
    expect(headers["Content-Security-Policy"]).toContain("default-src 'none'");
    expect(headers["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(headers["Cross-Origin-Opener-Policy"]).toBe("same-origin");
    expect(headers["Cross-Origin-Resource-Policy"]).toBe("same-origin");
    expect(headers["Permissions-Policy"]).toContain("camera=()");
  });
});

describe("corsMiddleware", () => {
  it("reflects the origin outside production", () => {
    const mw = corsMiddleware({ NODE_ENV: "development" } as NodeJS.ProcessEnv);
    const { res, headers } = fakeRes();
    mw(fakeReq({ origin: "http://localhost:5173" }), res, () => {});
    expect(headers["Access-Control-Allow-Origin"]).toBe("http://localhost:5173");
  });

  it("only allows allowlisted origins in production", () => {
    const env = { NODE_ENV: "production", ALLOWED_ORIGINS: "https://app.vakaos.com" } as NodeJS.ProcessEnv;
    const mw = corsMiddleware(env);

    const allowed = fakeRes();
    mw(fakeReq({ origin: "https://app.vakaos.com" }), allowed.res, () => {});
    expect(allowed.headers["Access-Control-Allow-Origin"]).toBe("https://app.vakaos.com");
    expect(allowed.headers["Access-Control-Allow-Credentials"]).toBe("true");

    const blocked = fakeRes();
    mw(fakeReq({ origin: "https://evil.example" }), blocked.res, () => {});
    expect(blocked.headers["Access-Control-Allow-Origin"]).toBeUndefined();
    expect(blocked.headers["Access-Control-Allow-Credentials"]).toBeUndefined();
    expect(blocked.status()).toBe(403);
    expect(blocked.body()).toMatchObject({ error: "CORS_ORIGIN_DENIED" });
  });

  it("refuses to initialise in production without an explicit allowlist", () => {
    expect(() => corsMiddleware({ NODE_ENV: "production" } as NodeJS.ProcessEnv))
      .toThrow("ALLOWED_ORIGINS is required in production");
  });

  it("short-circuits allowlisted production preflight requests with credentials", () => {
    const mw = corsMiddleware({
      NODE_ENV: "production", ALLOWED_ORIGINS: "https://app.vakaos.com",
    } as NodeJS.ProcessEnv);
    const probe = fakeRes();
    let nextCalled = false;
    mw(fakeReq({ method: "OPTIONS", origin: "https://app.vakaos.com" }), probe.res, () => { nextCalled = true; });
    expect(probe.sentStatus()).toBe(204);
    expect(probe.headers["Access-Control-Allow-Credentials"]).toBe("true");
    expect(nextCalled).toBe(false);
  });
});

describe("createRateLimiter", () => {
  const env = { NODE_ENV: "test" } as NodeJS.ProcessEnv;

  it("limits per key within the window and reports Retry-After", () => {
    const mw = createRateLimiter({ windowMs: 60_000, max: 2, label: "login attempts", enabledInTests: true }, env);
    const pass = () => {
      const probe = fakeRes();
      let ok = false;
      mw(fakeReq({ ip: "198.51.100.1" }), probe.res, () => { ok = true; });
      return { ok, probe };
    };
    expect(pass().ok).toBe(true);
    expect(pass().ok).toBe(true);
    const third = pass();
    expect(third.ok).toBe(false);
    expect(third.probe.status()).toBe(429);
    expect(third.probe.headers["Retry-After"]).toBeDefined();
    expect(third.probe.body()).toMatchObject({ error: "RATE_LIMITED" });
  });

  it("tracks keys independently (tenant/IP isolation)", () => {
    const mw = createRateLimiter({ windowMs: 60_000, max: 1, enabledInTests: true }, env);
    const attempt = (ip: string) => {
      let ok = false;
      mw(fakeReq({ ip }), fakeRes().res, () => { ok = true; });
      return ok;
    };
    expect(attempt("198.51.100.1")).toBe(true);
    expect(attempt("198.51.100.1")).toBe(false);
    expect(attempt("198.51.100.2")).toBe(true);
  });

  it("is disabled under NODE_ENV=test unless explicitly enabled", () => {
    const mw = createRateLimiter({ windowMs: 60_000, max: 1 }, env);
    for (let i = 0; i < 5; i += 1) {
      let ok = false;
      mw(fakeReq({ ip: "198.51.100.9" }), fakeRes().res, () => { ok = true; });
      expect(ok).toBe(true);
    }
  });

  it("covers every authentication and password-reset surface", () => {
    expect(AUTH_RATE_LIMIT_POLICIES.map(({ path }) => path)).toEqual([
      "/api/v1/auth/login",
      "/api/v1/auth/refresh",
      "/api/v1/auth/step-up",
      "/api/v1/auth/signup",
      "/api/v1/auth/password-reset/request",
      "/api/v1/auth/password-reset/complete",
      "/api/v1/auth/mfa",
    ]);
  });
});

describe("production error sanitisation", () => {
  it("never exposes internal messages, paths or stack traces", () => {
    const internal = new Error("database failure at /srv/vaka/private.ts:42");
    internal.stack = "SECRET STACK /srv/vaka/private.ts:42";
    const response = sanitisedInternalError(internal);
    expect(response).toEqual({ error: "INTERNAL", message: "An unexpected error occurred" });
    expect(JSON.stringify(response)).not.toContain("database failure");
    expect(JSON.stringify(response)).not.toContain("/srv/vaka");
    expect(JSON.stringify(response)).not.toContain("STACK");
  });
});
