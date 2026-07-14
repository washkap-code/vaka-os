import { and, eq, ne, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db, schema } from "./lib.js";
import type { EventBusContract } from "./platform/events/interfaces.js";
import { DOMAIN_EVENTS, type DomainEventPayloads } from "./platform/events/registry.js";
import type { NotificationServiceContract } from "./platform/notifications/interfaces.js";

export interface ProcurementApprovalNotifierContract {
  notify(event: {
    tenantId: string;
    actorUserId: string | null;
    payload: DomainEventPayloads["procurement.approval_requested"];
  }): Promise<void>;
}

export class ProcurementApprovalNotifier implements ProcurementApprovalNotifierContract {
  constructor(private readonly notifications: NotificationServiceContract) {}

  async notify(event: {
    tenantId: string;
    actorUserId: string | null;
    payload: DomainEventPayloads["procurement.approval_requested"];
  }): Promise<void> {
    const recipients = await db.select({ userId: schema.users.id }).from(schema.users)
      .innerJoin(schema.roles, and(
        eq(schema.roles.id, schema.users.roleId),
        eq(schema.roles.tenantId, event.tenantId),
      )).where(and(
        eq(schema.users.tenantId, event.tenantId),
        eq(schema.users.status, "active"),
        ne(schema.users.id, event.payload.requesterUserId),
        sql`${schema.roles.permissions} @> ARRAY['procurement.approve']::text[]`,
      ));
    for (const recipient of recipients) {
      await this.notifications.send({
        id: randomUUID(),
        tenantId: event.tenantId,
        actorUserId: event.actorUserId,
        recipient: recipient.userId,
        channel: "IN_APP",
        template: "procurement.approval_requested.v1",
        locale: "en-ZW",
        variables: {
          kind: event.payload.kind,
          reference: event.payload.number ?? "Draft purchase order",
        },
        dedupeKey: `procurement-approval:${event.payload.kind}:${event.payload.entityId}:${recipient.userId}`,
      });
    }
  }
}

export function subscribeProcurementApprovalNotifications(
  bus: EventBusContract,
  notifier: ProcurementApprovalNotifierContract,
) {
  return bus.subscribe<DomainEventPayloads["procurement.approval_requested"]>(
    DOMAIN_EVENTS.PROCUREMENT_APPROVAL_REQUESTED,
    (event) => event.tenantId ? notifier.notify({
      tenantId: event.tenantId,
      actorUserId: event.actorUserId ?? null,
      payload: event.payload,
    }) : undefined,
  );
}
