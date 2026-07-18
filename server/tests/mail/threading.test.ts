import { describe, expect, it } from "vitest";
import { parseMimeMessage, sanitizeMailHtml } from "../../src/modules/mail/mime.js";
import {
  normaliseSubject, referenceIds, replyReferences, replySubject,
} from "../../src/modules/mail/threading.js";

describe("Mail threading and MIME rules", () => {
  it("normalises reply/forward prefixes only for fallback threading", () => {
    expect(normaliseSubject("  Re: FWD:  Quarterly   Update ")).toBe("quarterly update");
    expect(replySubject("Quarterly Update")).toBe("Re: Quarterly Update");
    expect(replySubject("RE: Quarterly Update")).toBe("RE: Quarterly Update");
  });

  it("builds a deduplicated standards-shaped References chain", () => {
    expect(referenceIds("noise <root@example.test> <next@example.test>")).toEqual([
      "<root@example.test>", "<next@example.test>",
    ]);
    expect(replyReferences(["<root@example.test>"], "<root@example.test>")).toEqual([
      "<root@example.test>",
    ]);
  });

  it("parses headers, addresses, bodies and attachments while sanitising HTML", () => {
    const raw = Buffer.from([
      "From: Customer <customer@example.test>",
      "To: VAKA <mail@vaka.test>",
      "Message-ID: <message-1@example.test>",
      "In-Reply-To: <root@example.test>",
      "References: <older@example.test> <root@example.test>",
      "Subject: =?UTF-8?B?UXVhcnRlcmx5IFVwZGF0ZQ==?=",
      "Date: Sat, 18 Jul 2026 10:00:00 +0200",
      "Content-Type: multipart/mixed; boundary=mail-boundary",
      "",
      "--mail-boundary",
      "Content-Type: text/html; charset=utf-8",
      "",
      '<p onclick="steal()">Hello</p><script>alert(1)</script>',
      "--mail-boundary",
      "Content-Type: text/plain; name=note.txt",
      "Content-Disposition: attachment; filename=note.txt",
      "Content-Transfer-Encoding: base64",
      "",
      "bm90ZQ==",
      "--mail-boundary--",
      "",
    ].join("\r\n"));
    const parsed = parseMimeMessage(raw);
    expect(parsed).toMatchObject({
      messageId: "<message-1@example.test>",
      inReplyTo: "<root@example.test>",
      subject: "Quarterly Update",
      from: [{ address: "customer@example.test", name: "Customer" }],
    });
    expect(parsed.references).toEqual(["<older@example.test>", "<root@example.test>"]);
    expect(parsed.htmlSanitized).toContain("<p>Hello</p>");
    expect(parsed.htmlSanitized).not.toMatch(/script|onclick/i);
    expect(Buffer.from(parsed.attachments[0].content).toString("utf8")).toBe("note");
  });

  it("removes active HTML content and javascript URLs", () => {
    const safe = sanitizeMailHtml('<a href="javascript:alert(1)" onmouseover="x()">Open</a><iframe src="x"></iframe>');
    expect(safe).toBe("<a>Open</a>");
  });
});
