import nodemailer from "nodemailer";
import { emailDeliveryConfig, type EmailDeliveryConfig } from "./config.js";
import { renderEmailTemplate, type RenderedEmail } from "./email-templates.js";
import type { EmailTransport, EmailTransportMessage } from "./platform/notifications/index.js";
import { applicationLogger, type AppLogger } from "./observability.js";

export interface CapturedEmail {
  message: EmailTransportMessage;
  rendered: RenderedEmail;
  fromAddress: string;
  fromName: string;
  replyTo: string;
}

export type InMemoryEmailTransport = EmailTransport & {
  messages(): readonly CapturedEmail[];
  clear(): void;
  assertSent(criteria: { recipient?: string; template?: string; correlationId?: string }): CapturedEmail;
};

export function createInMemoryEmailTransport(
  sender: { fromAddress?: string; fromName?: string; replyTo?: string } = {},
): InMemoryEmailTransport {
  const deliveries: CapturedEmail[] = [];
  const send: EmailTransport = async (message) => {
    deliveries.push({
      message,
      rendered: renderEmailTemplate(message),
      fromAddress: sender.fromAddress ?? "notifications@test.vaka",
      fromName: sender.fromName ?? "VAKA Test",
      replyTo: sender.replyTo ?? "support@test.vaka",
    });
    return { providerMessageId: `memory:${message.id}` };
  };
  return Object.assign(send, {
    messages: () => deliveries.map((delivery) => ({
      ...delivery,
      message: { ...delivery.message, variables: { ...delivery.message.variables } },
      rendered: { ...delivery.rendered },
    })),
    clear: () => { deliveries.length = 0; },
    assertSent: (criteria: { recipient?: string; template?: string; correlationId?: string }) => {
      const delivery = deliveries.find(({ message }) =>
        (!criteria.recipient || message.recipient === criteria.recipient)
        && (!criteria.template || message.template === criteria.template)
        && (!criteria.correlationId || message.correlationId === criteria.correlationId));
      if (!delivery) throw new Error(`Expected in-memory email was not sent: ${JSON.stringify(criteria)}`);
      return delivery;
    },
  });
}

const processTestTransport = createInMemoryEmailTransport();

export function testEmailTransport(): InMemoryEmailTransport {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("The process test email transport is available only under NODE_ENV=test");
  }
  return processTestTransport;
}

export function createConsoleEmailTransport(
  config: Extract<EmailDeliveryConfig, { mode: "console" }>,
  logger: AppLogger = applicationLogger,
): EmailTransport {
  return async (message) => {
    const rendered = renderEmailTemplate(message);
    // Full rendered content is intentionally debug-only and limited to the
    // non-production console transport. Info-level delivery logs never carry bodies.
    logger.debugSensitive("email.console_rendered", {
      event: "email.console_rendered",
      messageId: message.id,
      correlationId: message.correlationId,
      template: message.template,
      recipient: message.recipient,
      from: { address: config.fromAddress, name: config.fromName },
      replyTo: config.replyTo,
      ...rendered,
    });
    return { providerMessageId: `console:${message.id}` };
  };
}

export type SmtpSend = (input: {
  from: { address: string; name: string };
  to: string;
  replyTo: string;
  subject: string;
  text: string;
  html: string;
  headers: Record<string, string>;
}) => Promise<{ messageId?: string }>;

export function createSmtpEmailTransport(
  config: Extract<EmailDeliveryConfig, { mode: "smtp" }>,
  injectedSend?: SmtpSend,
): EmailTransport {
  const transport = injectedSend ? null : nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.tls === "implicit",
    requireTLS: config.tls === "starttls",
    ignoreTLS: config.tls === "none",
    auth: { user: config.authUser, pass: config.authPassword },
  });
  const send: SmtpSend = injectedSend ?? (async (input) => transport!.sendMail(input));
  return async (message) => {
    const rendered = renderEmailTemplate(message);
    const result = await send({
      from: { address: config.fromAddress, name: config.fromName },
      to: message.recipient,
      replyTo: config.replyTo,
      ...rendered,
      headers: {
        "X-VAKA-Message-Id": message.id,
        "X-VAKA-Correlation-Id": message.correlationId,
        "X-VAKA-Template": message.template,
      },
    });
    return { providerMessageId: result.messageId };
  };
}

export function createConfiguredEmailTransport(
  config: EmailDeliveryConfig = emailDeliveryConfig(),
  logger: AppLogger = applicationLogger,
): EmailTransport {
  if (config.mode === "memory") return processTestTransport;
  if (config.mode === "console") return createConsoleEmailTransport(config, logger);
  return createSmtpEmailTransport(config);
}
