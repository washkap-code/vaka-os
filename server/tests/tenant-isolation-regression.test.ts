import { readFile } from "node:fs/promises";
import jwt from "jsonwebtoken";
import request, { type Response, type Test } from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { createApp } from "../src/app.js";
import { jwtSecret } from "../src/config.js";
import { db, pool, schema } from "../src/lib.js";
import { endpointCoverageManifest, type EndpointCoverage } from "./tenant-isolation-endpoint-manifest.js";

const app = createApp();
const runId = `lp002${Date.now().toString(36)}`;
const PDF_DATA_URL = `data:application/pdf;base64,${Buffer.from(
  "%PDF-1.4\n1 0 obj <<>> endobj\ntrailer <<>>\n%%EOF\n",
  "ascii",
).toString("base64")}`;

type TenantFixture = {
  marker: string;
  tenantId: string;
  userId: string;
  token: string;
  sessionId: string;
  stepUpProof: string;
  auth: { Authorization: string };
  customerId: string;
  supplierId: string;
  productId: string;
  warehouseId: string;
  invoiceId: string;
  invoiceShareLinkId: string;
  paymentId: string;
  journalIds: string[];
  folderId: string;
  documentId: string;
  taskId: string;
  dealId: string;
  bankAccountId: string;
  captureId: string;
  migrationProjectId: string;
  networkProfileId: string;
};

const responseBody = (response: Response): unknown => response.body as unknown;

function asRecord(value: unknown): Record<string, unknown> {
  expect(value).toBeTruthy();
  expect(typeof value).toBe("object");
  expect(Array.isArray(value)).toBe(false);
  return value as Record<string, unknown>;
}

function idFrom(response: Response): string {
  expect(response.status, JSON.stringify(responseBody(response))).toBe(200);
  const id = asRecord(responseBody(response)).id;
  expect(typeof id).toBe("string");
  return id as string;
}

function sessionIdFrom(token: string): string {
  const decoded = jwt.decode(token);
  expect(decoded).toBeTruthy();
  expect(typeof decoded).not.toBe("string");
  const sid = (decoded as jwt.JwtPayload).sid;
  expect(typeof sid).toBe("string");
  return sid as string;
}

async function apiCall(
  endpoint: Pick<EndpointCoverage, "method" | "path">,
  options: { headers?: Record<string, string>; body?: string | object } = {},
): Promise<Response> {
  let call: Test;
  switch (endpoint.method) {
    case "GET": call = request(app).get(endpoint.path); break;
    case "POST": call = request(app).post(endpoint.path); break;
    case "PUT": call = request(app).put(endpoint.path); break;
    case "PATCH": call = request(app).patch(endpoint.path); break;
    case "DELETE": call = request(app).delete(endpoint.path); break;
  }
  if (options.headers) call = call.set(options.headers);
  if (options.body !== undefined) call = call.send(options.body);
  return call;
}

function concretePath(path: string, fixture?: TenantFixture): string {
  const genericId = fixture?.tenantId ?? "00000000-0000-4000-8000-000000000001";
  return path.replace(/:([A-Za-z][A-Za-z0-9]*)/g, (_match, name: string) => {
    if (name === "tenantId") return fixture?.tenantId ?? genericId;
    if (name === "subdomain") return "nonexistent-workspace";
    if (name === "entity") return "contacts";
    if (name === "kind") return "contacts";
    if (name === "key") return "documents.workspace";
    if (name === "status") return "active";
    if (name === "subjectType") return "purchase_order";
    if (name === "token") return "invalid-capability-token";
    return genericId;
  });
}

function assertNoPrivateTenantData(value: unknown, other: TenantFixture) {
  const serialised = JSON.stringify(value);
  expect(serialised).not.toContain(other.tenantId);
  expect(serialised).not.toContain(other.customerId);
  expect(serialised).not.toContain(other.supplierId);
  expect(serialised).not.toContain(other.productId);
  expect(serialised).not.toContain(other.invoiceId);
  expect(serialised).not.toContain(other.documentId);
  expect(serialised).not.toContain(`${other.marker}-private`);
}

function assertGenericDenial(response: Response, other: TenantFixture) {
  expect([403, 404], JSON.stringify(responseBody(response))).toContain(response.status);
  assertNoPrivateTenantData(responseBody(response), other);
}

async function enableLaunchFeatures(tenantId: string) {
  await db.insert(schema.tenantFeatureFlags).values([
    { tenantId, featureKey: "workflow.centre", enabled: true, note: "LP-002 fixture" },
    { tenantId, featureKey: "documents.workspace", enabled: true, note: "LP-002 fixture" },
    { tenantId, featureKey: "blackbook.directory", enabled: true, note: "LP-002 fixture" },
    { tenantId, featureKey: "network.directory", enabled: true, note: "LP-002 fixture" },
    { tenantId, featureKey: "migration.hub", enabled: true, note: "LP-002 fixture" },
  ]);
}

async function seedTenant(label: "a" | "b", invoiceNet: string, paymentAmount: string): Promise<TenantFixture> {
  const marker = `${runId}-${label}`;
  const signup = await request(app).post("/api/v1/auth/signup").send({
    companyName: `${marker}-private-company`,
    subdomain: `${runId}${label}`.slice(0, 31),
    baseCurrency: "USD",
    ownerEmail: `${marker}-private-owner@test.vaka`,
    ownerPassword: "Tenant-Isolation-123!",
    ownerName: `${marker}-private-owner`,
    planName: "Growth",
  });
  expect(signup.status, JSON.stringify(responseBody(signup))).toBe(200);
  const signupBody = asRecord(responseBody(signup));
  const tenant = asRecord(signupBody.tenant);
  const user = asRecord(signupBody.user);
  const tenantId = tenant.id as string;
  const userId = user.id as string;
  const token = signupBody.token as string;
  const auth = { Authorization: `Bearer ${token}` };
  await enableLaunchFeatures(tenantId);

  const customer = await request(app).post("/api/v1/contacts").set(auth).send({
    name: `${marker}-private-customer`, email: `${marker}-customer@test.vaka`,
  });
  const customerId = idFrom(customer);
  const supplier = await request(app).post("/api/v1/suppliers").set(auth).send({
    name: `${marker}-private-supplier`, supplierCode: `${label.toUpperCase()}-SUP-${runId.slice(-6)}`,
  });
  const supplierId = idFrom(supplier);

  const warehouses = await request(app).get("/api/v1/warehouses").set(auth);
  expect(warehouses.status).toBe(200);
  const warehouseId = asRecord((responseBody(warehouses) as unknown[])[0]).id as string;
  const product = await request(app).post("/api/v1/products").set(auth).send({
    sku: `${label.toUpperCase()}-${runId}`,
    name: `${marker}-private-product`,
    costPrice: "20.00",
    salePrice: invoiceNet,
    trackStock: false,
    taxTreatment: "standard",
  });
  const productId = idFrom(product);

  const deal = await request(app).post("/api/v1/deals").set(auth).send({
    contactId: customerId, title: `${marker}-private-deal`, valueAmount: invoiceNet, valueCurrency: "USD",
  });
  const dealId = idFrom(deal);

  const draft = await request(app).post("/api/v1/invoices").set(auth).send({
    contactId: customerId,
    dealId,
    currency: "USD",
    lines: [{ description: `${marker}-private-service`, quantity: "1", unitPrice: invoiceNet, taxTreatment: "standard" }],
  });
  const invoiceId = idFrom(draft);
  const issued = await request(app).post(`/api/v1/invoices/${invoiceId}/issue`).set(auth).send({});
  expect(issued.status, JSON.stringify(responseBody(issued))).toBe(200);
  const paid = await request(app).post(`/api/v1/invoices/${invoiceId}/payments`).set(auth)
    .set("Idempotency-Key", `${marker}-payment`).send({ amount: paymentAmount, reference: `${marker}-private-payment` });
  expect(paid.status, JSON.stringify(responseBody(paid))).toBe(200);
  const [payment] = await db.select().from(schema.payments).where(and(
    eq(schema.payments.tenantId, tenantId), eq(schema.payments.invoiceId, invoiceId),
  ));
  expect(payment).toBeTruthy();
  const shareLink = await request(app).post(`/api/v1/invoices/${invoiceId}/share-links`).set(auth).send({
    expiresInDays: 7,
  });
  const invoiceShareLinkId = idFrom(shareLink);
  const journals = await db.select().from(schema.journalEntries).where(eq(schema.journalEntries.tenantId, tenantId));
  expect(journals.length).toBeGreaterThanOrEqual(2);

  const folder = await request(app).post("/api/v1/documents/folders").set(auth)
    .send({ name: `${marker}-private-folder` });
  const folderId = idFrom(folder);
  const document = await request(app).post("/api/v1/documents").set(auth).send({
    title: `${marker}-private-document`, classification: "CONTRACT", folderId,
    fileName: `${marker}.pdf`, dataUrl: PDF_DATA_URL,
  });
  const documentId = idFrom(document);

  const task = await request(app).post("/api/v1/tasks").set(auth).send({
    title: `${marker}-private-task`, detail: `${marker}-private-task-detail`, assignedTo: userId,
  });
  const taskId = idFrom(task);
  const bankAccount = await request(app).post("/api/v1/bank-accounts").set(auth).send({
    name: `${marker}-private-bank`, bankName: "Test Bank", accountNumber: "****1234", currency: "USD",
  });
  const bankAccountId = idFrom(bankAccount);
  const capture = await request(app).post("/api/v1/captures").set(auth).send({
    documentType: "OTHER", fileName: `${marker}.pdf`, dataUrl: PDF_DATA_URL,
  });
  const captureId = idFrom(capture);
  const migrationProject = await request(app).post("/api/v1/migration/projects").set(auth).send({
    name: `${marker}-private-migration`, sourceSystem: `${marker}-private-source`,
  });
  const migrationProjectId = idFrom(migrationProject);

  const profile = await request(app).put("/api/v1/network/profile").set(auth).send({
    displayName: `${marker}-published-name`,
    description: `${marker}-published-description`,
    categories: ["professional-services"],
    city: "Harare",
    countryCode: "ZW",
    contactEmail: `${marker}-private-network@test.vaka`,
    showContact: false,
    acceptEnquiries: true,
  });
  const networkProfileId = idFrom(profile);
  const published = await request(app).post("/api/v1/network/profile/publish").set(auth).send({});
  expect(published.status, JSON.stringify(responseBody(published))).toBe(200);
  const unpublishedEdit = await request(app).put("/api/v1/network/profile").set(auth).send({
    displayName: `${marker}-published-name`,
    description: `${marker}-private-draft-description`,
    categories: ["professional-services"],
    city: "Harare",
    countryCode: "ZW",
    contactEmail: `${marker}-private-network@test.vaka`,
    showContact: false,
    acceptEnquiries: true,
  });
  expect(unpublishedEdit.status, JSON.stringify(responseBody(unpublishedEdit))).toBe(200);
  const steppedUp = await request(app).post("/api/v1/auth/step-up").set(auth).send({
    currentPassword: "Tenant-Isolation-123!",
  });
  expect(steppedUp.status, JSON.stringify(responseBody(steppedUp))).toBe(200);
  const stepUpProof = asRecord(responseBody(steppedUp)).proof as string;

  return {
    marker, tenantId, userId, token, sessionId: sessionIdFrom(token), stepUpProof, auth,
    customerId, supplierId, productId, warehouseId, invoiceId, invoiceShareLinkId,
    paymentId: payment.id, journalIds: journals.map((entry) => entry.id),
    folderId, documentId, taskId, dealId, bankAccountId, captureId,
    migrationProjectId, networkProfileId,
  };
}

let tenantA: TenantFixture;
let tenantB: TenantFixture;

beforeAll(async () => {
  tenantA = await seedTenant("a", "100.00", "25.00");
  tenantB = await seedTenant("b", "400.00", "50.00");
}, 90_000);

describe("endpoint inventory contract", () => {
  it("enumerates every Express endpoint and requires an isolation vector", async () => {
    const [appSource, source, migrationSource] = await Promise.all([
      readFile(new URL("../src/app.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/routes.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/modules/migration/routes.ts", import.meta.url), "utf8"),
    ]);
    const appRegistration = /\bapp\.(get|post|put|patch|delete)\(\s*[`"]([^`"]+)[`"]\s*,/g;
    const registration = /\bapi\.(get|post|put|patch|delete)\(\s*[`"]([^`"]+)[`"]\s*,/g;
    const discovered: string[] = [];
    for (const match of appSource.matchAll(appRegistration)) {
      discovered.push(`${match[1].toUpperCase()} ${match[2]}`);
    }
    for (const match of source.matchAll(registration)) {
      discovered.push(`${match[1].toUpperCase()} /api/v1${match[2]}`);
    }
    const migrationRegistration = /\bmigrationRouter\.(get|post|put|patch|delete)\(\s*[`"]([^`"]+)[`"]\s*,/g;
    for (const match of migrationSource.matchAll(migrationRegistration)) {
      discovered.push(`${match[1].toUpperCase()} /api/v1/migration${match[2]}`);
    }
    const manifested = endpointCoverageManifest.map(({ method, path }) => `${method} ${path}`);
    expect([...new Set(manifested)].sort()).toEqual([...new Set(discovered)].sort());
    expect(manifested).toHaveLength(discovered.length);
    expect(endpointCoverageManifest.every((endpoint) => Boolean(endpoint.vector))).toBe(true);
  });

  it("documents every public and cross-tenant shared exception", () => {
    const exceptions = endpointCoverageManifest.filter(({ access }) =>
      access === "public" || access === "shared-authenticated");
    expect(exceptions).toHaveLength(22);
    expect(exceptions.every(({ justification }) => Boolean(justification))).toBe(true);
  });

  it("rejects unauthenticated access at every non-public endpoint", async () => {
    const protectedEndpoints = endpointCoverageManifest.filter(({ access }) => access !== "public");
    for (const endpoint of protectedEndpoints) {
      const response = await apiCall({ ...endpoint, path: concretePath(endpoint.path) });
      expect(response.status, `${endpoint.method} ${endpoint.path}`).toBe(401);
    }
  }, 60_000);

  it("denies a tenant user at every platform endpoint before route processing", async () => {
    const platformEndpoints = endpointCoverageManifest.filter(({ access }) => access === "platform");
    for (const endpoint of platformEndpoints) {
      const response = await apiCall(
        { ...endpoint, path: concretePath(endpoint.path, tenantB) },
        { headers: tenantA.auth, body: {} },
      );
      expect(response.status, `${endpoint.method} ${endpoint.path}`).toBe(403);
      assertNoPrivateTenantData(responseBody(response), tenantB);
    }
  }, 30_000);
});

describe("tenant context tampering", () => {
  it("rejects absent and forged tenant claims even with a valid signature", async () => {
    const absent = jwt.sign({ sub: tenantA.userId }, jwtSecret(), { expiresIn: "5m" });
    const forged = jwt.sign({ sub: tenantA.userId, tenantId: tenantB.tenantId }, jwtSecret(), { expiresIn: "5m" });
    for (const token of [absent, forged]) {
      const response = await request(app).get("/api/v1/me").set({ Authorization: `Bearer ${token}` });
      expect(response.status).toBe(401);
      assertNoPrivateTenantData(responseBody(response), tenantB);
    }
  });

  it("rejects tenant override attempts in headers, query strings, bodies and platform params", async () => {
    const header = await request(app).get("/api/v1/contacts").set({
      ...tenantA.auth, "X-Tenant-Id": tenantB.tenantId,
    });
    expect(header.status).toBe(403);
    const query = await request(app).get("/api/v1/contacts").query({ tenantId: tenantB.tenantId }).set(tenantA.auth);
    expect(query.status).toBe(400);
    const body = await request(app).post("/api/v1/contacts").set(tenantA.auth).send({
      name: "tampered", tenantId: tenantB.tenantId,
    });
    expect(body.status).toBe(400);
    const param = await request(app).get(`/api/v1/platform/audit/${tenantB.tenantId}`).set(tenantA.auth);
    expect(param.status).toBe(403);
    for (const response of [header, query, body, param]) assertNoPrivateTenantData(responseBody(response), tenantB);
  });

  it("never inherits permissions from a role owned by another tenant", async () => {
    const [tenantARole] = await db.select({ id: schema.roles.id }).from(schema.roles).where(and(
      eq(schema.roles.tenantId, tenantA.tenantId), eq(schema.roles.name, "Owner"),
    ));
    const [tenantBRole] = await db.select({ id: schema.roles.id }).from(schema.roles).where(and(
      eq(schema.roles.tenantId, tenantB.tenantId), eq(schema.roles.name, "Owner"),
    ));
    expect(tenantARole).toBeTruthy();
    expect(tenantBRole).toBeTruthy();
    await db.update(schema.users).set({ roleId: tenantBRole.id }).where(eq(schema.users.id, tenantA.userId));
    try {
      const response = await request(app).get("/api/v1/contacts").set(tenantA.auth);
      expect(response.status).toBe(403);
      assertNoPrivateTenantData(responseBody(response), tenantB);
    } finally {
      await db.update(schema.users).set({ roleId: tenantARole.id }).where(eq(schema.users.id, tenantA.userId));
    }
  });
});

describe("tenant lists, search, filters and shared projections", () => {
  it("keeps tenant collections and search results scoped to Tenant A", async () => {
    const listPaths = [
      "/api/v1/contacts", "/api/v1/invoice-customers", "/api/v1/suppliers", "/api/v1/deals",
      "/api/v1/products", "/api/v1/warehouses", "/api/v1/settings/warehouses", "/api/v1/stock/movements",
      "/api/v1/purchase-requisitions", "/api/v1/request-for-quotes", "/api/v1/purchase-orders",
      "/api/v1/goods-receipts", "/api/v1/supplier-bills", "/api/v1/accounts", "/api/v1/exchange-rates",
      "/api/v1/invoices", "/api/v1/expenses", "/api/v1/accounting/periods", "/api/v1/tasks?status=ALL",
      "/api/v1/documents/folders", "/api/v1/documents?status=ACTIVE",
      "/api/v1/documents/approvals/list", "/api/v1/network/profile", "/api/v1/network/enquiries",
      "/api/v1/migration/projects", "/api/v1/migration/jobs", "/api/v1/payroll/employees", "/api/v1/payroll/runs",
      "/api/v1/journal", "/api/v1/reports/snapshots?limit=1", "/api/v1/billing/invoices",
      "/api/v1/billing/payment-attempts",
    ];
    for (const path of listPaths) {
      const response = await request(app).get(path).set(tenantA.auth);
      expect(response.status, `${path}: ${JSON.stringify(responseBody(response))}`).toBe(200);
      assertNoPrivateTenantData(responseBody(response), tenantB);
    }

    const search = await request(app).get("/api/v1/search")
      .query({ q: `${tenantB.marker}-private`, limit: 1 }).set(tenantA.auth);
    expect(search.status).toBe(200);
    expect(asRecord(responseBody(search)).results).toEqual([]);
    const archived = await request(app).get("/api/v1/documents").query({ status: "ARCHIVED" }).set(tenantA.auth);
    expect(archived.status).toBe(200);
    assertNoPrivateTenantData(responseBody(archived), tenantB);
    const closedTasks = await request(app).get("/api/v1/tasks").query({ status: "DONE" }).set(tenantA.auth);
    expect(closedTasks.status).toBe(200);
    assertNoPrivateTenantData(responseBody(closedTasks), tenantB);
  }, 30_000);

  it("exposes only the documented shared projections", async () => {
    const directory = await request(app).get("/api/v1/network/directory")
      .query({ q: `${tenantB.marker}-published-name` }).set(tenantA.auth);
    expect(directory.status).toBe(200);
    const directoryText = JSON.stringify(responseBody(directory));
    expect(directoryText).toContain(`${tenantB.marker}-published-name`);
    expect(directoryText).not.toContain(tenantB.tenantId);
    expect(directoryText).not.toContain(`${tenantB.marker}-private-network@test.vaka`);
    expect(directoryText).not.toContain(`${tenantB.marker}-private-draft-description`);

    const detail = await request(app).get(`/api/v1/network/directory/${tenantB.networkProfileId}`).set(tenantA.auth);
    expect(detail.status).toBe(200);
    const detailText = JSON.stringify(responseBody(detail));
    expect(detailText).not.toContain(tenantB.tenantId);
    expect(detailText).not.toContain(`${tenantB.marker}-private-network@test.vaka`);
    const enquiry = await request(app).post(`/api/v1/network/directory/${tenantB.networkProfileId}/enquire`)
      .set(tenantA.auth).send({ message: "Please contact our procurement team.", replyEmail: "buyer-a@test.vaka" });
    expect(enquiry.status).toBe(200);
    expect(JSON.stringify(responseBody(enquiry))).not.toContain(tenantB.tenantId);

    for (const path of ["/api/v1/blackbook/entries?limit=1", "/api/v1/billing/payment-provider", "/api/v1/billing/plans"]) {
      const response = await request(app).get(path).set(tenantA.auth);
      expect(response.status, `${path}: ${JSON.stringify(responseBody(response))}`).toBe(200);
      expect(JSON.stringify(responseBody(response))).not.toContain(tenantB.tenantId);
    }
  });
});

describe("direct object references and foreign keys", () => {
  it("returns generic denials for Tenant B object IDs across modules and methods", async () => {
    const probes: Array<{ method: EndpointCoverage["method"]; path: string; body?: string | object }> = [
      { method: "GET", path: `/api/v1/contacts/${tenantB.customerId}` },
      { method: "PATCH", path: `/api/v1/contacts/${tenantB.customerId}`, body: { name: "intrusion" } },
      { method: "GET", path: `/api/v1/contacts/${tenantB.customerId}/timeline` },
      { method: "GET", path: `/api/v1/contacts/${tenantB.customerId}/communication-preferences/email` },
      { method: "POST", path: `/api/v1/contacts/${tenantB.customerId}/communication-preferences/email`, body: {
        status: "OPTED_OUT", locale: "en-ZW", evidenceSource: "CUSTOMER_REQUEST",
      } },
      { method: "POST", path: `/api/v1/contacts/${tenantB.customerId}/statements/send`, body: {
        confirm: true, asAt: "2026-07-16",
      } },
      { method: "GET", path: `/api/v1/suppliers/${tenantB.supplierId}` },
      { method: "PATCH", path: `/api/v1/suppliers/${tenantB.supplierId}`, body: { supplierLeadTimeDays: 2 } },
      { method: "PATCH", path: `/api/v1/deals/${tenantB.dealId}/stage`, body: { stage: "WON" } },
      { method: "PATCH", path: `/api/v1/products/${tenantB.productId}/reorder-rule`, body: { reorderLevel: 5 } },
      { method: "GET", path: `/api/v1/bank-accounts/${tenantB.bankAccountId}/reconciliation-summary` },
      { method: "GET", path: `/api/v1/bank-accounts/${tenantB.bankAccountId}/reconciliation-worksheet?statementDate=2026-07-16&statementClosingBalance=0.00` },
      { method: "GET", path: `/api/v1/bank-accounts/${tenantB.bankAccountId}/reconciliations` },
      { method: "GET", path: `/api/v1/invoices/${tenantB.invoiceId}` },
      { method: "GET", path: `/api/v1/invoices/${tenantB.invoiceId}/pdf` },
      { method: "POST", path: `/api/v1/invoices/${tenantB.invoiceId}/send`, body: { confirm: true } },
      { method: "POST", path: `/api/v1/invoices/${tenantB.invoiceId}/payment-reminders/send`, body: { confirm: true } },
      { method: "GET", path: `/api/v1/invoices/${tenantB.invoiceId}/share-links` },
      { method: "POST", path: `/api/v1/invoices/${tenantB.invoiceId}/share-links`, body: {} },
      { method: "DELETE", path: `/api/v1/invoices/${tenantB.invoiceId}/share-links/${tenantB.invoiceShareLinkId}` },
      { method: "PATCH", path: `/api/v1/invoices/${tenantB.invoiceId}`, body: {
        contactId: tenantA.customerId, currency: "USD",
        lines: [{ description: "intrusion", quantity: "1", unitPrice: "1", taxTreatment: "standard" }],
      } },
      { method: "POST", path: `/api/v1/invoices/${tenantB.invoiceId}/issue`, body: {} },
      { method: "POST", path: `/api/v1/invoices/${tenantB.invoiceId}/payments`, body: { amount: "1.00" } },
      { method: "POST", path: `/api/v1/invoices/${tenantB.invoiceId}/void`, body: { reason: "unauthorised attempt" } },
      { method: "GET", path: `/api/v1/documents/${tenantB.documentId}` },
      { method: "GET", path: `/api/v1/documents/${tenantB.documentId}/content` },
      { method: "POST", path: `/api/v1/documents/${tenantB.documentId}/versions`, body: { fileName: "x.pdf", dataUrl: PDF_DATA_URL } },
      { method: "POST", path: `/api/v1/documents/${tenantB.documentId}/archive`, body: {} },
      { method: "POST", path: `/api/v1/documents/${tenantB.documentId}/restore`, body: {} },
      { method: "POST", path: `/api/v1/documents/${tenantB.documentId}/approvals`, body: { note: "intrusion" } },
      { method: "PUT", path: `/api/v1/documents/${tenantB.documentId}/retention`, body: { retentionUntil: null } },
      { method: "POST", path: `/api/v1/tasks/${tenantB.taskId}/close`, body: { outcome: "DONE" } },
      { method: "GET", path: `/api/v1/captures/${tenantB.captureId}` },
      { method: "POST", path: `/api/v1/captures/${tenantB.captureId}/review`, body: { status: "REJECTED" } },
      { method: "GET", path: `/api/v1/migration/projects/${tenantB.migrationProjectId}` },
      { method: "GET", path: `/api/v1/migration/projects/${tenantB.migrationProjectId}/reconciliation` },
      { method: "POST", path: `/api/v1/migration/projects/${tenantB.migrationProjectId}/close`, body: {} },
      { method: "POST", path: `/api/v1/security/my-sessions/${tenantB.sessionId}/revoke`, body: {} },
      { method: "POST", path: `/api/v1/security/sessions/${tenantB.sessionId}/revoke`, body: {} },
      { method: "POST", path: `/api/v1/security/users/${tenantB.userId}/disabled`, body: {} },
    ];
    for (const [index, probe] of probes.entries()) {
      const response = await apiCall(probe, {
        headers: {
          ...tenantA.auth,
          "Idempotency-Key": `lp002-cross-tenant-${index}`,
          "X-Vaka-Step-Up": tenantA.stepUpProof,
        },
        body: probe.body,
      });
      assertGenericDenial(response, tenantB);
    }
  }, 45_000);

  it("rejects Tenant B foreign keys before creating Tenant A records", async () => {
    const beforeDeals = await db.select().from(schema.deals).where(eq(schema.deals.tenantId, tenantA.tenantId));
    const attempts: Array<Promise<Response>> = [
      request(app).post("/api/v1/deals").set(tenantA.auth).send({
        contactId: tenantB.customerId, title: "cross tenant deal", valueAmount: "1", valueCurrency: "USD",
      }),
      request(app).post("/api/v1/activities").set(tenantA.auth).send({
        contactId: tenantB.customerId, type: "note", body: "cross tenant activity",
      }),
      request(app).post("/api/v1/invoices").set(tenantA.auth).send({
        contactId: tenantB.customerId, currency: "USD",
        lines: [{ description: "cross tenant", quantity: "1", unitPrice: "1", taxTreatment: "standard" }],
      }),
      request(app).post("/api/v1/products").set(tenantA.auth).send({
        sku: `CROSS-${runId}`, name: "cross tenant opening", costPrice: "1", salePrice: "2",
        openingStock: { warehouseId: tenantB.warehouseId, quantity: "1", unitCost: "1" },
      }),
      request(app).post("/api/v1/stock/opening").set(tenantA.auth).send({
        productId: tenantB.productId, warehouseId: tenantB.warehouseId, quantity: "1", unitCost: "1",
      }),
      request(app).post("/api/v1/tasks").set(tenantA.auth).send({
        title: "cross tenant assignee", assignedTo: tenantB.userId,
      }),
      request(app).post("/api/v1/documents/folders").set(tenantA.auth).send({
        name: "cross tenant folder", parentId: tenantB.folderId,
      }),
    ];
    const responses = await Promise.all(attempts);
    for (const response of responses) {
      expect([400, 404], JSON.stringify(responseBody(response))).toContain(response.status);
      assertNoPrivateTenantData(responseBody(response), tenantB);
    }
    const afterDeals = await db.select().from(schema.deals).where(eq(schema.deals.tenantId, tenantA.tenantId));
    expect(afterDeals).toHaveLength(beforeDeals.length);
    expect(afterDeals.some(({ contactId }) => contactId === tenantB.customerId)).toBe(false);
  });
});

describe("tenant-only aggregates and persistence", () => {
  it("computes financial aggregates from Tenant A only", async () => {
    const trialBalance = await request(app).get("/api/v1/reports/trial-balance").set(tenantA.auth);
    expect(trialBalance.status).toBe(200);
    const rows = responseBody(trialBalance) as Array<Record<string, unknown>>;
    const balance = (code: string) => rows.find((row) => row.code === code)?.balance;
    expect(balance("1000")).toBe("25.00");
    expect(balance("1100")).toBe("90.00");
    expect(balance("2100")).toBe("-15.00");
    expect(balance("4000")).toBe("-100.00");

    const profitLoss = await request(app).get("/api/v1/reports/profit-loss").set(tenantA.auth);
    expect(profitLoss.status).toBe(200);
    expect(asRecord(responseBody(profitLoss)).totalIncome).toBe("100.00");
    const dashboard = await request(app).get("/api/v1/reports/dashboard").set(tenantA.auth);
    expect(dashboard.status).toBe(200);
    const receivables = asRecord(asRecord(responseBody(dashboard)).receivables);
    const currencies = receivables.currencies as Array<Record<string, unknown>>;
    expect(currencies.find(({ currency }) => currency === "USD")?.outstanding).toBe("90.00");
    assertNoPrivateTenantData(responseBody(dashboard), tenantB);
  });

  it("finds no orphaned or cross-tenant foreign-key relationships in tenant tables", async () => {
    const tenantTables = await pool.query<{ table_name: string }>(`
      SELECT table_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name = 'tenant_id'
      ORDER BY table_name
    `);
    expect(tenantTables.rows.length).toBeGreaterThan(30);
    const tenantTableNames = new Set(tenantTables.rows.map(({ table_name }) => table_name));
    for (const { table_name: table } of tenantTables.rows) {
      expect(table).toMatch(/^[a-z0-9_]+$/);
      const orphaned = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM "${table}" child LEFT JOIN tenants owner ON owner.id = child.tenant_id WHERE child.tenant_id IS NOT NULL AND owner.id IS NULL`,
      );
      expect(orphaned.rows[0].count, `${table} contains an unknown tenant_id`).toBe("0");
    }

    // Column pairs are zipped positionally from pg_constraint's conkey/confkey
    // arrays. The information_schema equivalent cross-joins the child and
    // parent column lists, which fabricates mismatched pairs (and type errors)
    // for composite foreign keys such as PV-002's tenant-consistent FKs.
    const foreignKeys = await pool.query<{
      child_table: string; child_column: string; parent_table: string; parent_column: string;
    }>(`
      SELECT con.conrelid::regclass::text AS child_table,
             child_att.attname AS child_column,
             con.confrelid::regclass::text AS parent_table,
             parent_att.attname AS parent_column
      FROM pg_constraint con
      JOIN LATERAL unnest(con.conkey, con.confkey) AS cols(child_num, parent_num) ON true
      JOIN pg_attribute child_att
        ON child_att.attrelid = con.conrelid AND child_att.attnum = cols.child_num
      JOIN pg_attribute parent_att
        ON parent_att.attrelid = con.confrelid AND parent_att.attnum = cols.parent_num
      WHERE con.contype = 'f' AND con.connamespace = 'public'::regnamespace
    `);
    for (const key of foreignKeys.rows.filter(({ child_table, parent_table }) =>
      tenantTableNames.has(child_table) && tenantTableNames.has(parent_table))) {
      for (const identifier of Object.values(key)) expect(identifier).toMatch(/^[a-z0-9_]+$/);
      const ownershipColumn = key.child_table === "directory_enquiries"
        && key.child_column === "from_user_id"
        && key.parent_table === "users"
        ? "from_tenant_id"
        : "tenant_id";
      const mismatches = await pool.query<{ count: string }>(`
        SELECT COUNT(*)::text AS count
        FROM "${key.child_table}" child
        JOIN "${key.parent_table}" parent ON child."${key.child_column}" = parent."${key.parent_column}"
        WHERE child."${ownershipColumn}" <> parent.tenant_id
      `);
      expect(mismatches.rows[0].count,
        `${key.child_table}.${key.child_column} crosses tenant ownership into ${key.parent_table}`).toBe("0");
    }
  });
});
