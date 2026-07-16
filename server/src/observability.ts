import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import type { NextFunction, Request, Response } from "express";

export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";
export type LogFields = Record<string, unknown>;
export type LogSink = (line: string, level: LogLevel) => void;

export interface AppLogger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
  fatal(message: string, fields?: LogFields): void;
  /** Full diagnostic payloads are permitted only outside production. */
  debugSensitive(message: string, fields?: LogFields): void;
}

const redactedKey = /(?:authorization|cookie|password|secret|token|body|html|recipient|email|name$|message$)/i;
const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const bearerPattern = /\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi;
const jwtPattern = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const requestStorage = new AsyncLocalStorage<Request>();

export function redactText(value: string): string {
  return value
    .replace(emailPattern, "[REDACTED_EMAIL]")
    .replace(bearerPattern, "Bearer [REDACTED]")
    .replace(jwtPattern, "[REDACTED_TOKEN]");
}

function serialisable(value: unknown, redact: boolean, depth = 0): unknown {
  if (depth > 6) return "[TRUNCATED]";
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === "string") return redact ? redactText(value) : value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return redact
      ? { errorType: value.name }
      : { errorType: value.name, errorMessage: value.message, stack: value.stack ?? null };
  }
  if (Array.isArray(value)) return value.map((entry) => serialisable(entry, redact, depth + 1));
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      redact && redactedKey.test(key) ? "[REDACTED]" : serialisable(entry, redact, depth + 1),
    ]));
  }
  return String(value);
}

const defaultSink: LogSink = (line, level) => {
  const stream = level === "error" || level === "fatal" ? process.stderr : process.stdout;
  stream.write(`${line}\n`);
};

export function createLogger(options: {
  environment?: string;
  sink?: LogSink;
  now?: () => Date;
} = {}): AppLogger {
  const environment = options.environment ?? process.env.NODE_ENV ?? "unknown";
  const sink = options.sink ?? (environment === "test" ? () => undefined : defaultSink);
  const now = options.now ?? (() => new Date());

  const write = (level: LogLevel, message: string, fields: LogFields = {}, sensitive = false) => {
    if (sensitive && environment === "production") return;
    const safeFields = serialisable({ ...activeRequestLogContext(), ...fields }, !sensitive) as LogFields;
    const record = {
      ...safeFields,
      timestamp: now().toISOString(),
      level,
      message: redactText(message),
      requestId: safeFields.requestId ?? null,
      tenantId: safeFields.tenantId ?? null,
      userId: safeFields.userId ?? null,
      route: safeFields.route ?? null,
      status: safeFields.status ?? null,
      latencyMs: safeFields.latencyMs ?? null,
    };
    sink(JSON.stringify(record), level);
  };

  return {
    debug: (message, fields) => write("debug", message, fields),
    info: (message, fields) => write("info", message, fields),
    warn: (message, fields) => write("warn", message, fields),
    error: (message, fields) => write("error", message, fields),
    fatal: (message, fields) => write("fatal", message, fields),
    debugSensitive: (message, fields) => write("debug", message, fields, true),
  };
}

export const applicationLogger = createLogger();

export function logEvent(
  event: string,
  fields: LogFields = {},
  level: Exclude<LogLevel, "debug" | "fatal"> = "info",
  logger: AppLogger = applicationLogger,
): void {
  logger[level](event, { event, ...fields });
}

const acceptableRequestId = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

function routeFor(req: Request): string {
  const routePath = typeof req.route?.path === "string" ? req.route.path : null;
  if (!routePath) return "unmatched";
  const apiPrefix = !routePath.startsWith("/api/v1") && req.originalUrl.startsWith("/api/v1")
    ? "/api/v1"
    : "";
  return `${req.baseUrl || apiPrefix}${routePath}`;
}

export function requestObservability(logger: AppLogger = applicationLogger) {
  return (req: Request, res: Response, next: NextFunction) => {
    const supplied = req.header("X-Request-Id")?.trim();
    req.requestId = supplied && acceptableRequestId.test(supplied) ? supplied : randomUUID();
    res.setHeader("X-Request-Id", req.requestId);
    const originalJson = res.json.bind(res);
    res.json = ((body: unknown) => {
      const payload = res.statusCode >= 400 && body && typeof body === "object"
        && !Array.isArray(body) && !("requestId" in body)
        ? { ...body, requestId: req.requestId }
        : body;
      return originalJson(payload);
    }) as Response["json"];
    const started = process.hrtime.bigint();
    res.once("finish", () => {
      const auth = (req as Request & {
        auth?: { tenantId?: string | null; userId?: string | null };
      }).auth;
      logEvent("http.request.completed", {
        requestId: req.requestId,
        tenantId: auth?.tenantId ?? null,
        userId: auth?.userId ?? null,
        route: routeFor(req),
        method: req.method,
        status: res.statusCode,
        latencyMs: Number(process.hrtime.bigint() - started) / 1_000_000,
      }, res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info", logger);
    });
    requestStorage.run(req, next);
  };
}

export function requestLogContext(req: Request): LogFields {
  const auth = (req as Request & {
    auth?: { tenantId?: string | null; userId?: string | null };
  }).auth;
  return {
    requestId: req.requestId ?? null,
    tenantId: auth?.tenantId ?? null,
    userId: auth?.userId ?? null,
    route: routeFor(req),
  };
}

export function activeRequestLogContext(): LogFields {
  const request = requestStorage.getStore();
  return request ? requestLogContext(request) : {};
}
