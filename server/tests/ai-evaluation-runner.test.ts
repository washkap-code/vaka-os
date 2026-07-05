import { describe, expect, it } from "vitest";
import { renderEvaluationMarkdown, runEvaluationCandidates } from "../src/ai/evaluation/runner.js";
import { SYNTHETIC_AI_EVALUATION_SCENARIOS } from "../src/ai/evaluation/scenarios.js";

const validCandidate = {
  scenarioId: "en-receivables-grounded-001",
  language: "en",
  tenantId: "11111111-1111-4111-8111-111111111111",
  responseText: "Three invoices totalling USD 8,450.00 are overdue.",
  claims: [
    {
      id: "overdue-count",
      kind: "fact",
      text: "Three invoices are overdue.",
      value: "3",
      sourceIds: ["INV-001", "INV-002", "INV-003"],
    },
    {
      id: "overdue-total",
      kind: "calculation",
      text: "USD 8,450.00 is overdue.",
      value: "8450.00",
      currency: "USD",
      sourceIds: ["INV-001", "INV-002", "INV-003"],
    },
  ],
  toolCalls: [{
    name: "get_business_summary",
    mode: "read",
    arguments: {},
    status: "completed",
  }],
  refusal: { refused: false },
};

function candidateFile(candidates: unknown[]) {
  return {
    schemaVersion: "1.0",
    datasetVersion: "2026-07-05.1",
    candidates,
  };
}

describe("VAKA AI evaluation runner", () => {
  it("validates candidates and reports missing coverage without hiding it", () => {
    const report = runEvaluationCandidates(
      candidateFile([validCandidate]),
      SYNTHETIC_AI_EVALUATION_SCENARIOS,
      {
        allowPartial: true,
        expectedDatasetVersion: "2026-07-05.1",
        evaluatedAt: new Date("2026-07-05T09:00:00.000Z"),
      },
    );

    expect(report.candidateCount).toBe(1);
    expect(report.scenarioCount).toBe(7);
    expect(report.missingScenarioIds).toHaveLength(6);
    expect(report.reports[0].criticalFailures).toEqual([]);
    expect(report.runGatePassed).toBe(false);
  });

  it("rejects malformed, unknown, duplicate, and wrong-version input", () => {
    expect(() => runEvaluationCandidates(
      candidateFile([{ ...validCandidate, toolCalls: [{ name: "x" }] }]),
      SYNTHETIC_AI_EVALUATION_SCENARIOS,
    )).toThrow();

    expect(() => runEvaluationCandidates(
      candidateFile([{ ...validCandidate, scenarioId: "unknown" }]),
      SYNTHETIC_AI_EVALUATION_SCENARIOS,
    )).toThrow(/Unknown evaluation scenario/);

    expect(() => runEvaluationCandidates(
      candidateFile([validCandidate, validCandidate]),
      SYNTHETIC_AI_EVALUATION_SCENARIOS,
    )).toThrow(/Duplicate candidate scenarios/);

    expect(() => runEvaluationCandidates(
      candidateFile([validCandidate]),
      SYNTHETIC_AI_EVALUATION_SCENARIOS,
      { expectedDatasetVersion: "different" },
    )).toThrow(/does not match expected/);
  });

  it("renders a stable human-readable report with gate status", () => {
    const report = runEvaluationCandidates(
      candidateFile([validCandidate]),
      SYNTHETIC_AI_EVALUATION_SCENARIOS,
      { allowPartial: true, evaluatedAt: new Date("2026-07-05T09:00:00.000Z") },
    );
    const markdown = renderEvaluationMarkdown(report);
    expect(markdown).toContain("# VAKA AI Evaluation Report");
    expect(markdown).toContain("Run gate: **FAIL**");
    expect(markdown).toContain("## Missing scenarios");
    expect(markdown).toContain("Human review required");
    expect(markdown).toContain("Calculation accuracy");
  });
});
