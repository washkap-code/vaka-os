import { describe, expect, it, vi } from "vitest";
import {
  AnthropicModelClient, createConfiguredModelClient,
} from "../../../src/platform/ai/model-client.js";
import { AIProviderUnavailableError } from "../../../src/platform/ai/errors.js";

describe("AI model gateway", () => {
  it("routes one governed request through the Anthropic HTTP interface", async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({
        "anthropic-version": "2023-06-01",
        "x-api-key": "test-secret-never-logged",
      });
      expect(JSON.parse(String(init?.body))).toMatchObject({
        model: "test-model",
        max_tokens: 200,
        temperature: 0,
        messages: [{ role: "user", content: "Evidence only" }],
      });
      return new Response(JSON.stringify({
        model: "test-model-2026",
        content: [{ type: "text", text: "Evidence-backed response." }],
        usage: { input_tokens: 20, output_tokens: 5 },
      }), { status: 200, headers: { "content-type": "application/json" } });
    });
    const client = new AnthropicModelClient(() => ({
      apiKey: "test-secret-never-logged",
      model: "test-model",
      endpoint: "https://model.test/v1/messages",
    }), fetcher as typeof fetch);
    await expect(client.complete([{ role: "user", content: "Evidence only" }], {
      system: "Use evidence.", maxTokens: 200, temperature: 0,
    })).resolves.toEqual({
      content: "Evidence-backed response.",
      model: "test-model-2026",
      tokensIn: 20,
      tokensOut: 5,
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("fails closed without provider secrets and makes no network call", async () => {
    const fetcher = vi.fn();
    const client = createConfiguredModelClient({
      NODE_ENV: "test",
      AI_PROVIDER: "anthropic",
    }, fetcher as typeof fetch);
    await expect(client.complete([{ role: "user", content: "No call" }], {
      maxTokens: 10,
    })).rejects.toThrow(AIProviderUnavailableError);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
