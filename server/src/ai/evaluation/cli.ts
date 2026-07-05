import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { runEvaluationCandidates, renderEvaluationMarkdown } from "./runner.js";
import { SYNTHETIC_AI_EVALUATION_SCENARIOS } from "./scenarios.js";

type CliOptions = {
  input?: string;
  json?: string;
  markdown?: string;
  allowPartial: boolean;
  listScenarios: boolean;
};

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.listScenarios) {
    process.stdout.write(`${JSON.stringify({
      schemaVersion: "1.0",
      scenarios: SYNTHETIC_AI_EVALUATION_SCENARIOS.map((scenario) => ({
        id: scenario.id,
        title: scenario.title,
        language: scenario.language,
        capabilityLevel: scenario.capabilityLevel,
        maximumAutonomy: scenario.maximumAutonomy,
      })),
    }, null, 2)}\n`);
    return;
  }
  if (!options.input) throw new Error("Missing required --input <candidate-file.json>");

  const inputPath = resolve(options.input);
  const input = JSON.parse(await readFile(inputPath, "utf8")) as unknown;
  const report = runEvaluationCandidates(input, SYNTHETIC_AI_EVALUATION_SCENARIOS, {
    allowPartial: options.allowPartial,
    expectedDatasetVersion: "2026-07-05.1",
  });
  const json = `${JSON.stringify(report, null, 2)}\n`;
  const markdown = renderEvaluationMarkdown(report);

  if (options.json) await writeOutput(options.json, json);
  if (options.markdown) await writeOutput(options.markdown, markdown);
  if (!options.json && !options.markdown) process.stdout.write(json);

  if (!report.runGatePassed) process.exitCode = 1;
}

function parseArguments(args: string[]): CliOptions {
  const options: CliOptions = { allowPartial: false, listScenarios: false };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--allow-partial") options.allowPartial = true;
    else if (argument === "--list-scenarios") options.listScenarios = true;
    else if (argument === "--input") options.input = requiredValue(args, ++index, argument);
    else if (argument === "--json") options.json = requiredValue(args, ++index, argument);
    else if (argument === "--markdown") options.markdown = requiredValue(args, ++index, argument);
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

function requiredValue(args: string[], index: number, argument: string) {
  const value = args[index];
  if (!value || value.startsWith("--")) throw new Error(`Missing value for ${argument}`);
  return value;
}

async function writeOutput(path: string, content: string) {
  const outputPath = resolve(path);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, content, "utf8");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown evaluation runner failure";
  process.stderr.write(`VAKA AI evaluation failed: ${message}\n`);
  process.exitCode = 2;
});
