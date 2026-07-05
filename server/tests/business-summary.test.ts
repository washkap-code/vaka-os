import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { db, schema } from "../src/lib.js";

const app = createApp();
const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const password = "SummaryTest123!";
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

type TestTenant = {
  tenantId: string;
  token: string;
  customerId: string;
  invoiceId: string;
  productId: string;
  dealId: string;
};

async function createTenant(label: string): Promise<{ tenantId: string; token: string }> {
  const response = await request(app).post("/api/v1/auth/signup").send({
    companyName: `Synthetic Summary ${label}`,
    subdomain: `summary-${runId}-${label}`,
    baseCurrency: "USD",
    ownerEmail: `summary-${runId}-${label}@test.vaka`,
    ownerPassword: password,
    ownerName: "Synthetic Owner",
    planName: "Growth",
  });
  expect(response.status).toBe(200);
  return { tenantId: response.body.tenant.id, token: response.body.token };
}

async function createSyntheticBusiness(label: string): Promise<TestTenant> {
  const tenant = await createTenant(label);

  const customer = await request(app).post("/api/v1/contacts").set(auth(tenant.token)).send({
    name: `Synthetic Customer ${label}`,
    isCustomer: true,
    isVendor: false,
  });
  expect(customer.status).toBe(200);

  const dueDate = new Date(Date.now() - 40 * 86_400_000);
  const draft = await request(app).post("/api/v1/invoices").set(auth(tenant.token)).send({
    contactId: customer.body.id,
    currency: "USD",
    dueDate: dueDate.toISOString(),
    lines: [{
      description: "Synthetic advisory service",
      quantity: "1",
      unitPrice: "100.00",
      taxRate: "15",
    }],
  });
  expect(draft.status).toBe(200);
  const issued = await request(app).post(`/api/v1/invoices/${draft.body.id}/issue`).set(auth(tenant.token)).send({});
  expect(issued.status).toBe(200);

  const product = await request(app).post("/api/v1/products").set(auth(tenant.token)).send({
    sku: `SYN-${label.toUpperCase()}`,
    name: `Synthetic Stock ${label}`,
    costPrice: "5.00",
    salePrice: "8.00",
    taxRate: "15",
    reorderLevel: 5,
  });
  expect(product.status).toBe(200);

  const deal = await request(app).post("/api/v1/deals").set(auth(tenant.token)).send({
    contactId: customer.body.id,
    title: `Synthetic Opportunity ${label}`,
    valueAmount: "250.00",
    valueCurrency: "USD",
  });
  expect(deal.status).toBe(200);

  return {
    ...tenant,
    customerId: customer.body.id,
    invoiceId: issued.body.id,
    productId: product.body.id,
    dealId: deal.body.id,
  };
}

async function createRestrictedUser(
  tenantId: string,
  label: string,
  permissions: string[],
): Promise<string> {
  const [role] = await db.insert(schema.roles).values({
    tenantId,
    name: `Summary ${label} ${runId}`,
    permissions,
    isSystem: false,
  }).returning();
  const email = `summary-${label}-${runId}@test.vaka`;
  await db.insert(schema.users).values({
    tenantId,
    email,
    passwordHash: await bcrypt.hash(password, 4),
    fullName: `Summary ${label}`,
    roleId: role.id,
  });
  const login = await request(app).post("/api/v1/auth/login").send({
    email,
    password,
    subdomain: `summary-${runId}-a`,
  });
  expect(login.status).toBe(200);
  return login.body.token;
}

let tenantA: TestTenant;
let tenantB: TestTenant;
let reportOnlyToken: string;
let noReportToken: string;

beforeAll(async () => {
  tenantA = await createSyntheticBusiness("a");
  tenantB = await createSyntheticBusiness("b");
  reportOnlyToken = await createRestrictedUser(tenantA.tenantId, "report-only", ["reports.read"]);
  noReportToken = await createRestrictedUser(tenantA.tenantId, "no-report", ["crm.read"]);
});

function currentYearPeriod() {
  const now = new Date();
  return {
    from: new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString(),
    to: new Date(Date.UTC(now.getUTCFullYear(), 11, 31, 23, 59, 59)).toISOString(),
  };
}

describe("provider-independent business summary read model", () => {
  it("returns exact, source-linked, bounded deterministic sections", async () => {
    const period = currentYearPeriod();
    const response = await request(app)
      .get("/api/v1/ai/read-models/business-summary")
      .query(period)
      .set(auth(tenantA.token));

    expect(response.status).toBe(200);
    expect(response.body.kind).toBe("vaka.business_summary");
    expect(response.body.schemaVersion).toBe("1.0");
    expect(response.body.scope.tenantId).toBe(tenantA.tenantId);
    expect(response.body.scope.baseCurrency).toBe("USD");
    expect(response.body.scope.period.timeZone).toBe("Africa/Harare");
    expect(response.body.freshness.generatedFromLiveRecords).toBe(true);

    const financial = response.body.sections.financialPerformance;
    expect(financial.status).toBe("available");
    expect(financial.data.basis).toBe("posted_journal_entries");
    expect(financial.data.income).toBe("100.00");
    expect(financial.data.expenses).toBe("0.00");
    expect(financial.data.netProfit).toBe("100.00");
    expect(financial.data.source.report).toBe("profit_and_loss");

    const receivables = response.body.sections.receivables;
    expect(receivables.status).toBe("available");
    expect(receivables.data.totals).toContainEqual({ currency: "USD", amount: "115.00" });
    expect(receivables.data.overdueTotals).toContainEqual({ currency: "USD", amount: "115.00" });
    expect(receivables.data.attentionItems).toEqual(expect.arrayContaining([
      expect.objectContaining({
        invoiceId: tenantA.invoiceId,
        customerId: tenantA.customerId,
        currency: "USD",
        outstanding: "115.00",
      }),
    ]));
    expect(receivables.data.truncated).toBe(false);

    const inventory = response.body.sections.inventoryAttention;
    expect(inventory.status).toBe("available");
    expect(inventory.data.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        productId: tenantA.productId,
        quantityOnHand: "0.000",
        reorderLevel: "5.000",
      }),
    ]));

    const pipeline = response.body.sections.pipelineAttention;
    expect(pipeline.status).toBe("available");
    expect(pipeline.data.stages).toContainEqual({
      stage: "NEW",
      currency: "USD",
      dealCount: 1,
      value: "250.00",
    });
  });

  it("does not expose another tenant's records or identifiers", async () => {
    const response = await request(app)
      .get("/api/v1/ai/read-models/business-summary")
      .query(currentYearPeriod())
      .set(auth(tenantB.token));

    expect(response.status).toBe(200);
    expect(response.body.scope.tenantId).toBe(tenantB.tenantId);
    const serialised = JSON.stringify(response.body);
    expect(serialised).not.toContain(tenantA.customerId);
    expect(serialised).not.toContain(tenantA.invoiceId);
    expect(serialised).not.toContain(tenantA.productId);
    expect(serialised).not.toContain(tenantA.dealId);
    expect(serialised).toContain(tenantB.invoiceId);
  });

  it("marks optional sections unavailable instead of treating denied data as zero", async () => {
    const response = await request(app)
      .get("/api/v1/ai/read-models/business-summary")
      .query(currentYearPeriod())
      .set(auth(reportOnlyToken));

    expect(response.status).toBe(200);
    expect(response.body.sections.financialPerformance.status).toBe("available");
    expect(response.body.sections.receivables).toEqual({
      status: "unavailable",
      reason: "PERMISSION_REQUIRED",
      requiredPermission: "accounting.read",
    });
    expect(response.body.sections.inventoryAttention.requiredPermission).toBe("inventory.read");
    expect(response.body.sections.pipelineAttention.requiredPermission).toBe("crm.read");
  });

  it("requires report permission at the endpoint boundary", async () => {
    const response = await request(app)
      .get("/api/v1/ai/read-models/business-summary")
      .set(auth(noReportToken));
    expect(response.status).toBe(403);
    expect(response.body.error).toBe("FORBIDDEN");
  });

  it("rejects reversed and overlong periods", async () => {
    const reversed = await request(app)
      .get("/api/v1/ai/read-models/business-summary")
      .query({ from: "2026-07-05", to: "2026-07-04" })
      .set(auth(tenantA.token));
    expect(reversed.status).toBe(400);
    expect(reversed.body.error).toBe("VALIDATION");

    const overlong = await request(app)
      .get("/api/v1/ai/read-models/business-summary")
      .query({ from: "2024-01-01", to: "2026-01-02" })
      .set(auth(tenantA.token));
    expect(overlong.status).toBe(400);
    expect(overlong.body.error).toBe("VALIDATION");
  });

  it("records a data-minimised audit event without summary contents", async () => {
    await request(app)
      .get("/api/v1/ai/read-models/business-summary")
      .query(currentYearPeriod())
      .set(auth(tenantA.token));

    const events = await db.select().from(schema.auditLogs)
      .where(eq(schema.auditLogs.tenantId, tenantA.tenantId));
    const event = events.find((row) => row.action === "ai.read_model.business_summary_generated");
    expect(event).toBeTruthy();
    expect(event?.entityType).toBe("tenant");
    expect(event?.entityId).toBe(tenantA.tenantId);
    expect(JSON.stringify(event?.metadata)).not.toContain("Synthetic Customer");
    expect(JSON.stringify(event?.metadata)).not.toContain("115.00");
  });
});
