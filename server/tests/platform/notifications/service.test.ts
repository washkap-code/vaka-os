import { describe, expect, it, vi } from "vitest";
import { renderEmailTemplate } from "../../../src/email-templates.js";
import { emailGateway } from "../../../src/platform/notifications/adapters/email-gateway.js";
import { noopGateway } from "../../../src/platform/notifications/adapters/noop-gateway.js";
import type {
  EmailTransportMessage, NotificationRequest, NotificationWriter,
} from "../../../src/platform/notifications/index.js";
import { NotificationService } from "../../../src/platform/notifications/service.js";

const persist: NotificationWriter = async (request, result) => ({
  requestId: request.id,
  channel: request.channel,
  status: result.status,
  transmitted: result.transmitted,
  acceptedAt: new Date("2026-07-18T00:00:00Z"),
});

describe("P1-004 NotificationService routing", () => {
  it("normalises internal routing while preserving priority and object context", async () => {
    const deliver = vi.fn(async (request: NotificationRequest) => ({
      requestId: request.id,
      channel: request.channel,
      status: "accepted" as const,
      transmitted: false,
      acceptedAt: new Date(),
    }));
    const service = new NotificationService({ IN_APP: { deliver } });

    await expect(service.send({
      id: "notice-1",
      tenantId: "tenant-1",
      actorUserId: "actor-1",
      channel: "internal",
      template: "workflow.pending_approval.v1",
      to: "approver-1",
      data: { step: "authorise" },
      priority: "urgent",
      objectRef: { objectType: "Invoice", objectId: "invoice-1" },
    })).resolves.toMatchObject({ requestId: "notice-1" });

    expect(deliver).toHaveBeenCalledWith(expect.objectContaining({
      channel: "IN_APP",
      recipient: "approver-1",
      variables: { step: "authorise" },
      priority: "urgent",
      objectRef: { objectType: "Invoice", objectId: "invoice-1" },
    }));
  });

  it("suppresses a disabled preference before invoking a provider", async () => {
    const deliver = vi.fn();
    const audit = vi.fn().mockResolvedValue(undefined);
    const preference = vi.fn().mockResolvedValue(false);
    const service = new NotificationService(
      { IN_APP: { deliver } },
      async () => null,
      audit,
      preference,
    );

    await expect(service.send({
      tenantId: "tenant-1",
      actorUserId: "actor-1",
      channel: "internal",
      template: "workflow.pending_approval.v1",
      to: "approver-1",
      data: {},
      category: "workflow",
    })).resolves.toMatchObject({ suppressed: true, transmitted: false });
    expect(deliver).not.toHaveBeenCalled();
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ category: "workflow" }),
      expect.objectContaining({ suppressed: true }));
  });

  it("keeps SMS and push as non-transmitting provider stubs", async () => {
    const service = new NotificationService({
      SMS: noopGateway("SMS", persist),
      PUSH: noopGateway("PUSH", persist),
    });
    const base = {
      tenantId: "tenant-1",
      actorUserId: "actor-1",
      template: "system.notice.v1",
      to: "recipient-1",
      data: {},
    };
    await expect(service.send({ ...base, channel: "sms" }))
      .resolves.toMatchObject({ channel: "SMS", transmitted: false });
    await expect(service.send({ ...base, channel: "push" }))
      .resolves.toMatchObject({ channel: "PUSH", transmitted: false });
  });

  it("renders modern and legacy email requests byte-identically", async () => {
    const messages: EmailTransportMessage[] = [];
    const service = new NotificationService({
      EMAIL: emailGateway(async (message) => {
        messages.push(message);
        return { providerMessageId: `memory:${message.id}` };
      }, persist, { maxAttempts: 1 }),
    });
    const variables = {
      fullName: "Tariro Moyo",
      workspaceName: "Moyo Trading",
      temporaryPassword: "Temporary-Password-123!",
      loginUrl: "https://app.vaka.test/sign-in",
    };
    await service.send({
      id: "legacy-email",
      tenantId: "tenant-1",
      actorUserId: "actor-1",
      recipient: "tariro@example.com",
      channel: "EMAIL",
      template: "security.user_invitation.v1",
      locale: "en-ZW",
      variables,
      correlationId: "invitation-1",
    });
    await service.send({
      id: "modern-email",
      tenantId: "tenant-1",
      actorUserId: "actor-1",
      to: "tariro@example.com",
      channel: "email",
      template: "security.user_invitation.v1",
      locale: "en-ZW",
      data: variables,
      priority: "high",
      correlationId: "invitation-1",
    });

    expect(messages).toHaveLength(2);
    expect(renderEmailTemplate(messages[1])).toEqual(renderEmailTemplate(messages[0]));
  });
});
