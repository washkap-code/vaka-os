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
import { applicationVersion } from "./config.js";
import { createReadinessChecker, EXPECTED_MIGRATION, type ReadinessChecker } from "./health.js";
import { noopErrorTracker, type ErrorTracker } from "./error-tracking.js";
import {
  applicationLogger, requestLogContext, requestObservability, type AppLogger,
} from "./observability.js";

export interface AppOptions {
  logger?: AppLogger;
  errorTracker?: ErrorTracker;
  readinessChecker?: ReadinessChecker;
  version?: string;
  uptimeSeconds?: () => number;
}

export function createApp(options: AppOptions = {}) {
  const logger = options.logger ?? applicationLogger;
  const errorTracker = options.errorTracker ?? noopErrorTracker;
  const readiness = options.readinessChecker ?? createReadinessChecker();
  const version = options.version ?? applicationVersion();
  const uptimeSeconds = options.uptimeSeconds ?? process.uptime;
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1); // rate limiting + session IP hashing behind a proxy/CDN
  app.use(requestObservability(logger));
  app.use(express.json({ limit: "2mb" }));

  // strict security headers on every response
  app.use(securityHeaders);

  // CORS: same-origin by default, explicit ALLOWED_ORIGINS for credentials.
  app.use(corsMiddleware());

  const healthz = (_req: Request, res: Response) => res.json({
    status: "ok",
    service: "vaka-os",
    version,
    uptimeSeconds: Math.floor(uptimeSeconds()),
  });
  const readyz = async (_req: Request, res: Response) => {
    try {
      const report = await readiness.check();
      return res.status(report.status === "ready" ? 200 : 503).json(report);
    } catch {
      return res.status(503).json({
        status: "not_ready",
        expectedMigration: EXPECTED_MIGRATION,
        checks: { service: { status: "fail", critical: true, detail: "readiness check failed" } },
      });
    }
  };

  app.get("/healthz", healthz);
  app.get("/readyz", readyz);
  // Vercel preserves the public request path when rewriting to the serverless
  // function, so API-prefixed probes need explicit pre-auth registrations.
  app.get("/api/v1/healthz", healthz);
  app.get("/api/v1/readyz", readyz);

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
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    const requestId = req.requestId ?? null;
    if (err instanceof ZodError) {
      return res.status(400).json({
        error: "VALIDATION",
        details: err.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
        requestId,
      });
    }
    if (err instanceof AppError) {
      return res.status(err.status).json({ error: err.code, message: err.message, requestId });
    }
    const context = requestLogContext(req);
    logger.error("http.request.unhandled", {
      event: "http.request.unhandled",
      ...context,
      errorType: err instanceof Error ? err.name : "UnknownError",
    });
    void errorTracker.capture(err, context).catch(() => {
      logger.warn("error_tracking.capture_failed", {
        event: "error_tracking.capture_failed", ...context,
      });
    });
    res.status(500).json({ ...sanitisedInternalError(err), requestId });
  });
  return app;
}
