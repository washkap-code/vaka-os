import { randomUUID } from "node:crypto";
import { InvalidNotificationError } from "./errors.js";
import type {
  NotificationAuditRecorder, NotificationDedupeLookup, NotificationGateways,
  NotificationPreferenceLookup, NotificationServiceContract,
} from "./interfaces.js";
import type {
  NotificationChannel, NotificationDelivery, NotificationPriority, NotificationRequest,
  NotificationSendChannel, NotificationSendInput, NotificationSendRequest,
} from "./types.js";

const CHANNELS: Record<NotificationSendChannel, NotificationChannel> = {
  internal: "IN_APP",
  email: "EMAIL",
  sms: "SMS",
  push: "PUSH",
};
const PRIORITIES = new Set<NotificationPriority>(["low", "normal", "high", "urgent"]);

function isModernRequest(request: NotificationSendInput): request is NotificationSendRequest {
  return "to" in request;
}

function normalise(request: NotificationSendInput): NotificationRequest {
  if (!isModernRequest(request)) return request;
  const channel = CHANNELS[request.channel];
  if (!channel) {
    throw new InvalidNotificationError(`Notification channel "${String(request.channel)}" is not supported`);
  }
  return {
    id: request.id?.trim() || randomUUID(),
    tenantId: request.tenantId,
    actorUserId: request.actorUserId,
    recipient: request.to,
    channel,
    template: request.template,
    locale: request.locale?.trim() || "en-ZW",
    variables: request.data,
    userId: request.userId,
    category: request.category,
    priority: request.priority ?? "normal",
    title: request.title,
    body: request.body,
    link: request.link,
    objectRef: request.objectRef,
    correlationId: request.correlationId,
    sensitiveVariableKeys: request.sensitiveVariableKeys,
    dedupeKey: request.dedupeKey,
  };
}

export class NotificationService implements NotificationServiceContract {
  constructor(
    private readonly gateways: NotificationGateways,
    private readonly findDuplicate: NotificationDedupeLookup = async () => null,
    private readonly recordAudit: NotificationAuditRecorder = async () => {},
    private readonly preferenceEnabled: NotificationPreferenceLookup = async () => true,
  ) {}

  async send(input: NotificationSendInput): Promise<NotificationDelivery> {
    const request = normalise(input);
    if (!request.id.trim() || !request.tenantId.trim()) throw new InvalidNotificationError("Notification id and tenantId are required");
    if (!request.recipient.trim() || !request.template.trim()) throw new InvalidNotificationError("Recipient and template are required");
    if (!request.locale.trim()) throw new InvalidNotificationError("Notification locale is required");
    if (request.priority && !PRIORITIES.has(request.priority)) {
      throw new InvalidNotificationError(`Notification priority "${String(request.priority)}" is not supported`);
    }
    if (request.category !== undefined && !request.category.trim()) {
      throw new InvalidNotificationError("Notification category cannot be empty");
    }
    if (request.objectRef && (!request.objectRef.objectType.trim() || !request.objectRef.objectId.trim())) {
      throw new InvalidNotificationError("Notification objectRef requires objectType and objectId");
    }
    const gateway = this.gateways[request.channel];
    if (!gateway) throw new InvalidNotificationError(`Notification channel "${String(request.channel)}" is not supported`);
    if (request.dedupeKey?.trim()) {
      const duplicate = await this.findDuplicate(request.tenantId, request.dedupeKey.trim());
      if (duplicate) return { ...duplicate, deduplicated: true };
    }
    if (!await this.preferenceEnabled(request)) {
      const delivery: NotificationDelivery = {
        requestId: request.id,
        channel: request.channel,
        status: "accepted",
        transmitted: false,
        suppressed: true,
        priority: request.priority ?? "normal",
        acceptedAt: new Date(),
      };
      await this.recordAudit(request, delivery);
      return delivery;
    }
    try {
      const delivery = await gateway.deliver({
        ...request,
        dedupeKey: request.dedupeKey?.trim() || undefined,
      });
      await this.recordAudit(request, delivery);
      return delivery;
    } catch (error) {
      await this.recordAudit(request, {
        requestId: request.id,
        channel: request.channel,
        status: "failed",
        transmitted: false,
        acceptedAt: new Date(),
      });
      throw error;
    }
  }
}
