import { InvalidAuditEventError } from "./errors.js";
import type { AuditServiceContract } from "./interfaces.js";
import type { AuditEvent, AuditSink } from "./types.js";

export class AuditService implements AuditServiceContract {
  constructor(private readonly sink: AuditSink) {}

  async record(event: AuditEvent): Promise<void> {
    if (!event.tenantId.trim()) throw new InvalidAuditEventError("tenantId is required");
    if (!event.action.trim()) throw new InvalidAuditEventError("action is required");
    if (!event.entityType.trim()) throw new InvalidAuditEventError("entityType is required");
    await this.sink.append({ ...event, occurredAt: event.occurredAt ?? new Date() });
  }
}
