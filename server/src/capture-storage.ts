import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { captureEncryptionSecret } from "./config.js";

const VERSION = "v1";
const IV_BYTES = 12;
const KEY_BYTES = 32;

const encryptionKey = (): Buffer => createHash("sha256")
  .update(`vaka-capture-data:${captureEncryptionSecret()}`)
  .digest()
  .subarray(0, KEY_BYTES);

/** Encrypt a capture payload while retaining a versioned, self-describing value. */
export function protectCaptureDataUrl(dataUrl: string): string {
  if (dataUrl.startsWith(`${VERSION}.`)) return dataUrl;
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(dataUrl, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), ciphertext.toString("base64url"), authTag.toString("base64url")].join(".");
}

/** Decrypt a stored capture payload; legacy plaintext rows remain readable for migration. */
export function revealCaptureDataUrl(storedValue: string): string {
  if (!storedValue.startsWith(`${VERSION}.`)) return storedValue;
  const [, encodedIv, encodedCiphertext, encodedAuthTag] = storedValue.split(".");
  if (!encodedIv || !encodedCiphertext || !encodedAuthTag) throw new Error("Capture payload is malformed");
  const iv = Buffer.from(encodedIv, "base64url");
  const ciphertext = Buffer.from(encodedCiphertext, "base64url");
  const authTag = Buffer.from(encodedAuthTag, "base64url");
  if (iv.length !== IV_BYTES || !ciphertext.length || authTag.length !== 16) {
    throw new Error("Capture payload is malformed");
  }
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
