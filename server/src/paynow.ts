import { createHash, timingSafeEqual } from "node:crypto";

const INITIATE_URL = "https://www.paynow.co.zw/interface/initiatetransaction";

export type PaynowFields = ReadonlyArray<readonly [string, string]>;

export class PaynowResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaynowResponseError";
  }
}

export function generatePaynowHash(fields: PaynowFields, integrationKey: string): string {
  const material = fields
    .filter(([key]) => key.toLowerCase() !== "hash")
    .map(([, value]) => value)
    .join("") + integrationKey;
  return createHash("sha512").update(material, "utf8").digest("hex").toUpperCase();
}

export function parseAndVerifyPaynowMessage(raw: string, integrationKey: string): Map<string, string> {
  if (!raw || raw.length > 16_384) throw new PaynowResponseError("Paynow response is empty or too large");
  const fields: Array<readonly [string, string]> = [];
  const values = new Map<string, string>();
  for (const [rawKey, value] of new URLSearchParams(raw).entries()) {
    const key = rawKey.toLowerCase();
    if (!key || values.has(key)) throw new PaynowResponseError("Paynow response contains invalid fields");
    fields.push([key, value]);
    values.set(key, value);
  }
  const supplied = values.get("hash")?.toUpperCase();
  if (!supplied || !/^[A-F0-9]{128}$/.test(supplied)) {
    throw new PaynowResponseError("Paynow response hash is missing or invalid");
  }
  const expected = generatePaynowHash(fields, integrationKey);
  const suppliedBytes = Buffer.from(supplied, "hex");
  const expectedBytes = Buffer.from(expected, "hex");
  if (suppliedBytes.length !== expectedBytes.length || !timingSafeEqual(suppliedBytes, expectedBytes)) {
    throw new PaynowResponseError("Paynow response hash verification failed");
  }
  return values;
}

function assertPaynowUrl(value: string, label: string): string {
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new PaynowResponseError(`${label} is invalid`); }
  const hostname = parsed.hostname.toLowerCase();
  if (parsed.protocol !== "https:" || (hostname !== "paynow.co.zw" && !hostname.endsWith(".paynow.co.zw"))) {
    throw new PaynowResponseError(`${label} is not an approved Paynow URL`);
  }
  return parsed.toString();
}

export type PaynowInitiation = {
  reference: string;
  amount: string;
  additionalInfo: string;
  returnUrl: string;
  resultUrl: string;
  email?: string;
  name?: string;
};

export type PaynowStatus = {
  reference: string;
  amount: string;
  status: string;
  paynowReference: string | null;
  pollUrl: string;
};

export class PaynowClient {
  constructor(
    private readonly integrationId: string,
    private readonly integrationKey: string,
    private readonly transport: typeof fetch = fetch,
  ) {}

  async initiate(input: PaynowInitiation): Promise<{ redirectUrl: string; pollUrl: string }> {
    const fields: Array<[string, string]> = [
      ["id", this.integrationId],
      ["reference", input.reference],
      ["amount", input.amount],
      ["additionalinfo", input.additionalInfo],
      ["returnurl", input.returnUrl],
      ["resulturl", input.resultUrl],
    ];
    if (input.email) fields.push(["authemail", input.email]);
    if (input.name) fields.push(["authname", input.name]);
    fields.push(["status", "Message"]);
    fields.push(["hash", generatePaynowHash(fields, this.integrationKey)]);
    const response = await this.transport(INITIATE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(fields).toString(),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error("Paynow initiation is temporarily unavailable");
    const values = parseAndVerifyPaynowMessage(await response.text(), this.integrationKey);
    if (values.get("status")?.toLowerCase() !== "ok") {
      throw new PaynowResponseError(values.get("error") || "Paynow rejected the payment request");
    }
    const browserUrl = values.get("browserurl");
    const pollUrl = values.get("pollurl");
    if (!browserUrl || !pollUrl) throw new PaynowResponseError("Paynow response is incomplete");
    return {
      redirectUrl: assertPaynowUrl(browserUrl, "Paynow browser URL"),
      pollUrl: assertPaynowUrl(pollUrl, "Paynow poll URL"),
    };
  }

  verifyInbound(raw: string): Map<string, string> {
    return parseAndVerifyPaynowMessage(raw, this.integrationKey);
  }

  async poll(pollUrl: string): Promise<PaynowStatus> {
    const approvedUrl = assertPaynowUrl(pollUrl, "Paynow poll URL");
    const response = await this.transport(approvedUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error("Paynow status is temporarily unavailable");
    const values = parseAndVerifyPaynowMessage(await response.text(), this.integrationKey);
    const reference = values.get("reference");
    const amount = values.get("amount");
    const status = values.get("status");
    const returnedPollUrl = values.get("pollurl");
    if (!reference || !amount || !status || !returnedPollUrl) {
      throw new PaynowResponseError("Paynow status response is incomplete");
    }
    return {
      reference,
      amount,
      status,
      paynowReference: values.get("paynowreference") ?? null,
      pollUrl: assertPaynowUrl(returnedPollUrl, "Paynow poll URL"),
    };
  }
}
