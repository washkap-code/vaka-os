import { z } from "zod";

const claimSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["fact", "calculation", "inference", "recommendation", "action_status"]),
  text: z.string(),
  value: z.string().optional(),
  currency: z.enum(["USD", "ZWG"]).optional(),
  sourceIds: z.array(z.string()),
}).strict();

const toolCallSchema = z.object({
  name: z.string().min(1),
  mode: z.enum(["read", "draft", "action"]),
  arguments: z.record(z.string(), z.unknown()),
  status: z.enum(["proposed", "completed", "failed", "unavailable"]),
}).strict();

export const candidateOutputSchema = z.object({
  scenarioId: z.string().min(1),
  language: z.enum(["en", "sn", "nd"]),
  tenantId: z.string().min(1),
  responseText: z.string(),
  claims: z.array(claimSchema),
  toolCalls: z.array(toolCallSchema),
  refusal: z.object({
    refused: z.boolean(),
    reasonCode: z.string().optional(),
  }).strict().optional(),
  confirmation: z.object({
    requested: z.boolean(),
    previewHash: z.string().min(1).optional(),
    approved: z.boolean().optional(),
  }).strict().optional(),
}).strict();

export const candidateFileSchema = z.object({
  schemaVersion: z.literal("1.0"),
  datasetVersion: z.string().min(1),
  candidates: z.array(candidateOutputSchema),
}).strict();

export type CandidateFile = z.infer<typeof candidateFileSchema>;
