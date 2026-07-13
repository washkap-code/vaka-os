import type { NotificationGateway, NotificationWriter } from "../interfaces.js";
import type { NotificationRequest } from "../types.js";

export type EmailTransportMessage = Pick<
  NotificationRequest,
  "id" | "tenantId" | "recipient" | "template" | "locale" | "variables" | "dedupeKey"
>;
export type EmailTransport = (message: EmailTransportMessage) => Promise<{ providerMessageId?: string }>;

export function emailGateway(send: EmailTransport, persist: NotificationWriter): NotificationGateway {
  return {
    async deliver(request) {
      try {
        const result = await send({
          id: request.id,
          tenantId: request.tenantId,
          recipient: request.recipient,
          template: request.template,
          locale: request.locale,
          variables: request.variables,
          dedupeKey: request.dedupeKey,
        });
        return persist(request, {
          status: "sent", transmitted: true, providerMessageId: result.providerMessageId,
        });
      } catch (error) {
        await persist(request, { status: "failed", transmitted: false });
        throw error;
      }
    },
  };
}
