// ============================================================================
// SECURITY MIDDLEWARE — transport-level hardening for the API.
//
//   securityHeaders   — strict browser-protection headers on every response
//   corsMiddleware    — reflective CORS in development; mandatory explicit
//                       allowlist in production (ALLOWED_ORIGINS).
//   createRateLimiter — fixed-window, in-memory limiter for brute-force and
//                       abuse protection. Per-process: suitable for a single
//                       instance; put a shared limiter (e.g. at the edge/CDN)
//                       in front when scaling horizontally. Disabled under
//                       NODE_ENV=test unless explicitly enabled.
// ============================================================================
import type { NextFunction, Request, Response } from "express";
import { allowedOrigins as configuredAllowedOrigins } from "./config.js";

type RuntimeEnvironment = NodeJS.ProcessEnv;

const isProduction = (env: RuntimeEnvironment) => env.NODE_ENV?.trim() === "production";
const isTest = (env: RuntimeEnvironment) => env.NODE_ENV?.trim() === "test";

export { allowedOrigins } from "./config.js";

/** Strict security headers applied to every response. */
export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  res.setHeader("Content-Security-Policy",
    "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  next();
}

/**
 * CORS policy:
 * - development/test: reflect the caller's origin (unchanged behaviour)
 * - production: boot requires an explicit ALLOWED_ORIGINS list; requests that
 *   present a non-allowlisted Origin are rejected before reaching a route.
 */
export function corsMiddleware(env: RuntimeEnvironment = process.env) {
  const allowlist = configuredAllowedOrigins(env);
  const production = isProduction(env);
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    const originAllowed =
      !!origin && (!production || allowlist.has(origin.replace(/\/$/, "").toLowerCase()));
    if (origin) res.setHeader("Vary", "Origin");
    if (production && origin && !originAllowed) {
      return res.status(403).json({ error: "CORS_ORIGIN_DENIED", message: "Origin is not allowed" });
    }
    if (originAllowed && origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Allow-Headers",
        "Content-Type, Authorization, Idempotency-Key, X-Vaka-Client, X-Vaka-App-Version, X-Vaka-Step-Up");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
      res.setHeader("Access-Control-Max-Age", "600");
    }
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  };
}

export interface RateLimiterOptions {
  /** Window length in milliseconds. */
  windowMs: number;
  /** Maximum requests per key per window. */
  max: number;
  /** Human-readable label used in the 429 message. */
  label?: string;
  /** Force-enable even under NODE_ENV=test (used by the limiter's own tests). */
  enabledInTests?: boolean;
  /** Key extractor; defaults to the client IP. */
  keyOf?: (req: Request) => string;
}

/** Credential surfaces protected by the baseline in-process limiter. */
export const AUTH_RATE_LIMIT_POLICIES: readonly {
  path: string;
  options: RateLimiterOptions;
}[] = [
  { path: "/api/v1/auth/login", options: { windowMs: 5 * 60_000, max: 20, label: "login attempts" } },
  { path: "/api/v1/auth/refresh", options: { windowMs: 5 * 60_000, max: 30, label: "session renewals" } },
  { path: "/api/v1/auth/step-up", options: { windowMs: 5 * 60_000, max: 10, label: "reauthentication attempts" } },
  { path: "/api/v1/auth/signup", options: { windowMs: 10 * 60_000, max: 10, label: "signup attempts" } },
  { path: "/api/v1/auth/password-reset/request", options: { windowMs: 15 * 60_000, max: 5, label: "password reset requests" } },
  { path: "/api/v1/auth/password-reset/complete", options: { windowMs: 15 * 60_000, max: 10, label: "password reset attempts" } },
  { path: "/api/v1/auth/mfa", options: { windowMs: 5 * 60_000, max: 20, label: "two-factor attempts" } },
] as const;

/** Fixed client response for unexpected failures; input details never escape. */
export function sanitisedInternalError(_error: unknown) {
  return { error: "INTERNAL" as const, message: "An unexpected error occurred" };
}

interface WindowState { count: number; resetAt: number; }

/**
 * Fixed-window in-memory rate limiter. Fails closed on limit, fails open on
 * missing keys (a request with no derivable key is counted under "unknown"
 * rather than bypassing the limiter).
 */
export function createRateLimiter(options: RateLimiterOptions, env: RuntimeEnvironment = process.env) {
  const windows = new Map<string, WindowState>();
  const disabled = isTest(env) && !options.enabledInTests;
  const keyOf = options.keyOf ?? ((req: Request) => req.ip || "unknown");

  const sweep = (now: number) => {
    if (windows.size < 10_000) return;
    for (const [key, state] of windows) if (state.resetAt <= now) windows.delete(key);
  };

  return (req: Request, res: Response, next: NextFunction) => {
    if (disabled) return next();
    const now = Date.now();
    sweep(now);
    const key = keyOf(req);
    const state = windows.get(key);
    if (!state || state.resetAt <= now) {
      windows.set(key, { count: 1, resetAt: now + options.windowMs });
      return next();
    }
    state.count += 1;
    if (state.count <= options.max) return next();
    const retryAfterSeconds = Math.max(1, Math.ceil((state.resetAt - now) / 1000));
    res.setHeader("Retry-After", String(retryAfterSeconds));
    res.status(429).json({
      error: "RATE_LIMITED",
      message: `Too many ${options.label ?? "requests"}. Try again in ${retryAfterSeconds}s.`,
    });
  };
}
