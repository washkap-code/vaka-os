// ============================================================================
// INVOICE APPROVAL WORKFLOW ADAPTER (P1-003)
//
// The existing invoice `issue` command is the current approval-equivalent
// action. This adapter records its one-step authorization through the durable
// WorkflowService inside the invoice transaction. It does not post journals,
// allocate numbers, move stock or alter invoice lifecycle rules.
// ============================================================================
import type { DB } from "./lib.js";
import { schema } from "./lib.js";
import { AuditService } from "./platform/audit/service.js";
import { createAuditSink } from "./platform/audit/adapters/audit-sink.js";
import type { EventBusContract } from "./platform/events/interfaces.js";
import type { QueuePlatformEvent } from "./platform/events/adapters/publisher.js";
import type { EventHandler, EventSubscription, PlatformEvent } from "./platform/events/types.js";
import type { IdentityServiceContract } from "./platform/identity/interfaces.js";
import { WorkflowStateConflictError } from "./platform/workflow/errors.js";
import { WorkflowService } from "./platform/workflow/service.js";
import type { WorkflowProcessDefinition } from "./platform/workflow/types.js";
import { PostgresWorkflowStore } from "./workflow-store.js";

export const INVOICE_APPROVAL_WORKFLOW = {
  name: "invoice.issue.approval",
  version: 1,
  objectType: "Invoice",
  active: true,
  steps: [{
    name: "authorise-issue",
    approver: {
      type: "role",
      role: "Accounting poster",
      permission: "accounting.post",
    },
  }],
} as const satisfies WorkflowProcessDefinition;

class PostCommitWorkflowEventBus implements EventBusContract {
  constructor(private readonly queue: QueuePlatformEvent) {}

  async publish<TPayload>(event: PlatformEvent<TPayload>): Promise<void> {
    this.queue(event);
  }

  subscribe<TPayload>(_type: string, _handler: EventHandler<TPayload>): EventSubscription {
    throw new Error("The transaction-scoped workflow event bus does not accept subscriptions");
  }
}

export async function approveInvoiceForIssue(options: {
  tx: DB;
  queuePlatformEvent: QueuePlatformEvent;
  identity: IdentityServiceContract;
  tenantId: string;
  actorUserId: string;
  invoiceId: string;
  amount: string;
}): Promise<void> {
  const workflow = new WorkflowService({
    store: new PostgresWorkflowStore(options.tx),
    audit: new AuditService(createAuditSink(async (row) => {
      await options.tx.insert(schema.auditLogs).values(row);
    })),
    events: new PostCommitWorkflowEventBus(options.queuePlatformEvent),
  });
  const context = {
    tenantId: options.tenantId,
    actorUserId: options.actorUserId,
    identity: options.identity,
    amount: options.amount,
  };
  const instance = await workflow.start(
    INVOICE_APPROVAL_WORKFLOW,
    { objectType: "Invoice", objectId: options.invoiceId },
    context,
  );
  const completed = await workflow.approve(instance.id, context);
  if (completed.status !== "COMPLETED") {
    throw new WorkflowStateConflictError("Invoice issue authorization did not complete");
  }
}
