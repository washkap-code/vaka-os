import { describe, expect, it } from "vitest";
import { parsePdfImage } from "../src/invoice-documents.js";

const onePixelPng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

describe("PDF image boundary", () => {
  it("accepts a bounded supported data-image", () => {
    expect(parsePdfImage(onePixelPng)).toMatchObject({ width: 1, height: 1, colorSpace: "DeviceRGB" });
  });

  it("rejects remote and oversized encoded images", () => {
    expect(parsePdfImage("https://example.test/logo.png")).toBeNull();
    expect(parsePdfImage(`data:image/jpeg;base64,${"A".repeat(2_796_204)}`)).toBeNull();
  });

  it("rejects supported signatures with unsafe dimensions", () => {
    const unsafeJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x08, 0x08, 0x13, 0x89, 0x00, 0x01, 0x03]);
    expect(parsePdfImage(`data:image/jpeg;base64,${unsafeJpeg.toString("base64")}`)).toBeNull();
  });
});
