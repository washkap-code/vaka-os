import { createHash } from "node:crypto";
import type { MetadataRegistryContract } from "../metadata/interfaces.js";
import { AIAgentUnavailableError } from "./errors.js";
import type {
  AIServiceContract, AIStore, AITimelineReader, ModelClient,
} from "./interfaces.js";
import type {
  AIEvidenceDraft, AIObjectRef, AISummaryResult, AITimelineEntry,
} from "./types.js";
import { ContextAssemblyService } from "./context.js";

const AGENT_CODE = "object-summariser";
const SYSTEM_INSTRUCTION = [
  "You are VAKA AI, a professional and concise business assistant.",
  "Summarise only the supplied evidence. Distinguish facts from inference.",
  "Do not invent values or instructions. Cite relevant evidence markers such as [E1].",
].join(" ");

interface TimelinePromptEntry {
  kind: AITimelineEntry["kind"];
  action: string;
  occurredAt: string;
  changes?: { before?: Record<string, unknown>; after?: Record<string, unknown> };
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function filterFields(value: unknown, readableFields: ReadonlySet<string>): Record<string, unknown> {
  const record = recordValue(value);
  if (!record) return {};
  return Object.fromEntries(Object.entries(record).filter(([field]) => readableFields.has(field)));
}

function filterChanges(
  entry: AITimelineEntry,
  readableFields: ReadonlySet<string>,
): { before?: Record<string, unknown>; after?: Record<string, unknown> } {
  const details = recordValue(entry.details);
  if (!details) return {};
  const before = filterFields(details.before, readableFields);
  const after = filterFields(details.after, readableFields);
  return {
    ...(Object.keys(before).length ? { before } : {}),
    ...(Object.keys(after).length ? { after } : {}),
  };
}

function timelineEvidence(
  objectRef: AIObjectRef,
  entry: AITimelineEntry,
  readableFields: ReadonlySet<string>,
): AIEvidenceDraft {
  const changes = filterChanges(entry, readableFields);
  const prompt: TimelinePromptEntry = {
    kind: entry.kind,
    action: entry.action,
    occurredAt: entry.occurredAt.toISOString(),
    ...(Object.keys(changes).length ? { changes } : {}),
  };
  return {
    ...objectRef,
    fieldNames: Object.freeze([...new Set([
      ...Object.keys(changes.before ?? {}),
      ...Object.keys(changes.after ?? {}),
    ])]),
    snippet: JSON.stringify(prompt).slice(0, 2_000),
  };
}

function promptFor(evidence: readonly AIEvidenceDraft[]): string {
  const sources = evidence.map((item, index) =>
    `[E${index + 1}] ${item.objectType}:${item.objectId} ${item.snippet}`).join("\n");
  return [
    "Summarise the object's business timeline in a short executive paragraph.",
    "Mention material status changes and dates; state when evidence is limited.",
    "Evidence:",
    sources,
  ].join("\n");
}

export class AIService implements AIServiceContract {
  constructor(
    private readonly context: ContextAssemblyService,
    private readonly metadata: MetadataRegistryContract,
    private readonly timeline: AITimelineReader,
    private readonly model: ModelClient,
    private readonly store: AIStore,
  ) {}

  async summarise(userId: string, tenantId: string, objectRef: AIObjectRef): Promise<AISummaryResult> {
    const agent = await this.store.agent(AGENT_CODE);
    if (!agent?.active || agent.allowedTools.length > 0) throw new AIAgentUnavailableError(AGENT_CODE);

    const context = await this.context.buildContext(userId, tenantId, [objectRef]);
    const canonicalRef = context.records[0];
    if (!canonicalRef || !agent.dataScopes.includes(canonicalRef.objectType)) {
      throw new AIAgentUnavailableError(AGENT_CODE);
    }

    const definition = this.metadata.getObject(canonicalRef.objectType);
    const readableFields = new Set(definition.fields
      .filter((field) => field.aiReadable).map((field) => field.name));
    const timelineEntries = await this.timeline.readTimeline(tenantId, canonicalRef);
    const timelineContext = timelineEntries.map((entry) =>
      timelineEvidence(canonicalRef, entry, readableFields));
    const evidence = Object.freeze([
      ...context.evidence,
      ...timelineContext,
    ]);
    const prompt = promptFor(evidence);
    const promptHash = createHash("sha256").update(prompt).digest("hex");

    let completion;
    try {
      completion = await this.model.complete([{ role: "user", content: prompt }], {
        system: SYSTEM_INSTRUCTION,
        maxTokens: 500,
        temperature: 0,
      });
    } catch (error) {
      await this.store.recordAudit({
        tenantId,
        userId,
        agentCode: AGENT_CODE,
        action: "ai.summarise.failed",
        promptHash,
        model: this.model.model,
        tokensIn: 0,
        tokensOut: 0,
        evidenceCount: evidence.length,
      });
      throw error;
    }

    const audit = {
      tenantId,
      userId,
      agentCode: AGENT_CODE,
      action: "ai.summarise.completed",
      promptHash,
      model: completion.model,
      tokensIn: completion.tokensIn,
      tokensOut: completion.tokensOut,
      evidenceCount: evidence.length,
    } as const;
    // Audit is independent of message persistence so a completed provider call
    // remains visible even if the subsequent conversation transaction fails.
    await this.store.recordAudit(audit);
    const persisted = await this.store.persistSummary({
      tenantId,
      userId,
      agentCode: AGENT_CODE,
      title: `${canonicalRef.objectType} timeline summary`,
      userMessage: `Summarise timeline for ${canonicalRef.objectType}:${canonicalRef.objectId}`,
      assistantMessage: completion.content,
      evidence,
    });
    return { ...persisted, summary: completion.content };
  }
}
