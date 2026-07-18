import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { mailEncryptionSecret } from "../../config.js";
import { MailConfigurationError } from "./errors.js";

const VERSION = "v1";
const IV_BYTES = 12;

function key(secret: string): Buffer {
  return createHash("sha256").update(`vaka-mail-credentials:${secret}`).digest();
}

export class MailCredentialCipher {
  constructor(private readonly secret: () => string = mailEncryptionSecret) {}

  encrypt<T extends object>(value: T): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv("aes-256-gcm", key(this.secret()), iv);
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(value), "utf8"),
      cipher.final(),
    ]);
    return [
      VERSION,
      iv.toString("base64url"),
      ciphertext.toString("base64url"),
      cipher.getAuthTag().toString("base64url"),
    ].join(".");
  }

  decrypt<T extends object>(storedValue: string): T {
    const [version, encodedIv, encodedCiphertext, encodedTag, extra] = storedValue.split(".");
    if (version !== VERSION || !encodedIv || !encodedCiphertext || !encodedTag || extra) {
      throw new MailConfigurationError("Encrypted mailbox configuration is malformed");
    }
    const iv = Buffer.from(encodedIv, "base64url");
    const ciphertext = Buffer.from(encodedCiphertext, "base64url");
    const tag = Buffer.from(encodedTag, "base64url");
    if (iv.length !== IV_BYTES || ciphertext.length === 0 || tag.length !== 16) {
      throw new MailConfigurationError("Encrypted mailbox configuration is malformed");
    }
    try {
      const decipher = createDecipheriv("aes-256-gcm", key(this.secret()), iv);
      decipher.setAuthTag(tag);
      const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
      const parsed: unknown = JSON.parse(plaintext);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid shape");
      return parsed as T;
    } catch {
      throw new MailConfigurationError("Encrypted mailbox configuration cannot be opened");
    }
  }
}
