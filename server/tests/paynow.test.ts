import { describe, expect, it } from "vitest";
import {
  generatePaynowHash, parseAndVerifyPaynowMessage, PaynowClient, PaynowResponseError,
} from "../src/paynow.js";
import { protectPaynowPollUrl, revealPaynowPollUrl } from "../src/payment-secrets.js";

const integrationKey = "3e9fed89-60e1-4ce5-ab6e-6b1eb2d4f977";

describe("Paynow signed-message adapter", () => {
  it("matches Paynow's published outbound SHA-512 example", () => {
    const hash = generatePaynowHash([
      ["id", "1201"],
      ["reference", "TEST REF"],
      ["amount", "99.99"],
      ["additionalinfo", "A test ticket transaction"],
      ["returnurl", "http://www.google.com/search?q=returnurl"],
      ["resulturl", "http://www.google.com/search?q=resulturl"],
      ["status", "Message"],
    ], integrationKey);
    expect(hash).toBe("2A033FC38798D913D42ECB786B9B19645ADEDBDE788862032F1BD82CF3B92DEF84F316385D5B40DBB35F1A4FD7D5BFE73835174136463CDD48C9366B0749C689");
  });

  it("verifies Paynow's published inbound example and rejects tampering", () => {
    const raw = "status=Ok&browserurl=https%3a%2f%2fstaging.paynow.co.zw%2fPayment%2fConfirmPayment%2f9510&pollurl=https%3a%2f%2fstaging.paynow.co.zw%2fInterface%2fCheckPayment%2f%3fguid%3dc7ed41da-0159-46da-b428-69549f770413&paynowreference=9510&hash=750DD0B0DF374678707BB5AF915AF81C228B9058AD57BB7120569EC68BBB9C2EFC1B26C6375D2BC562AC909B3CD6B2AF1D42E1A5E479FFAC8F4FB3FDCE71DF4D";
    expect(parseAndVerifyPaynowMessage(raw, integrationKey).get("status")).toBe("Ok");
    expect(() => parseAndVerifyPaynowMessage(raw.replace("status=Ok", "status=Paid"), integrationKey))
      .toThrow("hash verification failed");
  });

  it("accepts only signed Paynow redirect and poll hosts", async () => {
    const responseFields: Array<[string, string]> = [
      ["status", "Ok"],
      ["browserurl", "https://secure.paynow.co.zw/payment/123"],
      ["pollurl", "https://www.paynow.co.zw/interface/checkpayment/?guid=abc"],
      ["paynowreference", "123"],
    ];
    responseFields.push(["hash", generatePaynowHash(responseFields, integrationKey)]);
    const transport = async () => new Response(new URLSearchParams(responseFields).toString(), { status: 200 });
    const client = new PaynowClient("1201", integrationKey, transport as typeof fetch);
    const result = await client.initiate({
      reference: "VAKA-123", amount: "19.00", additionalInfo: "Subscription",
      returnUrl: "https://vakaos.com/workspace/test", resultUrl: "https://vakaos.com/api/result",
    });
    expect(result.redirectUrl).toBe("https://secure.paynow.co.zw/payment/123");

    const unsafeFields: Array<[string, string]> = [
      ["status", "Ok"], ["browserurl", "https://paynow.co.zw.evil.example/payment"],
      ["pollurl", "https://www.paynow.co.zw/interface/checkpayment/?guid=abc"],
    ];
    unsafeFields.push(["hash", generatePaynowHash(unsafeFields, integrationKey)]);
    const unsafe = new PaynowClient("1201", integrationKey,
      (async () => new Response(new URLSearchParams(unsafeFields).toString(), { status: 200 })) as typeof fetch);
    await expect(unsafe.initiate({
      reference: "VAKA-124", amount: "19.00", additionalInfo: "Subscription",
      returnUrl: "https://vakaos.com/workspace/test", resultUrl: "https://vakaos.com/api/result",
    })).rejects.toBeInstanceOf(PaynowResponseError);
  });

  it("encrypts provider poll references at rest", () => {
    const pollUrl = "https://www.paynow.co.zw/interface/checkpayment/?guid=confidential";
    const protectedValue = protectPaynowPollUrl(pollUrl);
    expect(protectedValue).not.toContain("guid");
    expect(revealPaynowPollUrl(protectedValue)).toBe(pollUrl);
  });
});
