// ============================================================================
// APP BOOTSTRAP — hardened Express app + global error handling.
// ============================================================================
import express from "express";
import { api } from "./routes.js";
import { AppError } from "./lib.js";
import { ZodError } from "zod";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "2mb" }));

  // security headers (helmet-equivalent minimal set)
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    next();
  });

  // permissive CORS for dev; lock to tenant subdomains in production
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", req.headers.origin ?? "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

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
