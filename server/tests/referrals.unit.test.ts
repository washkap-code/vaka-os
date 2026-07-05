import { describe, expect, it } from "vitest";
import { normalizeReferralCode } from "../src/referrals.js";

describe("referral code normalization", () => {
  it("normalizes safe link codes", () => {
    expect(normalizeReferralCode("  vaka-partner-01 ")).toBe("VAKA-PARTNER-01");
  });

  it.each(["", "ABCD", "VAKA CODE", "VAKA_01", "VAKA/01"])(
    "rejects malformed code %j with the public-safe message",
    (value) => {
      expect(() => normalizeReferralCode(value)).toThrowError(
        expect.objectContaining({
          status: 400,
          message: "Referral code is invalid or unavailable",
        }),
      );
    },
  );
});
