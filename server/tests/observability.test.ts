import { describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { createApp } from "../src/app.js";
import { createErrorTracker, createFatalHandler, noopErrorTracker } from "../src/error-tracking.js";
import { createReadinessChecker, EXPECTED_MIGRATION, type ReadinessReport } from "../src/health.js";
import { createLogger, requestObservability } from "../src/observability.js";

const readyReport = (ready: boolean): ReadinessReport => ({
  status: ready ? "ready" : "not_ready",
  expectedMigration: EXPECTED_MIGRATION,
  checks: {
    database: {
      status: ready ? "pass" : "fail", critical: true,
      detail: ready ? "connected" : "check failed",
    },
    migrations: {
      status: ready ? "pass" : "fail", critical: true,
      detail: ready ? EXPECTED_MIGRATION : "schema version mismatch",
    },
    smtp: { status: "not_required", critical: false, detail: "memory transport (test)" },
  },
});

describe("LP-005 health endpoints", () => {
  it("reports liveness without checking dependencies", async () => {
    const readiness = { check: vi.fn().mockRejectedValue(new Error("must not run")) };
    const app = createApp({
      readinessChecker: readiness,
      version: "test-release",
      uptimeSeconds: () => 42.9,
    });
    const response = await request(app).get("/healthz").expect(200);
    expect(response.body).toEqual({
      status: "ok", service: "vaka-os", version: "test-release", uptimeSeconds: 42,
    });
    expect(readiness.check).not.toHaveBeenCalled();
  });

  it("returns readiness detail with 200 or 503 and no internal error text", async () => {
    const healthy = createApp({ readinessChecker: { check: async () => readyReport(true) } });
    const ready = await request(healthy).get("/readyz").expect(200);
    expect(ready.body.status).toBe("ready");
    expect(ready.body.checks.database.detail).toBe("connected");

    const unhealthy = createApp({ readinessChecker: { check: async () => readyReport(false) } });
    const notReady = await request(unhealthy).get("/readyz")
      .set("X-Request-Id", "readiness-check-001").expect(503);
    expect(notReady.body.status).toBe("not_ready");
    expect(notReady.body.requestId).toBe("readiness-check-001");
    expect(JSON.stringify(notReady.body)).not.toContain("postgresql://");
    expect(JSON.stringify(notReady.body)).not.toContain("stack");
  });

  it("fails readiness when the expected migration marker or production SMTP config is missing", async () => {
    const query = vi.fn(async (text: string) => ({
      rows: text.includes("SELECT 1") ? [{ ok: 1 }] : [{ current: false }],
    }));
    const checker = createReadinessChecker({
      query,
      environment: "production",
      emailConfig: () => { throw new Error("missing SMTP secret"); },
    });
    const report = await checker.check();
    expect(report).toMatchObject({
      status: "not_ready",
      checks: {
        database: { status: "pass" },
        migrations: { status: "fail" },
        smtp: { status: "fail", critical: true },
      },
    });
    expect(JSON.stringify(report)).not.toContain("SMTP secret");
  });
});

describe("LP-005 structured logging", () => {
  it("adds active request context to logs emitted inside the request", async () => {
    const lines: string[] = [];
    const logger = createLogger({
      environment: "production",
      sink: (line) => { lines.push(line); },
    });
    const app = express();
    app.use(requestObservability(logger));
    app.get("/context-probe", (_req, res) => {
      logger.info("context.probe", { event: "context.probe" });
      res.json({ ok: true });
    });
    await request(app).get("/context-probe")
      .set("X-Request-Id", "context-request-001").expect(200);
    const record = lines.map((line) => JSON.parse(line) as Record<string, unknown>)
      .find((line) => line.event === "context.probe");
    expect(record).toMatchObject({
      requestId: "context-request-001",
      tenantId: null,
      userId: null,
      route: "/context-probe",
    });
  });

  it("propagates a safe request id to the response and completion log", async () => {
    const lines: string[] = [];
    const logger = createLogger({
      environment: "production",
      sink: (line) => { lines.push(line); },
      now: () => new Date("2026-07-16T00:00:00.000Z"),
    });
    const app = createApp({
      logger,
      readinessChecker: { check: async () => readyReport(true) },
    });
    const response = await request(app).get("/healthz")
      .set("X-Request-Id", "pilot-check-001").expect(200);
    expect(response.headers["x-request-id"]).toBe("pilot-check-001");
    const record = lines.map((line) => JSON.parse(line) as Record<string, unknown>)
      .find((line) => line.event === "http.request.completed");
    expect(record).toMatchObject({
      timestamp: "2026-07-16T00:00:00.000Z",
      level: "info",
      requestId: "pilot-check-001",
      tenantId: null,
      userId: null,
      route: "/healthz",
      status: 200,
    });
    expect(typeof record?.latencyMs).toBe("number");
  });

  it("includes the request id in sanitised error responses", async () => {
    const lines: string[] = [];
    const logger = createLogger({
      environment: "production",
      sink: (line) => { lines.push(line); },
    });
    const app = createApp({ logger, readinessChecker: { check: async () => readyReport(true) } });
    const response = await request(app).post("/api/v1/auth/login")
      .set("X-Request-Id", "invalid-login-001")
      .send({ email: "not-an-email" })
      .expect(400);
    expect(response.body.requestId).toBe("invalid-login-001");
    expect(response.headers["x-request-id"]).toBe("invalid-login-001");
    const record = lines.map((line) => JSON.parse(line) as Record<string, unknown>)
      .find((line) => line.event === "http.request.completed");
    expect(record?.route).toBe("/api/v1/auth/login");
  });

  it("redacts secrets, names, emails and tokens from production records", () => {
    const lines: string[] = [];
    const logger = createLogger({
      environment: "production",
      sink: (line) => { lines.push(line); },
      now: () => new Date("2026-07-16T00:00:00.000Z"),
    });
    logger.info("redaction probe", {
      requestId: "request-1",
      tenantId: "tenant-1",
      userId: "user-1",
      route: "/probe",
      status: 200,
      latencyMs: 4,
      recipient: "owner@example.com",
      fullName: "Private Person",
      password: "NeverLogThis",
      note: "contact owner@example.com with Bearer raw-token-value",
    });
    const output = lines.join("\n");
    expect(output).not.toContain("owner@example.com");
    expect(output).not.toContain("Private Person");
    expect(output).not.toContain("NeverLogThis");
    expect(output).not.toContain("raw-token-value");
    expect(JSON.parse(output)).toMatchObject({
      requestId: "request-1", tenantId: "tenant-1", userId: "user-1",
      recipient: "[REDACTED]", fullName: "[REDACTED]", password: "[REDACTED]",
    });
  });
});

describe("LP-005 error hooks and crash discipline", () => {
  it("sends a redacted Sentry-compatible envelope when configured", async () => {
    const send = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const tracker = createErrorTracker({
      dsn: "https://public@sentry.example/42",
      endpoint: "https://sentry.example/api/42/envelope/",
      publicKey: "public",
      environment: "production",
      release: "test-release",
    }, undefined, send);
    await tracker.capture(new Error("failure for owner@example.com"), {
      requestId: "request-1", tenantId: "tenant-1", userId: "user-1", route: "/probe",
    });
    expect(send).toHaveBeenCalledOnce();
    const [, init] = send.mock.calls[0];
    expect(String(init?.body)).not.toContain("owner@example.com");
    expect(String(init?.body)).not.toContain("failure for");
    expect(String(init?.body)).toContain("Unhandled server error");
  });

  it("logs fatally, attempts capture and exits non-zero", async () => {
    const lines: string[] = [];
    const logger = createLogger({ environment: "production", sink: (line) => { lines.push(line); } });
    const tracker = { capture: vi.fn(noopErrorTracker.capture) };
    const exit = vi.fn();
    const fatal = createFatalHandler({
      logger, tracker, exit, captureTimeoutMs: 10,
      context: () => ({
        requestId: "request-1", tenantId: "tenant-1", userId: "user-1", route: "/probe",
      }),
    });
    await fatal("unhandled_rejection", new Error("boom"));
    expect(tracker.capture).toHaveBeenCalledOnce();
    expect(tracker.capture).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({
      event: "process.unhandled_rejection",
      requestId: "request-1",
      tenantId: "tenant-1",
      userId: "user-1",
      route: "/probe",
    }));
    expect(exit).toHaveBeenCalledWith(1);
    expect(JSON.parse(lines[0])).toMatchObject({
      level: "fatal", event: "process.unhandled_rejection",
      requestId: "request-1", tenantId: "tenant-1", userId: "user-1", route: "/probe",
    });
  });
});
