import { describe, expect, it } from "vitest";
import { DuplicateServiceError, MissingServiceError } from "../errors.js";
import { ServiceContainer, createServiceToken } from "../service.js";

describe("ServiceContainer", () => {
  it("resolves memoised factories and values", () => {
    const container = new ServiceContainer();
    const token = createServiceToken<{ ready: boolean }>("test");
    let calls = 0;
    container.registerFactory(token, () => { calls += 1; return { ready: true }; });
    expect(container.get(token)).toBe(container.get(token));
    expect(calls).toBe(1);
  });

  it("rejects missing and duplicate services", () => {
    const container = new ServiceContainer();
    const token = createServiceToken<string>("test");
    expect(() => container.get(token)).toThrow(MissingServiceError);
    container.registerValue(token, "value");
    expect(() => container.registerValue(token, "other")).toThrow(DuplicateServiceError);
  });
});
