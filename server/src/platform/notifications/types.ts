export type NotificationChannel = "IN_APP" | "EMAIL" | "SMS" | "WHATSAPP";
export type NotificationStatus = "accepted" | "sent" | "failed";

export interface NotificationRequest {
  id: string;
  tenantId: string;
  actorUserId: string | null;
  recipient: string;
  channel: NotificationChannel;
  template: string;
  locale: string;
  variables: Record<string, string>;
  dedupeKey?: string;
}

export interface NotificationDelivery {
  requestId: string;
  channel?: NotificationChannel;
  status?: NotificationStatus;
  /** False for in-app records and SMS/WhatsApp placeholders. */
  transmitted?: boolean;
  deduplicated?: boolean;
  providerMessageId?: string;
  acceptedAt: Date;
}
