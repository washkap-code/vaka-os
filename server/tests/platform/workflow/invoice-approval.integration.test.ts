import { and, eq } from "drizzle-orm";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../../src/app.js";
import { createDraftInvoice } from "../../../src/invoicing.js";
import { db, schema } from "../../../src/lib.js";
import { DOMAIN_EVENTS } from "../../../src/platform/events/registry.js";
import { EVENT_BUS, platformKernel } from "../../../src/platform-runtime.js";
import { assertSafeFinanceTestDatabase } from "../../finance/test-db-guard.js";
import {
  createContact, createProduct, defaultWarehouse, signupFinanceTenant, type TestTenant,
} from "../../finance/helpers.js";

assertSafeFinanceTestDatabase();

const app = createApp();
let tenant: TestTenant;

beforeAll(async () => {
  tenant = await signupFinanceTenant("workflow-invoice");
});

describe("invoice issue workflow adoption", () => {
  it("preserves the issue API response while recording the completed workflow", async () => {
    const customer = await createContact(tenant, "Workflow Customer");
    const draft = await createDraftInvoice({
      tenantId: tenant.tenantId,
      contactId: customer.id,
      currency: "USD",
      createdBy: tenant.userId,
      lines: [{ description: "Advisory", quantity: "1", unitPrice: "125.00", taxRate: "15" }],
    });
    const eventTypes: string[] = [];
    const eventBus = platformKernel().container.get(EVENT_BUS);
    const subscriptions = [
      DOMAIN_EVENTS.WORKFLOW_STARTED,
      DOMAIN_EVENTS.WORKFLOW_APPROVED,
      DOMAIN_EVENTS.WORKFLOW_COMPLETED,
    ].map((type) => eventBus.subscribe(type, () => { eventTypes.push(type); }));

    const response = await request(app)
      .post(`/api/v1/invoices/${draft.id}/issue`)
      .set(tenant.auth)
      .send({});
    subscriptions.forEach((subscription) => subscription.unsubscribe());

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: draft.id,
      tenantId: tenant.tenantId,
      status: "ISSUED",
      total: "143.75",
      createdBy: tenant.userId,
    });
    expect(response.body.number).toMatch(/^INV-\d{5}$/);
    expect(response.body).not.toHaveProperty("workflow");

    const [definition] = await db.select().from(schema.workflowDefinitions).where(and(
      eq(schema.workflowDefinitions.tenantId, tenant.tenantId),
      eq(schema.workflowDefinitions.name, "invoice.issue.approval"),
      eq(schema.workflowDefinitions.version, 1),
    ));
    expect(definition).toMatchObject({ objectType: "Invoice", active: true });
    expect(definition.stepsJson).toEqual([{
      name: "authorise-issue",
      approver: { type: "role", role: "Accounting poster", permission: "accounting.post" },
    }]);

    const [instance] = await db.select().from(schema.workflowInstances).where(and(
      eq(schema.workflowInstances.tenantId, tenant.tenantId),
      eq(schema.workflowInstances.objectType, "Invoice"),
      eq(schema.workflowInstances.objectId, draft.id),
    ));
    expect(instance).toMatchObject({
      definitionId: definition.id,
      status: "COMPLETED",
      currentStep: 0,
      startedBy: tenant.userId,
    });
    expect(instance.completedAt).toBeInstanceOf(Date);

    const actions = await db.select().from(schema.workflowActions)
      .where(eq(schema.workflowActions.instanceId, instance.id));
    expect(actions).toEqual([expect.objectContaining({
      step: 0,
      actorId: tenant.userId,
      action: "APPROVE",
      comment: null,
    })]);
    const auditRows = await db.select().from(schema.auditLogs).where(and(
      eq(schema.auditLogs.tenantId, tenant.tenantId),
      eq(schema.auditLogs.entityType, "workflow_instance"),
      eq(schema.auditLogs.entityId, instance.id),
    ));
    expect(auditRows.map((row) => row.action)).toEqual(expect.arrayContaining([
      "workflow.started", "workflow.approved", "workflow.completed",
    ]));
    expect(eventTypes).toEqual([
      DOMAIN_EVENTS.WORKFLOW_STARTED,
      DOMAIN_EVENTS.WORKFLOW_APPROVED,
      DOMAIN_EVENTS.WORKFLOW_COMPLETED,
    ]);
  });

  it("rolls workflow evidence back when invoice posting fails", async () => {
    const customer = await createContact(tenant, "Workflow Rollback Customer");
    const product = await createProduct(tenant, "workflow-oversell", { trackStock: true });
    const warehouse = await defaultWarehouse(tenant);
    const draft = await createDraftInvoice({
      tenantId: tenant.tenantId,
      contactId: customer.id,
      currency: "USD",
      createdBy: tenant.userId,
      lines: [{
        productId: product.id,
        warehouseId: warehouse.id,
        description: "Unavailable stock",
        quantity: "1",
        unitPrice: "15.00",
        taxRate: "15",
      }],
    });
    const eventTypes: string[] = [];
    const subscription = platformKernel().container.get(EVENT_BUS)
      .subscribe(DOMAIN_EVENTS.WORKFLOW_STARTED, () => { eventTypes.push(DOMAIN_EVENTS.WORKFLOW_STARTED); });

    const response = await request(app)
      .post(`/api/v1/invoices/${draft.id}/issue`)
      .set(tenant.auth)
      .send({});
    subscription.unsubscribe();

    expect(response.status).toBe(409);
    expect(response.body.message).toMatch(/Insufficient stock/);
    const instances = await db.select().from(schema.workflowInstances).where(and(
      eq(schema.workflowInstances.tenantId, tenant.tenantId),
      eq(schema.workflowInstances.objectId, draft.id),
    ));
    expect(instances).toEqual([]);
    const workflowAudits = await db.select().from(schema.auditLogs).where(and(
      eq(schema.auditLogs.tenantId, tenant.tenantId),
      eq(schema.auditLogs.entityType, "workflow_instance"),
    ));
    expect(workflowAudits.some((row) =>
      (row.metadata as { objectId?: string } | null)?.objectId === draft.id)).toBe(false);
    expect(eventTypes).toEqual([]);
  });
});
