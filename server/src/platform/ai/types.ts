export interface AIObjectRef {
  objectType: string;
  objectId: string;
}

export type AIContextScalar = string | number | boolean | null;
export type AIContextValue = AIContextScalar | AIContextScalar[];

export interface AIContextRecord extends AIObjectRef {
  fields: Readonly<Record<string, AIContextValue>>;
}

export interface AIEvidenceDraft extends AIObjectRef {
  fieldNames: readonly string[];
  snippet: string;
}

export interface AIEvidenceRecord extends AIEvidenceDraft {
  id: string;
  messageId: string;
}

export interface BuiltAIContext {
  records: readonly AIContextRecord[];
  evidence: readonly AIEvidenceDraft[];
}

export interface AITimelineEntry {
  id: string;
  kind: "audit" | "event" | "workflow" | "notification";
  action: string;
  occurredAt: Date;
  details: Record<string, unknown>;
}

export interface AIAgentDefinition {
  code: string;
  name: string;
  purpose: string;
  allowedTools: readonly string[];
  dataScopes: readonly string[];
  requiresApprovalFor: readonly string[];
  active: boolean;
}

export interface ModelMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ModelCompletionOptions {
  system?: string;
  maxTokens: number;
  temperature?: number;
}

export interface ModelCompletion {
  content: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
}

export interface AIAuditInput {
  tenantId: string;
  userId: string;
  agentCode: string;
  action: string;
  promptHash: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  evidenceCount: number;
}

export interface PersistAISummaryInput {
  tenantId: string;
  userId: string;
  agentCode: string;
  title: string;
  userMessage: string;
  assistantMessage: string;
  evidence: readonly AIEvidenceDraft[];
}

export interface PersistedAISummary {
  conversationId: string;
  messageId: string;
  evidence: readonly AIEvidenceRecord[];
}

export interface AISummaryResult extends PersistedAISummary {
  summary: string;
}
