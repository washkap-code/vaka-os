export type NotificationChannel = "IN_APP" | "EMAIL" | "SMS" | "PUSH" | "WHATSAPP";
export type NotificationSendChannel = "internal" | "email" | "sms" | "push";
export type NotificationStatus = "accepted" | "sent" | "failed";
export type NotificationPriority = "low" | "normal" | "high" | "urgent";

export interface NotificationObjectReference {
  objectType: string;
  objectId: string;
}

export interface NotificationRequest {
  id: string;
  tenantId: string;
  actorUserId: string | null;
  recipient: string;
  channel: NotificationChannel;
  template: string;
  locale: string;
  variables: Record<string, string>;
  userId?: string;
  category?: string;
  priority?: NotificationPriority;
  title?: string;
  body?: string;
  link?: string;
  objectRef?: NotificationObjectReference;
  /** Stable request/business identifier used to join delivery logs. */
  correlationId?: string;
  /** Values sent to the provider but redacted from local delivery history. */
  sensitiveVariableKeys?: readonly string[];
  dedupeKey?: string;
}

/** Preferred application-facing command. The service normalises this shape
 * before invoking a provider, preserving the legacy provider message exactly. */
export interface NotificationSendRequest {
  id?: string;
  tenantId: string;
  actorUserId: string | null;
  channel: NotificationSendChannel;
  template: string;
  to: string;
  data: Record<string, string>;
  locale?: string;
  userId?: string;
  category?: string;
  priority?: NotificationPriority;
  title?: string;
  body?: string;
  link?: string;
  objectRef?: NotificationObjectReference;
  correlationId?: string;
  sensitiveVariableKeys?: readonly string[];
  dedupeKey?: string;
}

export type NotificationSendInput = NotificationRequest | NotificationSendRequest;

export interface NotificationDelivery {
  requestId: string;
  channel?: NotificationChannel;
  status?: NotificationStatus;
  /** False for in-app records and SMS/WhatsApp placeholders. */
  transmitted?: boolean;
  deduplicated?: boolean;
  providerMessageId?: string;
  acceptedAt: Date;
  suppressed?: boolean;
  priority?: NotificationPriority;
}
