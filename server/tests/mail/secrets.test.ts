import { describe, expect, it } from "vitest";
import { MailCredentialCipher } from "../../src/modules/mail/secrets.js";
import { MailConfigurationError } from "../../src/modules/mail/errors.js";

describe("Mail credential encryption", () => {
  it("round-trips an account configuration without retaining plaintext", () => {
    const cipher = new MailCredentialCipher(() => "mail-test-key-one-32-random-bytes");
    const value = {
      host: "imap.example.test", port: 993, username: "owner@example.test",
      password: "very-secret-mail-password", tls: "implicit" as const,
    };
    const encrypted = cipher.encrypt(value);
    expect(encrypted).toMatch(/^v1\./);
    expect(encrypted).not.toContain(value.password);
    expect(encrypted).not.toContain(value.username);
    expect(cipher.decrypt(encrypted)).toEqual(value);
  });

  it("fails closed for the wrong key or malformed envelope", () => {
    const encrypted = new MailCredentialCipher(() => "mail-test-key-one-32-random-bytes")
      .encrypt({ password: "secret" });
    expect(() => new MailCredentialCipher(() => "mail-test-key-two-32-random-bytes").decrypt(encrypted))
      .toThrow(MailConfigurationError);
    expect(() => new MailCredentialCipher(() => "mail-test-key-one-32-random-bytes").decrypt("plaintext"))
      .toThrow("malformed");
  });
});
