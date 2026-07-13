import { describe, expect, it } from "vitest";
import { LocalisationService } from "../service.js";
import { NoEffectiveTaxRateError, UnknownCountryError } from "../errors.js";
import { ZIMBABWE } from "../../../countries/zw.js";

describe("LocalisationService — Zimbabwe pack", () => {
  const svc = new LocalisationService([ZIMBABWE]);

  it("exposes USD and ZWG with the customer-facing ZiG label", () => {
    const currencies = svc.currencies("ZW");
    expect(currencies.map((c) => c.code)).toEqual(["USD", "ZWG"]);
    expect(currencies.find((c) => c.code === "ZWG")?.label).toBe("ZiG");
  });

  it("resolves the 15% standard VAT rate effective today (parity with live product)", () => {
    expect(svc.standardVatPercent("ZW")).toBe(15);
  });

  it("is case-insensitive on country code", () => {
    expect(svc.standardVatPercent("zw")).toBe(15);
  });

  it("selects the effective-dated rate for a given date", () => {
    const svcDated = new LocalisationService([{
      ...ZIMBABWE,
      vatRates: [
        { percent: 14.5, effectiveFrom: "2010-01-01", effectiveTo: "2020-01-01" },
        { percent: 15, effectiveFrom: "2020-01-01", effectiveTo: null },
      ],
    }]);
    expect(svcDated.standardVatPercent("ZW", "2015-06-01")).toBe(14.5);
    expect(svcDated.standardVatPercent("ZW", "2020-01-01")).toBe(15);
  });

  it("exposes the ZIMRA compliance calendar", () => {
    const keys = svc.pack("ZW").compliance.map((c) => c.key);
    expect(keys).toContain("vat-return");
    expect(keys).toContain("paye");
    expect(keys).toContain("nssa");
  });

  it("fails closed for unknown countries", () => {
    expect(() => svc.pack("XX")).toThrow(UnknownCountryError);
    expect(svc.has("XX")).toBe(false);
  });

  it("throws when no VAT rate covers the requested date", () => {
    expect(() => svc.standardVatPercent("ZW", "1990-01-01")).toThrow(NoEffectiveTaxRateError);
  });

  it("resolves standard, zero-rated and exempt treatments without conflating their evidence", () => {
    const service = new LocalisationService([ZIMBABWE]);
    expect(service.resolveTax("ZW", "standard", "2026-07-13")).toEqual({
      treatment: "standard",
      percent: 15,
      effectiveFrom: "2020-01-01",
      effectiveTo: null,
    });
    expect(service.resolveTax("ZW", "zero-rated", "2026-07-13")).toEqual({
      treatment: "zero-rated",
      percent: 0,
      effectiveFrom: null,
      effectiveTo: null,
    });
    expect(service.resolveTax("ZW", "exempt", "2026-07-13")).toEqual({
      treatment: "exempt",
      percent: 0,
      effectiveFrom: null,
      effectiveTo: null,
    });
  });
});
