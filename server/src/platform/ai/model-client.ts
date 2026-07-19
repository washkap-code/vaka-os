import { AIProviderResponseError, AIProviderUnavailableError } from "./errors.js";
import type { ModelClient } from "./interfaces.js";
import type {
  ModelCompletion, ModelCompletionOptions, ModelMessage,
} from "./types.js";

export interface AnthropicModelConfig {
  apiKey: string;
  model: string;
  endpoint?: string;
}

interface AnthropicResponse {
  model?: unknown;
  content?: unknown;
  usage?: unknown;
}

type FetchLike = typeof fetch;

function configured(env: NodeJS.ProcessEnv): AnthropicModelConfig {
  const provider = env.AI_PROVIDER?.trim().toLowerCase() || "anthropic";
  if (provider !== "anthropic") {
    throw new AIProviderUnavailableError("AI_PROVIDER must be anthropic");
  }
  const apiKey = env.ANTHROPIC_API_KEY?.trim();
  const model = env.ANTHROPIC_MODEL?.trim();
  if (!apiKey || !model) {
    throw new AIProviderUnavailableError(
      "ANTHROPIC_API_KEY and ANTHROPIC_MODEL are required for AI model calls",
    );
  }
  return { apiKey, model };
}

function responseText(content: unknown): string | null {
  if (!Array.isArray(content)) return null;
  const text = content
    .filter((block): block is { type: "text"; text: string } =>
      Boolean(block) && typeof block === "object"
      && (block as { type?: unknown }).type === "text"
      && typeof (block as { text?: unknown }).text === "string")
    .map((block) => block.text)
    .join("\n")
    .trim();
  return text || null;
}

function tokenCount(usage: unknown, key: "input_tokens" | "output_tokens"): number | null {
  if (!usage || typeof usage !== "object") return null;
  const value = (usage as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

export class AnthropicModelClient implements ModelClient {
  readonly model: string;

  constructor(
    private readonly config: () => AnthropicModelConfig,
    private readonly fetcher: FetchLike = fetch,
  ) {
    try {
      this.model = config().model;
    } catch {
      this.model = "unconfigured-anthropic";
    }
  }

  async complete(
    messages: readonly ModelMessage[],
    options: ModelCompletionOptions,
  ): Promise<ModelCompletion> {
    const config = this.config();
    let response: Response;
    try {
      response = await this.fetcher(config.endpoint ?? "https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "anthropic-version": "2023-06-01",
          "x-api-key": config.apiKey,
        },
        body: JSON.stringify({
          model: config.model,
          max_tokens: options.maxTokens,
          temperature: options.temperature ?? 0,
          system: options.system,
          messages,
        }),
      });
    } catch {
      throw new AIProviderUnavailableError("AI model provider could not be reached");
    }
    if (!response.ok) {
      throw new AIProviderUnavailableError(`AI model provider request failed (${response.status})`);
    }
    let body: AnthropicResponse;
    try {
      body = await response.json() as AnthropicResponse;
    } catch {
      throw new AIProviderResponseError();
    }
    const content = responseText(body.content);
    const tokensIn = tokenCount(body.usage, "input_tokens");
    const tokensOut = tokenCount(body.usage, "output_tokens");
    if (!content || typeof body.model !== "string" || tokensIn === null || tokensOut === null) {
      throw new AIProviderResponseError();
    }
    return { content, model: body.model, tokensIn, tokensOut };
  }
}

export function createConfiguredModelClient(
  env: NodeJS.ProcessEnv = process.env,
  fetcher: FetchLike = fetch,
): ModelClient {
  return new AnthropicModelClient(() => configured(env), fetcher);
}
