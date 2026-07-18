import request from "supertest";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { createTenantUser, login } from "../../src/auth.js";
import { db, PERMISSIONS, schema } from "../../src/lib.js";
import { DocumentService } from "../../src/platform/documents/service.js";
import type {
  DocumentAccessContext, DocumentPayload,
} from "../../src/platform/documents/types.js";
import { InMemoryEventBus } from "../../src/platform/events/service.js";
import { MailService } from "../../src/modules/mail/service.js";
import { MailCredentialCipher } from "../../src/modules/mail/secrets.js";
import type {
  MailImapConfig, MailImapConnector, MailImapSession, MailSmtpConfig,
  MailSmtpSender, OutboundMailMessage, RemoteMailMessage,
} from "../../src/modules/mail/types.js";
import { getUniversalTimeline } from "../../src/universal-timeline.js";
import { createContact, signupFinanceTenant, type TestTenant } from "../finance/helpers.js";

const encryptionKey = "mail-core-test-encryption-key-2026";
const imapConfig: MailImapConfig = {
  host: "imap.example.test", port: 993, username: "mailbox@example.test",
  password: "imap-secret-value", tls: "implicit",
};
const smtpConfig: MailSmtpConfig = {
  host: "smtp.example.test", port: 465, username: "mailbox@example.test",
  password: "smtp-secret-value", tls: "implicit",
};

function rawMessage(input: {
  id: string; subject: string; from?: string; to?: string;
  inReplyTo?: string; references?: string;
}): Uint8Array {
  return Buffer.from([
    `From: ${input.from ?? "Customer <buyer@example.test>"}`,
    `To: ${input.to ?? "VAKA <mailbox@example.test>"}`,
    `Message-ID: ${input.id}`,
    ...(input.inReplyTo ? [`In-Reply-To: ${input.inReplyTo}`] : []),
    ...(input.references ? [`References: ${input.references}`] : []),
    `Subject: ${input.subject}`,
    "Date: Sat, 18 Jul 2026 10:00:00 +0200",
    "Content-Type: text/plain; charset=utf-8",
    "",
    `Body for ${input.id}`,
  ].join("\r\n"));
}

class MockImapSession implements MailImapSession {
  disconnected = false;

  constructor(private readonly messages: readonly RemoteMailMessage[]) {}

  async listFolders() {
    return [{ name: "Inbox", remoteRef: "INBOX", type: "INBOX" as const }];
  }

  async selectFolder() { return { uidValidity: "uid-validity-1" }; }

  async fetchSince(_remoteRef: string, afterUid: number) {
    return this.messages.filter((message) => message.uid > afterUid);
  }

  async disconnect() { this.disconnected = true; }
}

class MockImapConnector implements MailImapConnector {
  readonly sessions: MockImapSession[] = [];

  constructor(private readonly messages: readonly RemoteMailMessage[]) {}

  async connect(config: MailImapConfig) {
    expect(config).toEqual(imapConfig);
    const session = new MockImapSession(this.messages);
    this.sessions.push(session);
    return session;
  }
}

class MockSmtpSender implements MailSmtpSender {
  readonly sent: Array<{ config: MailSmtpConfig; message: OutboundMailMessage }> = [];

  async send(config: MailSmtpConfig, message: OutboundMailMessage) {
    this.sent.push({ config, message });
    return { providerMessageId: message.messageId };
  }
}

function memoryDocuments() {
  const values = new Map<string, DocumentPayload>();
  return new DocumentService({
    async put(payload: DocumentPayload, context: DocumentAccessContext) {
      expect(payload.descriptor.tenantId).toBe(context.tenantId);
      values.set(payload.descriptor.id, payload);
      return payload.descriptor;
    },
    async get(id: string, context: DocumentAccessContext) {
      const value = values.get(id) ?? null;
      return value?.descriptor.tenantId === context.tenantId ? value : null;
    },
  });
}

function buildService(connector: MailImapConnector, sender: MailSmtpSender) {
  const events = new InMemoryEventBus();
  const service = new MailService({
    imap: connector,
    smtp: sender,
    documents: memoryDocuments(),
    events,
    cipher: new MailCredentialCipher(() => encryptionKey),
    recordAuditInTransaction: async (tx, event) => {
      await tx.insert(schema.auditLogs).values({
        tenantId: event.tenantId,
        userId: event.actorUserId,
        action: event.action,
        entityType: event.entityType,
        entityId: event.entityId,
        metadata: event.metadata,
      });
    },
  });
  return { service, events };
}

async function enableMail(tenant: TestTenant) {
  await db.insert(schema.tenantFeatureFlags).values({
    tenantId: tenant.tenantId,
    featureKey: "mail.hub",
    enabled: true,
    updatedBy: tenant.userId,
  }).onConflictDoUpdate({
    target: [schema.tenantFeatureFlags.tenantId, schema.tenantFeatureFlags.featureKey],
    set: { enabled: true, updatedBy: tenant.userId },
  });
}

describe("P9-001 Mail core integration", () => {
  let tenant: TestTenant;
  let customer: typeof schema.contacts.$inferSelect;
  let accountId: string;
  let service: MailService;
  let events: InMemoryEventBus;
  let imap: MockImapConnector;
  let smtp: MockSmtpSender;

  beforeAll(async () => {
    process.env.MAIL_ENCRYPTION_KEY = encryptionKey;
    tenant = await signupFinanceTenant("mail-core");
    await enableMail(tenant);
    customer = await createContact(tenant, "Mail Customer", {
      email: "buyer@example.test", isCustomer: true, isVendor: false,
    });
    const messages: RemoteMailMessage[] = [
      { uid: 1, raw: rawMessage({ id: "<root@example.test>", subject: "Quarterly Update" }), flags: [], internalDate: new Date("2026-07-18T08:00:00Z") },
      { uid: 2, raw: rawMessage({ id: "<header-reply@example.test>", subject: "Changed subject", inReplyTo: "<root@example.test>", references: "<root@example.test>" }), flags: ["\\Seen"], internalDate: new Date("2026-07-18T08:05:00Z") },
      { uid: 3, raw: rawMessage({ id: "<fallback-reply@example.test>", subject: "Re: Quarterly Update" }), flags: [], internalDate: new Date("2026-07-18T08:10:00Z") },
    ];
    imap = new MockImapConnector(messages);
    smtp = new MockSmtpSender();
    ({ service, events } = buildService(imap, smtp));
    const account = await service.createAccount({
      tenantId: tenant.tenantId, userId: tenant.userId, permissions: PERMISSIONS,
    }, {
      ownerUserId: tenant.userId,
      type: "imap",
      emailAddress: "mailbox@example.test",
      displayName: "VAKA Mailbox",
      imap: imapConfig,
      smtp: smtpConfig,
    });
    accountId = account.id;
  });

  it("encrypts credentials and never exposes them through account views", async () => {
    const [stored] = await db.select().from(schema.mailAccounts).where(eq(schema.mailAccounts.id, accountId));
    expect(stored.imapConfigEncrypted).not.toContain(imapConfig.password);
    expect(stored.smtpConfigEncrypted).not.toContain(smtpConfig.password);
    expect(stored.imapConfigEncrypted).not.toContain(imapConfig.username);
    expect(await service.getAccount({
      tenantId: tenant.tenantId, userId: tenant.userId, permissions: PERMISSIONS,
    }, accountId)).not.toHaveProperty("imapConfigEncrypted");
    const updated = await service.updateAccount({
      tenantId: tenant.tenantId, userId: tenant.userId, permissions: PERMISSIONS,
    }, accountId, { displayName: "VAKA Shared Inbox" });
    expect(updated.displayName).toBe("VAKA Shared Inbox");
    const accountAudits = await db.select().from(schema.auditLogs).where(and(
      eq(schema.auditLogs.tenantId, tenant.tenantId), eq(schema.auditLogs.entityType, "MailAccount"),
    ));
    expect(accountAudits.map((entry) => entry.action)).toEqual(expect.arrayContaining([
      "mail.account_created", "mail.account_updated",
    ]));
    await expect(service.getAccount({
      tenantId: tenant.tenantId, userId: randomUUID(), permissions: ["mail.read"],
    }, accountId)).rejects.toMatchObject({ status: 404 });
  });

  it("incrementally syncs, threads by headers then subject, and auto-links contacts", async () => {
    await service.syncAccount(accountId);
    expect(imap.sessions.at(-1)?.disconnected).toBe(true);

    const storedMessages = await db.select().from(schema.mailMessages).where(and(
      eq(schema.mailMessages.tenantId, tenant.tenantId), eq(schema.mailMessages.accountId, accountId),
    ));
    expect(storedMessages).toHaveLength(3);
    expect(new Set(storedMessages.map((message) => message.threadId)).size).toBe(1);
    expect(storedMessages.find((message) => message.remoteUid === 2)?.isRead).toBe(true);

    const links = await db.select().from(schema.mailObjectLinks).where(and(
      eq(schema.mailObjectLinks.tenantId, tenant.tenantId), eq(schema.mailObjectLinks.objectId, customer.id),
    ));
    expect(links).toHaveLength(3);
    expect(links.every((link) => link.method === "auto" && link.objectType === "Customer")).toBe(true);
    for (const message of storedMessages) {
      expect(events.memoryStore.get(`mail.received:${message.id}`)?.status).toBe("processed");
    }

    await service.syncAccount(accountId);
    const afterSecondSync = await db.select().from(schema.mailMessages).where(eq(schema.mailMessages.accountId, accountId));
    expect(afterSecondSync).toHaveLength(3);
  });

  it("sends and replies with correct headers, persists Sent, audits, and publishes", async () => {
    const actor = { tenantId: tenant.tenantId, userId: tenant.userId, permissions: PERMISSIONS };
    const sent = await service.send(actor, {
      accountId,
      to: [{ address: "recipient@example.test", name: "Recipient" }],
      subject: "New message",
      bodyText: "Hello from VAKA",
    });
    expect(smtp.sent[0].config).toEqual(smtpConfig);
    expect(smtp.sent[0].message).toMatchObject({ inReplyTo: undefined, references: [] });

    const [root] = await db.select().from(schema.mailMessages).where(and(
      eq(schema.mailMessages.accountId, accountId), eq(schema.mailMessages.messageIdHdr, "<root@example.test>"),
    ));
    const reply = await service.reply(actor, root.id, { bodyText: "Reply from VAKA" });
    expect(smtp.sent[1].message.inReplyTo).toBe("<root@example.test>");
    expect(smtp.sent[1].message.references).toEqual(["<root@example.test>"]);
    expect(smtp.sent[1].message.subject).toBe("Re: Quarterly Update");
    expect(reply.threadId).toBe(root.threadId);
    expect(events.memoryStore.get(`mail.sent:${sent.id}`)?.status).toBe("processed");
    expect(events.memoryStore.get(`mail.sent:${reply.id}`)?.status).toBe("processed");

    const [sentFolder] = await db.select().from(schema.mailFolders).where(and(
      eq(schema.mailFolders.accountId, accountId), eq(schema.mailFolders.type, "SENT"),
    ));
    expect(sentFolder).toBeTruthy();
    const audits = await db.select().from(schema.auditLogs).where(and(
      eq(schema.auditLogs.tenantId, tenant.tenantId), eq(schema.auditLogs.action, "mail.message_sent"),
    ));
    expect(audits).toHaveLength(2);
  });

  it("places linked mail in the timeline only for an authorised mailbox viewer", async () => {
    const actor = { tenantId: tenant.tenantId, userId: tenant.userId, permissions: PERMISSIONS };
    const [thread] = await db.select().from(schema.mailThreads).where(and(
      eq(schema.mailThreads.accountId, accountId), eq(schema.mailThreads.subjectNormalized, "quarterly update"),
    ));
    await service.linkThread(actor, thread.id, "Customer", customer.id);

    const visible = await getUniversalTimeline(tenant.tenantId, "Customer", customer.id, {
      page: 1, pageSize: 100,
    }, { userId: tenant.userId, permissions: ["crm.read", "mail.read"] });
    expect(visible.entries.filter((entry) => entry.kind === "mail")).toHaveLength(4);
    expect(visible.entries.find((entry) => entry.kind === "mail")?.details).not.toHaveProperty("bodyText");

    const hidden = await getUniversalTimeline(tenant.tenantId, "Customer", customer.id, {
      page: 1, pageSize: 100,
    }, { userId: tenant.userId, permissions: ["crm.read"] });
    expect(hidden.entries.some((entry) => entry.kind === "mail")).toBe(false);
  });

  it("keeps account APIs tenant scoped, permission checked, and secret free", async () => {
    const app = createApp();
    const response = await request(app).get(`/api/v1/mail/accounts/${accountId}`).set(tenant.auth);
    expect(response.status).toBe(200);
    expect(response.body).not.toHaveProperty("imapConfigEncrypted");
    expect(JSON.stringify(response.body)).not.toContain("secret-value");

    const other = await signupFinanceTenant("mail-other");
    await enableMail(other);
    const crossTenant = await request(app).get(`/api/v1/mail/accounts/${accountId}`).set(other.auth);
    expect(crossTenant.status).toBe(404);

    const [staffRole] = await db.select().from(schema.roles).where(and(
      eq(schema.roles.tenantId, tenant.tenantId), eq(schema.roles.name, "Staff"),
    ));
    const staffPassword = "Mail-Staff-Test-123!";
    const staffEmail = `mail-staff-${Date.now()}@test.zw`;
    const created = await createTenantUser({
      tenantId: tenant.tenantId,
      actorUserId: tenant.userId,
      email: staffEmail,
      fullName: "Mail Staff",
      roleId: staffRole.id,
      initialPassword: staffPassword,
    });
    await db.update(schema.users).set({ mustChangePassword: false }).where(eq(schema.users.id, created.user.id));
    const staff = await login(staffEmail, staffPassword);
    const denied = await request(app).get("/api/v1/mail/accounts")
      .set({ Authorization: `Bearer ${staff.token}` });
    expect(denied.status).toBe(403);
  });

  it("turns disconnect and provider failures into mailbox error state", async () => {
    const failing = buildService({
      async connect() { throw new Error("provider offline"); },
    }, smtp).service;
    await expect(failing.syncAccount(accountId)).resolves.toBeUndefined();
    const [account] = await db.select().from(schema.mailAccounts).where(eq(schema.mailAccounts.id, accountId));
    expect(account.syncStatus).toBe("ERROR");
  });
});
