// ============================================================================
// APP BOOTSTRAP — hardened Express app + global error handling.
// ============================================================================
import express from "express";
import type { NextFunction, Request, Response } from "express";
import { api } from "./routes.js";
import { AppError } from "./lib.js";
import { ZodError } from "zod";
import {
  AUTH_RATE_LIMIT_POLICIES, corsMiddleware, createRateLimiter,
  sanitisedInternalError, securityHeaders,
} from "./security.js";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1); // rate limiting + session IP hashing behind a proxy/CDN
  app.use(express.json({ limit: "2mb" }));

  // strict security headers on every response
  app.use(securityHeaders);

  // CORS: reflective in development, ALLOWED_ORIGINS allowlist in production
  app.use(corsMiddleware());

  // brute-force protection on credential endpoints; abuse protection on
  // public document links. (Per-process windows; add an edge limiter when
  // scaling horizontally — see docs/02-security-compliance.md.)
  for (const policy of AUTH_RATE_LIMIT_POLICIES) {
    app.use(policy.path, createRateLimiter(policy.options));
  }
  app.use("/api/v1/public", createRateLimiter({ windowMs: 60_000, max: 60, label: "requests" }));

  app.get("/health", (_req, res) => res.json({ ok: true, service: "vaka-os" }));
  app.use("/api/v1", api);

  // global error handler — never leak internals
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError) {
      return res.status(400).json({ error: "VALIDATION", details: err.issues.map((i) => `${i.path.join(".")}: ${i.message}`) });
    }
    if (err instanceof AppError) {
      return res.status(err.status).json({ error: err.code, message: err.message });
    }
    console.error("[unhandled]", err);
    res.status(500).json(sanitisedInternalError(err));
  });
  return app;
}
