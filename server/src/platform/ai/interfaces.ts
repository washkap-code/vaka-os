import type { IdentityServiceContract } from "../identity/interfaces.js";
import type {
  AIAgentDefinition, AIAuditInput, AIObjectRef, AISummaryResult,
  AITimelineEntry, ModelCompletion, ModelCompletionOptions, ModelMessage,
  PersistAISummaryInput, PersistedAISummary,
} from "./types.js";

export interface AIContextReader {
  readObject(tenantId: string, objectRef: AIObjectRef): Promise<Record<string, unknown> | null>;
}

export interface AITimelineReader {
  readTimeline(tenantId: string, objectRef: AIObjectRef): Promise<readonly AITimelineEntry[]>;
}

export interface ModelClient {
  readonly model: string;
  complete(messages: readonly ModelMessage[], options: ModelCompletionOptions): Promise<ModelCompletion>;
}

export interface AIStore {
  agent(code: string): Promise<AIAgentDefinition | null>;
  persistSummary(input: PersistAISummaryInput): Promise<PersistedAISummary>;
  recordAudit(input: AIAuditInput): Promise<void>;
}

export interface AIServiceContract {
  summarise(userId: string, tenantId: string, objectRef: AIObjectRef): Promise<AISummaryResult>;
}

export type RequestAIServiceFactory = (identity: IdentityServiceContract) => AIServiceContract;
