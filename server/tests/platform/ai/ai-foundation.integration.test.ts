import { and, eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../../../src/app.js";
import { issueAuthenticatedSession } from "../../../src/auth.js";
import { db, schema } from "../../../src/lib.js";
import { MetadataRegistry } from "../../../src/platform/metadata/registry.js";
import {
  createProduct, signupFinanceTenant, type TestTenant,
} from "../../finance/helpers.js";

const app = createApp();
const originalProvider = process.env.AI_PROVIDER;
const originalKey = process.env.ANTHROPIC_API_KEY;
const originalModel = process.env.ANTHROPIC_MODEL;
let tenantA: TestTenant;
let tenantB: TestTenant;
let productA: Awaited<ReturnType<typeof createProduct>>;
let productB: Awaited<ReturnType<typeof createProduct>>;
let restrictedAuth: { Authorization: string };
const providerCalls: Array<{ url: string; body: Record<string, unknown> }> = [];

beforeAll(async () => {
  process.env.AI_PROVIDER = "anthropic";
  process.env.ANTHROPIC_API_KEY = "integration-test-provider-key";
  process.env.ANTHROPIC_MODEL = "integration-test-model";
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    providerCalls.push({
      url: String(input),
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
    });
    return new Response(JSON.stringify({
      model: "integration-test-model-2026",
      content: [{ type: "text", text: "The product timeline contains governed evidence. [E1]" }],
      usage: { input_tokens: 31, output_tokens: 9 },
    }), { status: 200, headers: { "content-type": "application/json" } });
  }));

  await db.insert(schema.aiAgents).values({
    code: "object-summariser",
    name: "Object timeline summariser",
    purpose: "Integration-test governed summary",
    allowedToolsJson: [],
    dataScopesJson: ["Company", "Customer", "Supplier", "Invoice", "Payment", "Product"],
    requiresApprovalForJson: [],
    active: true,
  }).onConflictDoUpdate({
    target: schema.aiAgents.code,
    set: {
      allowedToolsJson: [],
      dataScopesJson: ["Company", "Customer", "Supplier", "Invoice", "Payment", "Product"],
      active: true,
    },
  });
  tenantA = await signupFinanceTenant("ai-foundation-a");
  tenantB = await signupFinanceTenant("ai-foundation-b");
  productA = await createProduct(tenantA, "ai-a", {
    name: "Governed product A",
    description: "Visible product context",
    costPrice: "44.00",
    salePrice: "50.00",
    taxRate: "15.00",
  });
  productB = await createProduct(tenantB, "ai-b", { name: "Tenant B private product" });

  const [role] = await db.insert(schema.roles).values({
    tenantId: tenantA.tenantId,
    name: `AI Restricted ${Date.now()}`,
    permissions: ["crm.read"],
    isSystem: false,
  }).returning();
  const [restricted] = await db.insert(schema.users).values({
    tenantId: tenantA.tenantId,
    email: `ai-restricted-${Date.now()}@test.vaka`,
    passwordHash: "not-used-by-ai-test",
    fullName: "Restricted AI User",
    roleId: role.id,
    status: "active",
  }).returning();
  const session = await issueAuthenticatedSession(restricted.id);
  restrictedAuth = { Authorization: `Bearer ${session.token}` };
});

afterAll(() => {
  if (originalProvider === undefined) delete process.env.AI_PROVIDER;
  else process.env.AI_PROVIDER = originalProvider;
  if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = originalKey;
  if (originalModel === undefined) delete process.env.ANTHROPIC_MODEL;
  else process.env.ANTHROPIC_MODEL = originalModel;
  vi.unstubAllGlobals();
});

describe("POST /api/v1/ai/summarise", () => {
  it("returns a persisted evidence-backed summary using only aiReadable fields", async () => {
    const response = await request(app).post("/api/v1/ai/summarise")
      .set(tenantA.auth)
      .send({ objectType: "Product", objectId: productA.id });

    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.body).toMatchObject({
      summary: "The product timeline contains governed evidence. [E1]",
      conversationId: expect.any(String),
      messageId: expect.any(String),
      evidence: [expect.objectContaining({
        objectType: "Product",
        objectId: productA.id,
      })],
    });
    expect(providerCalls).toHaveLength(1);
    const outbound = JSON.stringify(providerCalls[0].body);
    expect(outbound).toContain("Governed product A");
    expect(outbound).toContain("salePrice");
    expect(outbound).not.toContain("costPrice");
    expect(outbound).not.toContain("taxRate");

    const [audit] = await db.select().from(schema.aiAudit).where(and(
      eq(schema.aiAudit.tenantId, tenantA.tenantId),
      eq(schema.aiAudit.userId, tenantA.userId),
      eq(schema.aiAudit.action, "ai.summarise.completed"),
    ));
    expect(audit).toMatchObject({
      model: "integration-test-model-2026",
      tokensIn: 31,
      tokensOut: 9,
      evidenceCount: response.body.evidence.length,
    });
    expect(audit.promptHash).toMatch(/^[0-9a-f]{64}$/);
    expect(Object.keys(audit)).not.toContain("prompt");

    const readable = new Set(new MetadataRegistry().getFields("Product")
      .filter((field) => field.aiReadable).map((field) => field.name));
    expect(response.body.evidence.every((entry: { fieldNames: string[] }) =>
      entry.fieldNames.every((field) => readable.has(field)))).toBe(true);
  });

  it("rejects a cross-tenant object without invoking the model", async () => {
    const callsBefore = providerCalls.length;
    const response = await request(app).post("/api/v1/ai/summarise")
      .set(tenantA.auth)
      .send({ objectType: "Product", objectId: productB.id });
    expect(response.status).toBe(404);
    expect(providerCalls).toHaveLength(callsBefore);
  });

  it("rejects a user without the object's normal read permission before the model call", async () => {
    const callsBefore = providerCalls.length;
    const response = await request(app).post("/api/v1/ai/summarise")
      .set(restrictedAuth)
      .send({ objectType: "Product", objectId: productA.id });
    expect(response.status).toBe(403);
    expect(providerCalls).toHaveLength(callsBefore);
  });
});
