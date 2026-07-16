import { describe, expect, it, vi } from "vitest";
import { emailDeliveryConfig } from "../src/config.js";
import {
  createConsoleEmailTransport, createInMemoryEmailTransport, createSmtpEmailTransport,
} from "../src/email-transport.js";

const invitation = {
  id: "email-transport-1",
  tenantId: "tenant-1",
  recipient: "recipient@example.com",
  template: "security.user_invitation.v1",
  locale: "en-ZW",
  variables: {
    fullName: "Test Recipient",
    workspaceName: "Example Workspace",
    temporaryPassword: "Temporary-Password-2026",
    loginUrl: "https://app.example.com",
  },
  correlationId: "correlation-1",
};

describe("LP-004 email transports", () => {
  it("captures rendered test messages and exposes assertion helpers", async () => {
    const transport = createInMemoryEmailTransport();
    await transport(invitation);
    const captured = transport.assertSent({
      recipient: invitation.recipient,
      template: invitation.template,
      correlationId: invitation.correlationId,
    });
    expect(captured.rendered.text).toContain("Temporary-Password-2026");
    expect(captured.rendered.html).toContain("https://app.example.com");
    transport.clear();
    expect(transport.messages()).toHaveLength(0);
  });

  it("maps sender identity, reply-to and correlation headers to SMTP", async () => {
    const config = emailDeliveryConfig({
      NODE_ENV: "staging",
      SMTP_ENABLED: "true",
      SMTP_HOST: "smtp.example.com",
      SMTP_PORT: "587",
      SMTP_AUTH_USER: "smtp-user",
      SMTP_AUTH_PASSWORD: "smtp-password-for-test",
      SMTP_FROM_ADDRESS: "notifications@example.com",
      SMTP_FROM_NAME: "VAKA",
      SMTP_REPLY_TO: "support@example.com",
      SMTP_TLS: "starttls",
    });
    if (config.mode !== "smtp") throw new Error("Expected SMTP configuration");
    const send = vi.fn().mockResolvedValue({ messageId: "smtp-message-1" });
    const transport = createSmtpEmailTransport(config, send);
    await expect(transport(invitation)).resolves.toEqual({ providerMessageId: "smtp-message-1" });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      from: { address: "notifications@example.com", name: "VAKA" },
      to: invitation.recipient,
      replyTo: "support@example.com",
      headers: expect.objectContaining({ "X-VAKA-Correlation-Id": "correlation-1" }),
    }));
  });

  it("writes full rendered content only through the non-production debug transport", async () => {
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    const config = emailDeliveryConfig({ NODE_ENV: "development" });
    if (config.mode !== "console") throw new Error("Expected console configuration");
    await createConsoleEmailTransport(config)(invitation);
    expect(debug).toHaveBeenCalledOnce();
    expect(String(debug.mock.calls[0][0])).toContain("email.console_rendered");
    expect(String(debug.mock.calls[0][0])).toContain("Temporary-Password-2026");
    debug.mockRestore();
  });
});
