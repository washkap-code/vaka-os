import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { paynowEncryptionSecret } from "./config.js";

const VERSION = "v1";
const IV_BYTES = 12;
const encryptionKey = (): Buffer => createHash("sha256")
  .update(`vaka-paynow-poll:${paynowEncryptionSecret()}`)
  .digest();

export function protectPaynowPollUrl(value: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64url"), ciphertext.toString("base64url"), cipher.getAuthTag().toString("base64url")].join(".");
}

export function revealPaynowPollUrl(value: string): string {
  const [version, encodedIv, encodedCiphertext, encodedTag] = value.split(".");
  if (version !== VERSION || !encodedIv || !encodedCiphertext || !encodedTag) {
    throw new Error("Stored payment evidence is malformed");
  }
  const iv = Buffer.from(encodedIv, "base64url");
  const ciphertext = Buffer.from(encodedCiphertext, "base64url");
  const tag = Buffer.from(encodedTag, "base64url");
  if (iv.length !== IV_BYTES || !ciphertext.length || tag.length !== 16) {
    throw new Error("Stored payment evidence is malformed");
  }
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
