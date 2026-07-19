import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("AI business write boundary", () => {
  it("keeps the platform service independent of the application database", () => {
    const aiDir = resolve(process.cwd(), "src/platform/ai");
    const source = readdirSync(aiDir)
      .filter((name) => name.endsWith(".ts"))
      .map((name) => readFileSync(resolve(aiDir, name), "utf8"))
      .join("\n");
    expect(source).not.toMatch(/from ["']\.\.\/\.\.\/lib\.js["']/);
    expect(source).not.toMatch(/schema\.[A-Za-z0-9]+/);
    expect(source).not.toMatch(/\b(?:db|tx)\.(?:insert|update|delete)\(/);
  });

  it("limits the PostgreSQL adapter's writes to ai_* tables", () => {
    const source = readFileSync(resolve(process.cwd(), "src/ai-foundation.ts"), "utf8");
    const writes = [...source.matchAll(/\.(insert|update|delete)\(schema\.([A-Za-z0-9]+)/g)]
      .map((match) => match[2]);
    expect(writes).toEqual([
      "aiConversations", "aiMessages", "aiMessages", "aiEvidence", "aiAudit",
    ]);
    expect(writes.every((table) => table.startsWith("ai"))).toBe(true);
  });
});
