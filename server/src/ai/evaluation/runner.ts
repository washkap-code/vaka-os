import type { CandidateOutput, EvaluationReport, EvaluationScenario } from "./contracts.js";
import { candidateFileSchema } from "./runtime-schema.js";
import { evaluateCandidate, summariseEvaluationReports } from "./scorer.js";

export type EvaluationRunReport = {
  schemaVersion: "1.0";
  datasetVersion: string;
  evaluatedAt: string;
  scenarioCount: number;
  candidateCount: number;
  evaluatedScenarioIds: string[];
  missingScenarioIds: string[];
  duplicateScenarioIds: string[];
  reports: EvaluationReport[];
  summary: ReturnType<typeof summariseEvaluationReports>;
  runGatePassed: boolean;
};

export function runEvaluationCandidates(
  input: unknown,
  scenarios: EvaluationScenario[],
  options: {
    evaluatedAt?: Date;
    allowPartial?: boolean;
    expectedDatasetVersion?: string;
  } = {},
): EvaluationRunReport {
  const parsed = candidateFileSchema.parse(input);
  if (options.expectedDatasetVersion && parsed.datasetVersion !== options.expectedDatasetVersion) {
    throw new Error(
      `Candidate dataset version ${parsed.datasetVersion} does not match expected ${options.expectedDatasetVersion}`,
    );
  }

  const scenarioMap = new Map(scenarios.map((scenario) => [scenario.id, scenario]));
  const counts = new Map<string, number>();
  for (const candidate of parsed.candidates) {
    counts.set(candidate.scenarioId, (counts.get(candidate.scenarioId) ?? 0) + 1);
    if (!scenarioMap.has(candidate.scenarioId)) {
      throw new Error(`Unknown evaluation scenario: ${candidate.scenarioId}`);
    }
  }

  const duplicateScenarioIds = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([scenarioId]) => scenarioId)
    .sort();
  if (duplicateScenarioIds.length) {
    throw new Error(`Duplicate candidate scenarios: ${duplicateScenarioIds.join(", ")}`);
  }

  const evaluatedAt = options.evaluatedAt ?? new Date();
  const candidates = parsed.candidates as CandidateOutput[];
  const reports = candidates.map((candidate) => (
    evaluateCandidate(scenarioMap.get(candidate.scenarioId)!, candidate, { evaluatedAt })
  ));
  const evaluatedScenarioIds = candidates.map((candidate) => candidate.scenarioId).sort();
  const evaluatedSet = new Set(evaluatedScenarioIds);
  const missingScenarioIds = scenarios
    .map((scenario) => scenario.id)
    .filter((scenarioId) => !evaluatedSet.has(scenarioId))
    .sort();
  const summary = summariseEvaluationReports(reports);

  return {
    schemaVersion: "1.0",
    datasetVersion: parsed.datasetVersion,
    evaluatedAt: evaluatedAt.toISOString(),
    scenarioCount: scenarios.length,
    candidateCount: candidates.length,
    evaluatedScenarioIds,
    missingScenarioIds,
    duplicateScenarioIds,
    reports,
    summary,
    runGatePassed:
      summary.allReleaseGatesPassed
      && duplicateScenarioIds.length === 0
      && (options.allowPartial === true || missingScenarioIds.length === 0),
  };
}

export function renderEvaluationMarkdown(report: EvaluationRunReport): string {
  const lines = [
    "# VAKA AI Evaluation Report",
    "",
    `- Dataset: \`${escapeMarkdown(report.datasetVersion)}\``,
    `- Evaluated: ${report.evaluatedAt}`,
    `- Candidates: ${report.candidateCount} of ${report.scenarioCount}`,
    `- Run gate: **${report.runGatePassed ? "PASS" : "FAIL"}**`,
    `- Critical failures: ${report.summary.criticalFailures.length}`,
    "",
  ];

  if (report.missingScenarioIds.length) {
    lines.push("## Missing scenarios", "");
    for (const scenarioId of report.missingScenarioIds) lines.push(`- \`${escapeMarkdown(scenarioId)}\``);
    lines.push("");
  }

  lines.push(
    "## Scenario results",
    "",
    "| Scenario | Gate | Critical failures | Human review required |",
    "|---|---:|---:|---:|",
  );
  for (const scenario of report.reports) {
    lines.push(
      `| \`${escapeMarkdown(scenario.scenarioId)}\` | ${scenario.releaseGatePassed ? "PASS" : "FAIL"} | ${scenario.criticalFailures.length} | ${scenario.humanReviewRequired.length} |`,
    );
  }
  lines.push("");

  for (const scenario of report.reports) {
    lines.push(`### ${escapeMarkdown(scenario.scenarioId)}`, "");
    if (scenario.criticalFailures.length) {
      lines.push(`Critical failures: ${scenario.criticalFailures.map(escapeMarkdown).join(", ")}`, "");
    }
    if (scenario.humanReviewRequired.length) {
      lines.push(`Human review required: ${scenario.humanReviewRequired.map(escapeMarkdown).join(", ")}`, "");
    }
    lines.push(
      "| Metric | Score | Result |",
      "|---|---:|---:|",
    );
    for (const metric of Object.values(scenario.metrics)) {
      lines.push(`| ${escapeMarkdown(metric.name)} | ${(metric.score * 100).toFixed(1)}% | ${metric.passed ? "PASS" : "FAIL"} |`);
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

function escapeMarkdown(value: string) {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}
