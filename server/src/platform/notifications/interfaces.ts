import type { NotificationDelivery, NotificationRequest } from "./types.js";

export interface NotificationGateway {
  deliver(request: NotificationRequest): Promise<NotificationDelivery>;
}

export interface NotificationServiceContract {
  send(request: NotificationRequest): Promise<NotificationDelivery>;
}
