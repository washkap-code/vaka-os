import type { NotificationGateway, NotificationWriter } from "../interfaces.js";

export function inAppGateway(persist: NotificationWriter): NotificationGateway {
  return { deliver: (request) => persist(request, { status: "accepted", transmitted: false }) };
}
