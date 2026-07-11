import { InvalidNotificationError } from "./errors.js";
import type { NotificationGateway, NotificationServiceContract } from "./interfaces.js";
import type { NotificationDelivery, NotificationRequest } from "./types.js";

export class NotificationService implements NotificationServiceContract {
  constructor(private readonly gateway: NotificationGateway) {}

  async send(request: NotificationRequest): Promise<NotificationDelivery> {
    if (!request.id.trim() || !request.tenantId.trim()) throw new InvalidNotificationError("Notification id and tenantId are required");
    if (!request.recipient.trim() || !request.template.trim()) throw new InvalidNotificationError("Recipient and template are required");
    if (!request.locale.trim()) throw new InvalidNotificationError("Notification locale is required");
    return this.gateway.deliver(request);
  }
}
