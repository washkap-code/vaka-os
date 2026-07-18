import type {
  NotificationChannel, NotificationDelivery, NotificationRequest, NotificationSendInput,
  NotificationStatus,
} from "./types.js";

export interface NotificationGateway {
  deliver(request: NotificationRequest): Promise<NotificationDelivery>;
}

export type NotificationGateways = Partial<Record<NotificationChannel, NotificationGateway>>;

export type NotificationWriter = (
  request: NotificationRequest,
  result: { status: NotificationStatus; transmitted: boolean; providerMessageId?: string },
) => Promise<NotificationDelivery>;

export type NotificationDedupeLookup = (
  tenantId: string,
  dedupeKey: string,
) => Promise<NotificationDelivery | null>;

export type NotificationAuditRecorder = (
  request: NotificationRequest,
  delivery: NotificationDelivery,
) => Promise<void>;

export type NotificationPreferenceLookup = (
  request: NotificationRequest,
) => Promise<boolean>;

export interface NotificationServiceContract {
  send(request: NotificationSendInput): Promise<NotificationDelivery>;
}
