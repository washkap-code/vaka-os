export type NotificationChannel = "IN_APP" | "EMAIL" | "SMS" | "WHATSAPP";

export interface NotificationRequest {
  id: string;
  tenantId: string;
  recipient: string;
  channel: NotificationChannel;
  template: string;
  locale: string;
  variables: Record<string, string>;
  dedupeKey?: string;
}

export interface NotificationDelivery {
  requestId: string;
  providerMessageId?: string;
  acceptedAt: Date;
}
