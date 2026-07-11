export interface PlatformEvent<TPayload = unknown> {
  id: string;
  type: string;
  occurredAt: Date;
  tenantId: string | null;
  actorUserId?: string | null;
  payload: TPayload;
}

export type EventHandler<TPayload = unknown> = (event: PlatformEvent<TPayload>) => Promise<void> | void;
export interface EventSubscription { unsubscribe(): void; }
