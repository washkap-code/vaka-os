import type { NotificationGateway, NotificationWriter } from "../interfaces.js";
import type { NotificationRequest } from "../types.js";
import { logEvent } from "../../../observability.js";

export type EmailTransportMessage = Pick<
  NotificationRequest,
  "id" | "tenantId" | "recipient" | "template" | "locale" | "variables" | "dedupeKey"
> & { correlationId: string };
export type EmailTransport = (message: EmailTransportMessage) => Promise<{ providerMessageId?: string }>;

export type EmailDeliveryLogEvent = "email.queued" | "email.retried" | "email.sent" | "email.failed";
export type EmailDeliveryLogger = (event: EmailDeliveryLogEvent, fields: {
  messageId: string;
  tenantId: string;
  recipient: string;
  template: string;
  correlationId: string;
  attempt: number;
  delayMs?: number;
  providerMessageId?: string;
  errorCode?: string;
}) => void;

export interface EmailGatewayOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  sleep?: (delayMs: number) => Promise<void>;
  log?: EmailDeliveryLogger;
}

const defaultLog: EmailDeliveryLogger = (event, fields) => {
  logEvent(event, { ...fields, requestId: fields.correlationId },
    event === "email.failed" ? "error" : event === "email.retried" ? "warn" : "info");
};

function safeErrorCode(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error
    && typeof (error as { code?: unknown }).code === "string") {
    return (error as { code: string }).code;
  }
  return error instanceof Error ? error.name : "UNKNOWN";
}

export function emailGateway(
  send: EmailTransport,
  persist: NotificationWriter,
  options: EmailGatewayOptions = {},
): NotificationGateway {
  const maxAttempts = options.maxAttempts ?? 3;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 3) {
    throw new Error("Email delivery attempts must be between 1 and 3");
  }
  const baseDelayMs = options.baseDelayMs ?? 100;
  const sleep = options.sleep ?? ((delayMs: number) => new Promise<void>((resolve) => setTimeout(resolve, delayMs)));
  const log = options.log ?? defaultLog;
  return {
    async deliver(request) {
      const message = {
        id: request.id,
        tenantId: request.tenantId,
        recipient: request.recipient,
        template: request.template,
        locale: request.locale,
        variables: request.variables,
        dedupeKey: request.dedupeKey,
        correlationId: request.correlationId?.trim() || request.id,
      };
      const logFields = {
        messageId: message.id,
        tenantId: message.tenantId,
        recipient: message.recipient,
        template: message.template,
        correlationId: message.correlationId,
      };
      log("email.queued", { ...logFields, attempt: 1 });
      let finalError: unknown;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          const result = await send(message);
          log("email.sent", {
            ...logFields, attempt, providerMessageId: result.providerMessageId,
          });
          return persist(request, {
            status: "sent", transmitted: true, providerMessageId: result.providerMessageId,
          });
        } catch (error) {
          finalError = error;
          if (attempt < maxAttempts) {
            const delayMs = baseDelayMs * (2 ** (attempt - 1));
            log("email.retried", {
              ...logFields, attempt, delayMs, errorCode: safeErrorCode(error),
            });
            await sleep(delayMs);
            continue;
          }
          log("email.failed", {
            ...logFields, attempt, errorCode: safeErrorCode(error),
          });
        }
      }
      await persist(request, { status: "failed", transmitted: false });
      throw finalError;
    },
  };
}
