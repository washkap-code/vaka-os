import { randomUUID } from "node:crypto";
import type { ErrorTrackingConfig } from "./config.js";
import {
  activeRequestLogContext, applicationLogger, redactText, type AppLogger, type LogFields,
} from "./observability.js";

export interface ErrorTracker {
  capture(error: unknown, context?: LogFields): Promise<void>;
}

export const noopErrorTracker: ErrorTracker = { capture: async () => undefined };

type Fetch = typeof fetch;

export function createErrorTracker(
  config: ErrorTrackingConfig | null,
  logger: AppLogger = applicationLogger,
  fetcher: Fetch = fetch,
): ErrorTracker {
  if (!config) return noopErrorTracker;
  return {
    async capture(error, context = {}) {
      const eventId = randomUUID().replace(/-/g, "");
      const errorType = error instanceof Error ? error.name : "UnknownError";
      const stack = error instanceof Error && error.stack
        ? redactText([errorType, ...error.stack.split("\n").slice(1)].join("\n"))
        : "";
      const safeContext = Object.fromEntries(
        ["requestId", "tenantId", "userId", "route", "event"]
          .filter((key) => typeof context[key] === "string" || context[key] === null)
          .map((key) => [key, context[key]]),
      );
      const envelope = [
        JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString(), dsn: config.dsn }),
        JSON.stringify({ type: "event" }),
        JSON.stringify({
          event_id: eventId,
          timestamp: Date.now() / 1000,
          platform: "node",
          level: "error",
          environment: config.environment,
          release: config.release,
          exception: { values: [{ type: errorType, value: "Unhandled server error" }] },
          extra: { ...safeContext, stack: stack || undefined },
        }),
      ].join("\n");
      const response = await fetcher(config.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-sentry-envelope",
          "X-Sentry-Auth": `Sentry sentry_version=7,sentry_client=vaka-os/${config.release},sentry_key=${config.publicKey}`,
        },
        body: envelope,
      });
      if (!response.ok) {
        logger.warn("error_tracking.delivery_failed", {
          event: "error_tracking.delivery_failed", status: response.status,
        });
      }
    },
  };
}

export type FatalReason = "uncaught_exception" | "unhandled_rejection";

export function createFatalHandler(options: {
  logger?: AppLogger;
  tracker?: ErrorTracker;
  exit?: (code: number) => void;
  captureTimeoutMs?: number;
  context?: () => LogFields;
} = {}) {
  const logger = options.logger ?? applicationLogger;
  const tracker = options.tracker ?? noopErrorTracker;
  const exit = options.exit ?? ((code: number) => process.exit(code));
  const captureTimeoutMs = options.captureTimeoutMs ?? 1_000;
  const context = options.context ?? activeRequestLogContext;
  let crashing = false;
  return async (reason: FatalReason, error: unknown) => {
    if (crashing) return;
    crashing = true;
    const event = `process.${reason}`;
    const requestContext = context();
    try {
      logger.fatal(event, {
        event,
        ...requestContext,
        errorType: error instanceof Error ? error.name : "UnknownError",
      });
    } catch {
      // A broken output stream must not prevent the required non-zero exit.
    }
    try {
      await Promise.race([
        tracker.capture(error, { ...requestContext, event }),
        new Promise<void>((resolve) => setTimeout(resolve, captureTimeoutMs)),
      ]).catch(() => undefined);
    } finally {
      exit(1);
    }
  };
}

export function installCrashHandlers(options: Parameters<typeof createFatalHandler>[0] = {}): () => void {
  const handle = createFatalHandler(options);
  const uncaught = (error: Error) => { void handle("uncaught_exception", error); };
  const rejected = (reason: unknown) => { void handle("unhandled_rejection", reason); };
  process.once("uncaughtException", uncaught);
  process.once("unhandledRejection", rejected);
  return () => {
    process.off("uncaughtException", uncaught);
    process.off("unhandledRejection", rejected);
  };
}
