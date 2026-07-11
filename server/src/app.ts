// ============================================================================
// APP BOOTSTRAP — hardened Express app + global error handling.
// ============================================================================
import express from "express";
import { api } from "./routes.js";
import { AppError } from "./lib.js";
import { ZodError } from "zod";
import { corsMiddleware, createRateLimiter, securityHeaders } from "./security.js";

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
  app.use("/api/v1/auth/login", createRateLimiter({ windowMs: 5 * 60_000, max: 20, label: "login attempts" }));
  app.use("/api/v1/auth/signup", createRateLimiter({ windowMs: 10 * 60_000, max: 10, label: "signup attempts" }));
  app.use("/api/v1/public", createRateLimiter({ windowMs: 60_000, max: 60, label: "requests" }));

  app.get("/health", (_req, res) => res.json({ ok: true, service: "vaka-os" }));
  app.use("/api/v1", api);

  // global error handler — never leak internals
  app.use((err: any, _req: any, res: any, _next: any) => {
    if (err instanceof ZodError) {
      return res.status(400).json({ error: "VALIDATION", details: err.issues.map((i) => `${i.path.join(".")}: ${i.message}`) });
    }
    if (err instanceof AppError) {
      return res.status(err.status).json({ error: err.code, message: err.message });
    }
    console.error("[unhandled]", err);
    res.status(500).json({ error: "INTERNAL", message: "An unexpected error occurred" });
  });
  return app;
}
