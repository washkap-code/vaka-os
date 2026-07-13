import { InvalidNotificationError } from "../errors.js";
import type { NotificationGateway, NotificationWriter } from "../interfaces.js";
import type { NotificationChannel } from "../types.js";

export function noopGateway(
  channel: Extract<NotificationChannel, "SMS" | "WHATSAPP">,
  persist: NotificationWriter,
): NotificationGateway {
  return {
    deliver(request) {
      if (request.channel !== channel) throw new InvalidNotificationError(`Placeholder gateway expected ${channel}`);
      return persist(request, { status: "accepted", transmitted: false });
    },
  };
}
