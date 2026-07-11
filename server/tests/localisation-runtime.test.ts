import { describe, expect, it } from "vitest";
import { LOCALISATION_SERVICE, buildPlatformKernel } from "../src/platform-runtime.js";

describe("localisation composition (P2-001)", () => {
  it("registers the Zimbabwe pack by default and resolves it from the kernel", () => {
    const kernel = buildPlatformKernel({ auditWriter: () => {} });
    const loc = kernel.container.get(LOCALISATION_SERVICE);
    expect(loc.has("ZW")).toBe(true);
    expect(loc.standardVatPercent("ZW")).toBe(15);
    expect(loc.currencies("ZW").map((c) => c.code)).toEqual(["USD", "ZWG"]);
  });

  it("honours an overridden country-pack set (extension without core changes)", () => {
    const kernel = buildPlatformKernel({
      auditWriter: () => {},
      countryPacks: [{
        code: "ZM", name: "Zambia",
        currencies: [{ code: "ZMW", label: "ZK", decimals: 2 }],
        vatRates: [{ percent: 16, effectiveFrom: "2020-01-01", effectiveTo: null }],
        taxTreatments: ["standard", "zero-rated", "exempt"],
        statutoryIdentifiers: [{ key: "tpin", label: "TPIN", required: true }],
        compliance: [{ key: "vat-return", label: "VAT Return", cadence: "monthly", authority: "ZRA" }],
      }],
    });
    const loc = kernel.container.get(LOCALISATION_SERVICE);
    expect(loc.has("ZW")).toBe(false);
    expect(loc.standardVatPercent("ZM")).toBe(16);
  });
});
