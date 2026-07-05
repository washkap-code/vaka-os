import { describe, expect, it } from "vitest";
import { normalizeReferralCode, validateReferralReview } from "../src/referrals.js";

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

describe("referral review validation", () => {
  it("normalizes reason codes without changing the decision", () => {
    expect(validateReferralReview({
      decision: "QUALIFIED",
      reasonCode: " verified_business ",
      notes: " Evidence checked. ",
    })).toEqual({
      decision: "QUALIFIED",
      reasonCode: "VERIFIED_BUSINESS",
      notes: "Evidence checked.",
    });
  });

  it.each(["", "x", "has spaces", "symbols!"])(
    "rejects invalid reason code %j",
    (reasonCode) => {
      expect(() => validateReferralReview({
        decision: "HELD",
        reasonCode,
      })).toThrow("A valid referral review reason code is required");
    },
  );
});
