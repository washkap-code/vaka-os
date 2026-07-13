import { InvalidNotificationError } from "./errors.js";
import type {
  NotificationAuditRecorder, NotificationDedupeLookup, NotificationGateways,
  NotificationServiceContract,
} from "./interfaces.js";
import type { NotificationDelivery, NotificationRequest } from "./types.js";

export class NotificationService implements NotificationServiceContract {
  constructor(
    private readonly gateways: NotificationGateways,
    private readonly findDuplicate: NotificationDedupeLookup = async () => null,
    private readonly recordAudit: NotificationAuditRecorder = async () => {},
  ) {}

  async send(request: NotificationRequest): Promise<NotificationDelivery> {
    if (!request.id.trim() || !request.tenantId.trim()) throw new InvalidNotificationError("Notification id and tenantId are required");
    if (!request.recipient.trim() || !request.template.trim()) throw new InvalidNotificationError("Recipient and template are required");
    if (!request.locale.trim()) throw new InvalidNotificationError("Notification locale is required");
    const gateway = this.gateways[request.channel];
    if (!gateway) throw new InvalidNotificationError(`Notification channel "${String(request.channel)}" is not supported`);
    if (request.dedupeKey?.trim()) {
      const duplicate = await this.findDuplicate(request.tenantId, request.dedupeKey.trim());
      if (duplicate) return { ...duplicate, deduplicated: true };
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
