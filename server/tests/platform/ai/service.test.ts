import { describe, expect, it, vi } from "vitest";
import { IdentityService } from "../../../src/platform/identity/service.js";
import { MetadataRegistry } from "../../../src/platform/metadata/registry.js";
import { ContextAssemblyService } from "../../../src/platform/ai/context.js";
import { AIPermissionDeniedError } from "../../../src/platform/ai/errors.js";
import { AIService } from "../../../src/platform/ai/service.js";
import type {
  AIAuditInput, PersistAISummaryInput,
} from "../../../src/platform/ai/types.js";

const USER = "11111111-1111-4111-8111-111111111111";
const TENANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PRODUCT = "22222222-2222-4222-8222-222222222222";

function requestIdentity(permissions: readonly string[]) {
  return new IdentityService(() => ({
    userId: USER, tenantId: TENANT, sessionId: "session-1",
    isPlatformAdmin: false, permissions,
  }));
}

function agent() {
  return {
    code: "object-summariser",
    name: "Object timeline summariser",
    purpose: "Read-only summary",
    allowedTools: [],
    dataScopes: ["Product"],
    requiresApprovalFor: [],
    active: true,
  };
}

describe("AI summary service", () => {
  it("persists evidence and an audit hash without exposing restricted fields", async () => {
    const metadata = new MetadataRegistry();
    const modelCalls: string[] = [];
    const persisted: PersistAISummaryInput[] = [];
    const failedAudits: AIAuditInput[] = [];
    const service = new AIService(
      new ContextAssemblyService(requestIdentity(["inventory.read"]), metadata, {
        readObject: async () => ({
          sku: "SKU-1", name: "Ledger book", salePrice: "12.00",
          costPrice: "7.00", taxRate: "15.00",
        }),
      }),
      metadata,
      {
        readTimeline: async () => [{
          id: "event-1",
          kind: "audit",
          action: "product.updated",
          occurredAt: new Date("2026-07-18T10:00:00.000Z"),
          details: {
            after: { name: "Ledger book", costPrice: "7.00", taxRate: "15.00" },
          },
        }],
      },
      {
        model: "mock-model",
        complete: async (messages) => {
          modelCalls.push(messages[0].content);
          return { content: "The product was updated on 18 July 2026. [E2]", model: "mock-model", tokensIn: 45, tokensOut: 12 };
        },
      },
      {
        agent: async () => agent(),
        persistSummary: async (input) => {
          persisted.push(input);
          return {
            conversationId: "conversation-1",
            messageId: "message-1",
            evidence: input.evidence.map((entry, index) => ({
              ...entry, id: `evidence-${index + 1}`, messageId: "message-1",
            })),
          };
        },
        recordAudit: async (input) => { failedAudits.push(input); },
      },
    );

    const result = await service.summarise(USER, TENANT, {
      objectType: "Product", objectId: PRODUCT,
    });

    expect(result.summary).toContain("[E2]");
    expect(result.evidence).toHaveLength(2);
    expect(persisted).toHaveLength(1);
    expect(persisted[0]).toMatchObject({
      tenantId: TENANT,
      userId: USER,
    });
    expect(persisted[0].userMessage).toBe(`Summarise timeline for Product:${PRODUCT}`);
    expect(modelCalls.join("\n")).not.toContain("costPrice");
    expect(modelCalls.join("\n")).not.toContain("taxRate");
    expect(persisted[0].evidence[1].fieldNames).toEqual(["name"]);
    expect(failedAudits).toEqual([expect.objectContaining({
      action: "ai.summarise.completed",
      promptHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      evidenceCount: 2,
    })]);
  });

  it("never calls the model when the requesting user lacks object permission", async () => {
    const metadata = new MetadataRegistry();
    const complete = vi.fn();
    const service = new AIService(
      new ContextAssemblyService(requestIdentity(["crm.read"]), metadata, {
        readObject: vi.fn(),
      }),
      metadata,
      { readTimeline: vi.fn() },
      { model: "mock-model", complete },
      {
        agent: async () => agent(),
        persistSummary: vi.fn(),
        recordAudit: vi.fn(),
      },
    );
    await expect(service.summarise(USER, TENANT, {
      objectType: "Product", objectId: PRODUCT,
    })).rejects.toThrow(AIPermissionDeniedError);
    expect(complete).not.toHaveBeenCalled();
  });

  it("records failed model calls by prompt hash without storing the prompt", async () => {
    const metadata = new MetadataRegistry();
    const audits: AIAuditInput[] = [];
    const service = new AIService(
      new ContextAssemblyService(requestIdentity(["inventory.read"]), metadata, {
        readObject: async () => ({ sku: "SKU-2", name: "Failed model product" }),
      }),
      metadata,
      { readTimeline: async () => [] },
      {
        model: "mock-model",
        complete: async () => { throw new Error("provider failed"); },
      },
      {
        agent: async () => agent(),
        persistSummary: vi.fn(),
        recordAudit: async (input) => { audits.push(input); },
      },
    );
    await expect(service.summarise(USER, TENANT, {
      objectType: "Product", objectId: PRODUCT,
    })).rejects.toThrow("provider failed");
    expect(audits).toEqual([expect.objectContaining({
      action: "ai.summarise.failed",
      promptHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      tokensIn: 0,
      tokensOut: 0,
    })]);
    expect(Object.keys(audits[0])).not.toContain("prompt");
  });
});
