import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EVENT_TYPES } from "../../../src/platform/events/registry.js";

describe("P1-005 event catalogue", () => {
  it("lists the typed event union exactly once", async () => {
    const catalogue = await readFile(
      fileURLToPath(new URL("../../../../docs/platform/event-catalogue.md", import.meta.url)),
      "utf8",
    );
    const documented = [...catalogue.matchAll(/^\| `([^`]+)` \|/gm)].map((match) => match[1]);
    expect(documented.sort()).toEqual([...EVENT_TYPES].sort());
    expect(new Set(documented).size).toBe(documented.length);
    expect(new Set(EVENT_TYPES).size).toBe(EVENT_TYPES.length);
  });
});
