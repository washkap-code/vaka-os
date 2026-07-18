import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "./lib.js";
import type { EventBusContract } from "./platform/events/interfaces.js";
import { DOMAIN_EVENTS, type DomainEventPayloads } from "./platform/events/registry.js";
import type { NotificationServiceContract } from "./platform/notifications/interfaces.js";

type PendingWorkflowPayload = DomainEventPayloads["workflow.started"]
  | DomainEventPayloads["workflow.approved"];

export interface WorkflowNotificationCoordinatorContract {
  notifyPending(event: {
    tenantId: string;
    actorUserId: string | null;
    payload: PendingWorkflowPayload;
  }): Promise<void>;
}

function objectLink(objectType: string, objectId: string): string {
  if (objectType === "Invoice") return `/invoices/${encodeURIComponent(objectId)}`;
  return `/workflows/${encodeURIComponent(objectId)}`;
}

export class WorkflowNotificationCoordinator implements WorkflowNotificationCoordinatorContract {
  constructor(private readonly notifications: NotificationServiceContract) {}

  async notifyPending(event: {
    tenantId: string;
    actorUserId: string | null;
    payload: PendingWorkflowPayload;
  }): Promise<void> {
    if (event.payload.status !== "ACTIVE") return;
    const [definition] = await db.select({ steps: schema.workflowDefinitions.stepsJson })
      .from(schema.workflowDefinitions).where(and(
        eq(schema.workflowDefinitions.id, event.payload.definitionId),
        eq(schema.workflowDefinitions.tenantId, event.tenantId),
      ));
    const step = definition?.steps[event.payload.currentStep];
    if (!step) return;

    const approvers = await db.select({ userId: schema.users.id }).from(schema.users)
      .innerJoin(schema.roles, and(
        eq(schema.roles.id, schema.users.roleId),
        eq(schema.roles.tenantId, event.tenantId),
      )).where(and(
        eq(schema.users.tenantId, event.tenantId),
        eq(schema.users.status, "active"),
        sql`${schema.roles.permissions} @> ARRAY[${step.approver.permission}]::text[]`,
      ));

    for (const approver of approvers) {
      const id = `workflow-pending:${event.payload.instanceId}:${event.payload.currentStep}:${approver.userId}`;
      await this.notifications.send({
        id,
        tenantId: event.tenantId,
        actorUserId: event.actorUserId,
        channel: "internal",
        template: "workflow.pending_approval.v1",
        to: approver.userId,
        userId: approver.userId,
        data: {
          workflowName: event.payload.workflowName,
          objectType: event.payload.objectType,
          objectId: event.payload.objectId,
          stepName: step.name,
        },
        category: "workflow",
        priority: "high",
        title: `${event.payload.objectType} approval required`,
        body: `${event.payload.objectType} is awaiting your approval at ${step.name}.`,
        link: objectLink(event.payload.objectType, event.payload.objectId),
        objectRef: {
          objectType: event.payload.objectType,
          objectId: event.payload.objectId,
        },
        correlationId: event.payload.instanceId,
        dedupeKey: id,
      });
    }
  }
}

export function subscribeWorkflowNotifications(
  bus: EventBusContract,
  coordinator: WorkflowNotificationCoordinatorContract,
) {
  const subscriptions = [
    bus.subscribe<DomainEventPayloads["workflow.started"]>(DOMAIN_EVENTS.WORKFLOW_STARTED, (event) =>
      event.tenantId ? coordinator.notifyPending({
        tenantId: event.tenantId,
        actorUserId: event.actorUserId ?? null,
        payload: event.payload,
      }) : undefined),
    bus.subscribe<DomainEventPayloads["workflow.approved"]>(DOMAIN_EVENTS.WORKFLOW_APPROVED, (event) =>
      event.tenantId ? coordinator.notifyPending({
        tenantId: event.tenantId,
        actorUserId: event.actorUserId ?? null,
        payload: event.payload,
      }) : undefined),
    // Terminal events have no pending approver. Explicit subscriptions keep
    // the workflow.* contract complete and provide a seam for future outcomes.
    bus.subscribe(DOMAIN_EVENTS.WORKFLOW_REJECTED, () => undefined),
    bus.subscribe(DOMAIN_EVENTS.WORKFLOW_COMPLETED, () => undefined),
  ];
  return { unsubscribe: () => subscriptions.forEach((subscription) => subscription.unsubscribe()) };
}
