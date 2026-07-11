export interface AuditEvent {
  tenantId: string;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
  occurredAt?: Date;
}

export interface AuditSink {
  append(event: AuditEvent): Promise<void> | void;
}
