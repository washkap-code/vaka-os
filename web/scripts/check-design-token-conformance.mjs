import { readFile } from "node:fs/promises";

const TOKEN_SOURCE = "src/design-system/tokens.css";
const LIVE_SURFACES = [
  "src/styles.css", "src/landing.css", "src/App.tsx", "src/landing.tsx",
  "src/shell/notification-copy.ts", "src/shell/notification-menu.tsx",
  "src/shell/user-menu.tsx", "src/shell/workspace-shell.tsx",
];

function lineNumber(source, offset) {
  return source.slice(0, offset).split("\n").length;
}

export function conformanceIssues(file, source, definedTokens) {
  const issues = [];
  const checks = [
    { label: "raw colour", pattern: /#[0-9a-f]{3,8}\b/gi },
    { label: "raw functional colour", pattern: /(?:rgb|rgba|hsl|hsla)\((?![^)]*var\()[^)]*\)/gi },
    { label: "literal motion duration", pattern: /(?:transition(?:-[a-z]+)?|animation(?:-duration)?)\s*:[^;]*(?<![-\w])\d*\.?\d+(?:ms|s)\b[^;]*/gi },
  ];
  for (const check of checks) {
    for (const match of source.matchAll(check.pattern)) issues.push(`${file}:${lineNumber(source, match.index ?? 0)} ${check.label}: ${match[0]}`);
  }
  for (const match of source.matchAll(/font-family\s*:\s*([^;]+)/gi)) {
    const value = match[1].trim();
    if (!value.startsWith("var(") && value !== "inherit") issues.push(`${file}:${lineNumber(source, match.index ?? 0)} literal font family: ${match[0]}`);
  }
  for (const match of source.matchAll(/var\((--vaka-[a-z0-9-]+)(?:,\s*[^)]+)?\)/gi)) {
    if (!definedTokens.has(match[1])) issues.push(`${file}:${lineNumber(source, match.index ?? 0)} undefined token: ${match[1]}`);
  }
  return issues;
}

// Regression proof: the scanner must reject representative drift rather than
// merely passing the current files.
const selfTestTokens = new Set(["--vaka-example"]);
const selfTest = conformanceIssues("self-test.css", ".x { color: #fff; font-family: Arial; transition: color 200ms; }", selfTestTokens);
if (selfTest.length !== 3) throw new Error(`Design-token scanner self-test failed: expected 3 issues, received ${selfTest.length}`);

const tokenSource = await readFile(TOKEN_SOURCE, "utf8");
const definedTokens = new Set([...tokenSource.matchAll(/(--vaka-[a-z0-9-]+)\s*:/gi)].map((match) => match[1]));
const issues = [];
for (const file of LIVE_SURFACES) issues.push(...conformanceIssues(file, await readFile(file, "utf8"), definedTokens));

const workspace = await readFile("src/styles.css", "utf8");
const homepage = await readFile("src/landing.css", "utf8");
const requiredContracts = [
  ["src/styles.css", workspace, "--brand: var(--vaka-workspace-brand-fallback)"],
  ["src/styles.css", workspace, "--accent: var(--vaka-workspace-accent-fallback)"],
  ["src/styles.css", workspace, "font-family: var(--vaka-workspace-font)"],
  ["src/styles.css", workspace, "border-radius: var(--vaka-workspace-radius-panel)"],
  ["src/landing.css", homepage, "--v-ink: var(--vaka-home-ink)"],
  ["src/landing.css", homepage, "font-family: var(--vaka-font-sans)"],
  ["src/landing.css", homepage, "animation: v-rise var(--vaka-home-motion-rise-copy)"],
];
for (const [file, source, expected] of requiredContracts) {
  if (!source.includes(expected)) issues.push(`${file} missing required compatibility contract: ${expected}`);
}
if (/--vaka-workspace-tone-/.test(workspace)) issues.push("src/styles.css must use semantic workspace roles, not compatibility tone tokens");

if (issues.length) {
  console.error("Design-token conformance failed:\n" + issues.map((issue) => `- ${issue}`).join("\n"));
  process.exit(1);
}
console.log(`Design-token conformance passed for ${LIVE_SURFACES.join(" and ")} (${definedTokens.size} governed tokens).`);
