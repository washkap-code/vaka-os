# VAKA AI Evaluation Harness

**Status:** Implemented foundation — no model integration
**Owner:** Engineering, Product, Security, and Localisation
**Last reviewed:** 2026-07-05

## 1. Purpose

The evaluation harness converts the requirements in `AI-EVALUATION.md` into versioned, executable contracts.

It evaluates structured candidate output from any future model or deterministic baseline. It does not call a model, select a provider, use production tenant data, or grant release approval automatically.

## 2. Location

```text
server/src/ai/evaluation/
  contracts.ts
  runtime-schema.ts
  scenarios.ts
  scorer.ts
  runner.ts
  cli.ts

server/tests/
  ai-evaluation.test.ts
  ai-evaluation-runner.test.ts

server/fixtures/ai-evaluation/
  candidates.example.json
```

## 3. Current scenario set

The initial synthetic set covers:

- grounded overdue-receivables analysis;
- permission-safe payroll refusal;
- draft reminders without execution;
- external reminder confirmation;
- cross-tenant prompt injection;
- ChiShona value and identifier preservation; and
- isiNdebele value and identifier preservation.

The fixtures use synthetic identifiers and business values. They are not customer data.

## 4. Candidate-output contract

A candidate provides:

- scenario and tenant identifiers;
- response language and text;
- typed claims;
- claim kind;
- exact value and currency where applicable;
- source record identifiers;
- tool calls classified as read, draft, or action;
- tool status;
- refusal state/reason; and
- confirmation state and preview binding.

Separating read, draft, and action tools prevents a completed read from being mistaken for an executed business action.

## 5. Deterministic metrics

The scorer currently checks:

- factual claim accuracy;
- exact calculation accuracy;
- expected and allowed tool use;
- permission compliance;
- tenant isolation indicators;
- prohibited generic-chatbot tone markers;
- word-count concision;
- refusal requirements;
- action confirmation and false completion claims;
- unsupported material claims/hallucination rate; and
- whether language/tone review remains outstanding.

Critical failures are never averaged away.

## 6. Human review

The harness deliberately cannot self-certify:

- professional tone in full context;
- commercial usefulness;
- English editorial quality;
- ChiShona quality; or
- isiNdebele quality.

Scenarios requiring human review keep the release gate closed until qualified reviewers record approval. Model-based grading may assist triage later but cannot replace native or domain review.

## 7. Running the harness

From `server/`:

```bash
npm run test:ai-evaluation
```

This currently runs:

- deterministic evaluation-harness tests; and
- provider-independent business-summary contract tests.

It does not require PostgreSQL.

List the available scenarios:

```bash
npm run ai:evaluate -- --list-scenarios
```

Evaluate candidate JSON:

```bash
npm run ai:evaluate -- \
  --input fixtures/ai-evaluation/candidates.example.json \
  --allow-partial \
  --json artifacts/ai-evaluation/report.json \
  --markdown artifacts/ai-evaluation/report.md
```

The example is intentionally partial and has outstanding human review, so the command exits with status `1`. This demonstrates a failed gate rather than a release-ready result.

CLI exit statuses:

- `0`: every selected gate passed and required coverage is present;
- `1`: evaluation completed, but the release gate failed; and
- `2`: input, configuration, or runner execution failed.

Without `--allow-partial`, every scenario in the dataset requires one candidate. Unknown and duplicate scenario IDs are rejected.

## 8. Runtime input validation

Candidate files require:

- schema version;
- exact dataset version;
- an array of candidates;
- strict known fields;
- supported language;
- typed claims;
- tool mode and status;
- structured refusal; and
- structured confirmation.

Malformed files fail before scoring. The runner refuses silent evaluation against a different dataset version.

## 9. Reports

The JSON report contains:

- dataset/evaluation versions;
- coverage and missing scenarios;
- scenario-level metric results;
- critical failures;
- outstanding human reviews;
- aggregate summary; and
- final run-gate status.

The Markdown report presents the same decision evidence for reviewers and CI artifacts.

## 10. Release-gate behaviour

The report fails closed for:

- tenant mismatch or forbidden tenant content;
- permission violations;
- missing required refusal;
- disallowed or missing tools;
- incorrect calculations;
- action execution without authority;
- missing required confirmation;
- confirmation without preview binding;
- false action-completion claims; or
- unsupported material factual/action claims.

A scenario cannot pass the release gate while required human review is outstanding.

## 11. Known limitations

- The first dataset is intentionally small and does not establish statistical readiness.
- Semantic factual equivalence is not yet scored; exact claim IDs/values are used.
- Tone checks detect only a limited prohibited-pattern set.
- Source IDs prove declared provenance, not that a provider truly used the source.
- Tool argument correctness is not yet compared field by field.
- Forecast calibration, anomaly precision/recall, latency, and cost remain future metrics.
- CI has not yet been configured to retain the generated report artifacts.
- No persisted evaluation-run database store exists yet.
- Native language fixtures require qualified review before they can become production gates.

## 12. Next step

Configure CI to:

- run the database-free harness on every AI-foundation change;
- retain JSON and Markdown reports;
- provision PostgreSQL for the synthetic tenant-isolation suite;
- separate expected human-review failures from machine regressions; and
- block merging on critical machine failures.

Provider or model integration remains deferred until governance and security gates pass.
