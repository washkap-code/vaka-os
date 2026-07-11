import { describe, expect, it } from "vitest";
import { protectCaptureDataUrl, revealCaptureDataUrl } from "../src/capture-storage.js";

const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

describe("capture payload protection", () => {
  it("round-trips an encrypted capture without exposing the original value", () => {
    const protectedValue = protectCaptureDataUrl(png);
    expect(protectedValue).toMatch(/^v1\./);
    expect(protectedValue).not.toContain(png);
    expect(revealCaptureDataUrl(protectedValue)).toBe(png);
  });

  it("keeps legacy plaintext rows readable during migration", () => {
    expect(revealCaptureDataUrl(png)).toBe(png);
  });

  it("rejects tampered ciphertext", () => {
    const protectedValue = protectCaptureDataUrl(png);
    const parts = protectedValue.split(".");
    parts[3] = `${parts[3][0] === "a" ? "b" : "a"}${parts[3].slice(1)}`;
    const tampered = parts.join(".");
    expect(() => revealCaptureDataUrl(tampered)).toThrow();
  });
});
