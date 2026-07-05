export type EvaluationLanguage = "en" | "sn" | "nd";
export type ClaimKind = "fact" | "calculation" | "inference" | "recommendation" | "action_status";

export type ExpectedClaim = {
  id: string;
  kind: "fact" | "calculation";
  value: string;
  currency?: "USD" | "ZWG";
  sourceIds: string[];
  required: boolean;
};

export type CandidateClaim = {
  id: string;
  kind: ClaimKind;
  text: string;
  value?: string;
  currency?: "USD" | "ZWG";
  sourceIds: string[];
};

export type CandidateToolCall = {
  name: string;
  mode: "read" | "draft" | "action";
  arguments: Record<string, unknown>;
  status: "proposed" | "completed" | "failed" | "unavailable";
};

export type EvaluationScenario = {
  id: string;
  title: string;
  capabilityLevel: 1 | 2 | 3 | 4;
  maximumAutonomy: "A" | "B" | "C" | "D" | "E";
  language: EvaluationLanguage;
  tenantId: string;
  actorUserId: string;
  permissions: string[];
  prompt: string;
  authorisedSourceIds: string[];
  forbiddenSourceIds: string[];
  forbiddenTextFragments: string[];
  expectedClaims: ExpectedClaim[];
  expectedTools: string[];
  allowedTools: string[];
  refusal: {
    required: boolean;
    acceptedReasonCodes: string[];
  };
  action: {
    confirmationRequired: boolean;
    executionAllowed: boolean;
  };
  style: {
    maximumWords: number;
    prohibitedOpeners: string[];
    maximumExclamationMarks: number;
    emojisAllowed: boolean;
  };
  humanReview: {
    tone: boolean;
    languageQuality: boolean;
    commercialUsefulness: boolean;
  };
};

export type CandidateOutput = {
  scenarioId: string;
  language: EvaluationLanguage;
  tenantId: string;
  responseText: string;
  claims: CandidateClaim[];
  toolCalls: CandidateToolCall[];
  refusal?: {
    refused: boolean;
    reasonCode?: string;
  };
  confirmation?: {
    requested: boolean;
    previewHash?: string;
    approved?: boolean;
  };
};

export type MetricResult = {
  name: string;
  score: number;
  passed: boolean;
  critical: boolean;
  details: string[];
  requiresHumanReview?: boolean;
};

export type EvaluationReport = {
  schemaVersion: "1.0";
  scenarioId: string;
  evaluatedAt: string;
  metrics: {
    factualAccuracy: MetricResult;
    calculationAccuracy: MetricResult;
    toolUseAccuracy: MetricResult;
    permissionCompliance: MetricResult;
    tenantIsolation: MetricResult;
    tone: MetricResult;
    concision: MetricResult;
    englishQuality: MetricResult;
    shonaQuality: MetricResult;
    ndebeleQuality: MetricResult;
    refusalBehaviour: MetricResult;
    actionConfirmation: MetricResult;
    hallucinationRate: MetricResult;
  };
  criticalFailures: string[];
  humanReviewRequired: string[];
  releaseGatePassed: boolean;
};
