import { randomUUID } from "node:crypto";
import {
  and, desc, eq, ilike, inArray, isNull, ne, or, sql,
} from "drizzle-orm";
import {
  badRequest, conflict, db, forbidden, notFound, schema,
} from "../../lib.js";
import type { AuditEvent } from "../../platform/audit/types.js";
import type { DocumentServiceContract } from "../../platform/documents/interfaces.js";
import type { EventBusContract } from "../../platform/events/interfaces.js";
import { logEvent } from "../../observability.js";
import { mailAttachmentDocumentId } from "../../documents.js";
import { MailCredentialCipher } from "./secrets.js";
import { parseMimeMessage, sanitizeMailHtml } from "./mime.js";
import { normaliseSubject, replyReferences, replySubject } from "./threading.js";
import type {
  MailAccountSecrets, MailAccountType, MailAccountView, MailActor, MailAddress,
  MailImapConfig, MailImapConnector, MailSmtpConfig, MailSmtpSender,
  OutboundMailAttachment, ParsedMailMessage, RemoteMailFolder, RemoteMailMessage,
} from "./types.js";

type MailTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type MailAuditRecorder = (transaction: MailTransaction, event: AuditEvent) => Promise<void>;

export interface MailServiceDependencies {
  imap: MailImapConnector;
  smtp: MailSmtpSender;
  documents: DocumentServiceContract;
  events: EventBusContract;
  recordAuditInTransaction: MailAuditRecorder;
  cipher?: MailCredentialCipher;
  now?: () => Date;
}

export interface CreateMailAccountInput {
  ownerUserId: string;
  type: MailAccountType;
  emailAddress: string;
  displayName: string;
  imap: MailImapConfig;
  smtp: MailSmtpConfig;
}

export type UpdateMailAccountInput = Partial<CreateMailAccountInput> & { syncStatus?: "IDLE" | "DISABLED" };

export interface SendMailInput {
  accountId: string;
  to: MailAddress[];
  cc?: MailAddress[];
  subject: string;
  bodyText?: string;
  bodyHtml?: string;
  attachmentDocumentIds?: string[];
}

export interface ReplyMailInput {
  bodyText?: string;
  bodyHtml?: string;
  cc?: MailAddress[];
  attachmentDocumentIds?: string[];
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SUPPORTED_LINK_TYPES = [
  "Company", "Customer", "Supplier", "Invoice", "Payment", "Product", "Employee", "User",
] as const;
type SupportedLinkType = typeof SUPPORTED_LINK_TYPES[number];

function normaliseAddress(value: string): string {
  return value.trim().toLowerCase();
}

function viewAccount(account: typeof schema.mailAccounts.$inferSelect): MailAccountView {
  return {
    id: account.id,
    tenantId: account.tenantId,
    ownerUserId: account.ownerUserId,
    type: account.type,
    emailAddress: account.emailAddress,
    displayName: account.displayName,
    syncStatus: account.syncStatus,
    lastSyncAt: account.lastSyncAt,
    imapConfigured: true,
    smtpConfigured: true,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  };
}

function validateProviderConfig(config: MailImapConfig | MailSmtpConfig, label: string): void {
  if (!config.host.trim() || /\s/.test(config.host) || config.host.length > 253) {
    throw badRequest(`${label} host is invalid`);
  }
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65_535) {
    throw badRequest(`${label} port is invalid`);
  }
  if (!config.username.trim() || !config.password || config.username.length > 500 || config.password.length > 2_000) {
    throw badRequest(`${label} credentials are incomplete`);
  }
  if (!(["implicit", "starttls", "none"] as const).includes(config.tls)) {
    throw badRequest(`${label} TLS mode is invalid`);
  }
  if (process.env.NODE_ENV === "production" && config.tls === "none") {
    throw badRequest(`${label} TLS cannot be disabled in production`);
  }
}

function validateAddresses(addresses: readonly MailAddress[], required: boolean): MailAddress[] {
  const normalised = addresses.map((entry) => ({
    address: normaliseAddress(entry.address),
    ...(entry.name?.trim() ? { name: entry.name.trim().slice(0, 160) } : {}),
  }));
  if ((required && normalised.length === 0) || normalised.length > 100
    || normalised.some((entry) => !EMAIL_PATTERN.test(entry.address))) {
    throw badRequest("Mail recipients are invalid");
  }
  return normalised;
}

function assertMailboxPermission(
  actor: MailActor,
  account: typeof schema.mailAccounts.$inferSelect,
  operation: "read" | "send" | "manage",
): void {
  const permission = `mail.${operation}`;
  const manages = actor.permissions.includes("mail.manage");
  if (!manages && !actor.permissions.includes(permission)) throw forbidden(`Missing permission: ${permission}`);
  if (operation === "manage") return;
  if (manages || account.ownerUserId === actor.userId || account.type === "shared") return;
  throw notFound("Mail account not found");
}

function messageIdFor(address: string): string {
  const domain = address.split("@")[1]?.replace(/[^a-z0-9.-]/gi, "") || "vaka.local";
  return `<${randomUUID()}@${domain}>`;
}

export class MailService {
  private readonly cipher: MailCredentialCipher;
  private readonly now: () => Date;

  constructor(private readonly dependencies: MailServiceDependencies) {
    this.cipher = dependencies.cipher ?? new MailCredentialCipher();
    this.now = dependencies.now ?? (() => new Date());
  }

  async createAccount(actor: MailActor, input: CreateMailAccountInput): Promise<MailAccountView> {
    if (!actor.permissions.includes("mail.manage")) throw forbidden("Missing permission: mail.manage");
    const emailAddress = normaliseAddress(input.emailAddress);
    if (!EMAIL_PATTERN.test(emailAddress)) throw badRequest("Mailbox email address is invalid");
    if (!input.displayName.trim() || input.displayName.trim().length > 160) throw badRequest("Mailbox display name is invalid");
    validateProviderConfig(input.imap, "IMAP");
    validateProviderConfig(input.smtp, "SMTP");
    const imapConfigEncrypted = this.cipher.encrypt(input.imap);
    const smtpConfigEncrypted = this.cipher.encrypt(input.smtp);
    return db.transaction(async (tx) => {
      const [owner] = await tx.select({ id: schema.users.id }).from(schema.users).where(and(
        eq(schema.users.id, input.ownerUserId), eq(schema.users.tenantId, actor.tenantId), eq(schema.users.status, "active"),
      ));
      if (!owner) throw badRequest("Mailbox owner must be an active tenant user");
      const [created] = await tx.insert(schema.mailAccounts).values({
        tenantId: actor.tenantId,
        ownerUserId: input.ownerUserId,
        type: input.type,
        emailAddress,
        displayName: input.displayName.trim(),
        imapConfigEncrypted,
        smtpConfigEncrypted,
      }).returning();
      await this.dependencies.recordAuditInTransaction(tx, {
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        action: "mail.account_created",
        entityType: "MailAccount",
        entityId: created.id,
        metadata: { ownerUserId: created.ownerUserId, type: created.type, emailAddress: created.emailAddress },
      });
      return viewAccount(created);
    });
  }

  async listAccounts(actor: MailActor): Promise<MailAccountView[]> {
    if (!actor.permissions.some((permission) => permission === "mail.read" || permission === "mail.manage")) {
      throw forbidden("Missing one of permissions: mail.read, mail.manage");
    }
    const manages = actor.permissions.includes("mail.manage");
    const rows = await db.select().from(schema.mailAccounts).where(and(
      eq(schema.mailAccounts.tenantId, actor.tenantId),
      manages ? undefined : or(eq(schema.mailAccounts.ownerUserId, actor.userId), eq(schema.mailAccounts.type, "shared")),
    )).orderBy(schema.mailAccounts.emailAddress);
    return rows.map(viewAccount);
  }

  async getAccount(actor: MailActor, accountId: string, operation: "read" | "send" | "manage" = "read") {
    const account = await this.account(actor.tenantId, accountId);
    assertMailboxPermission(actor, account, operation);
    return viewAccount(account);
  }

  async updateAccount(actor: MailActor, accountId: string, input: UpdateMailAccountInput): Promise<MailAccountView> {
    const existing = await this.account(actor.tenantId, accountId);
    assertMailboxPermission(actor, existing, "manage");
    const emailAddress = input.emailAddress === undefined ? existing.emailAddress : normaliseAddress(input.emailAddress);
    if (!EMAIL_PATTERN.test(emailAddress)) throw badRequest("Mailbox email address is invalid");
    if (input.displayName !== undefined && (!input.displayName.trim() || input.displayName.trim().length > 160)) {
      throw badRequest("Mailbox display name is invalid");
    }
    if (input.imap) validateProviderConfig(input.imap, "IMAP");
    if (input.smtp) validateProviderConfig(input.smtp, "SMTP");
    return db.transaction(async (tx) => {
      if (input.ownerUserId) {
        const [owner] = await tx.select({ id: schema.users.id }).from(schema.users).where(and(
          eq(schema.users.id, input.ownerUserId), eq(schema.users.tenantId, actor.tenantId), eq(schema.users.status, "active"),
        ));
        if (!owner) throw badRequest("Mailbox owner must be an active tenant user");
      }
      const [updated] = await tx.update(schema.mailAccounts).set({
        ownerUserId: input.ownerUserId,
        type: input.type,
        emailAddress,
        displayName: input.displayName?.trim(),
        imapConfigEncrypted: input.imap ? this.cipher.encrypt(input.imap) : undefined,
        smtpConfigEncrypted: input.smtp ? this.cipher.encrypt(input.smtp) : undefined,
        syncStatus: input.syncStatus,
        updatedAt: this.now(),
      }).where(and(eq(schema.mailAccounts.id, accountId), eq(schema.mailAccounts.tenantId, actor.tenantId))).returning();
      await this.dependencies.recordAuditInTransaction(tx, {
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        action: "mail.account_updated",
        entityType: "MailAccount",
        entityId: accountId,
        metadata: {
          fields: Object.keys(input).filter((key) => key !== "imap" && key !== "smtp"),
          imapCredentialsChanged: Boolean(input.imap),
          smtpCredentialsChanged: Boolean(input.smtp),
        },
      });
      return viewAccount(updated);
    });
  }

  async deleteAccount(actor: MailActor, accountId: string): Promise<{ deleted: true }> {
    const existing = await this.account(actor.tenantId, accountId);
    assertMailboxPermission(actor, existing, "manage");
    return db.transaction(async (tx) => {
      const [usage] = await tx.select({ count: sql<number>`count(*)::int` }).from(schema.mailMessages).where(and(
        eq(schema.mailMessages.tenantId, actor.tenantId), eq(schema.mailMessages.accountId, accountId),
      ));
      if ((usage?.count ?? 0) > 0) throw conflict("A mailbox with stored messages cannot be deleted; disable it instead");
      await tx.delete(schema.mailThreads).where(and(eq(schema.mailThreads.tenantId, actor.tenantId), eq(schema.mailThreads.accountId, accountId)));
      await tx.delete(schema.mailFolders).where(and(eq(schema.mailFolders.tenantId, actor.tenantId), eq(schema.mailFolders.accountId, accountId)));
      await tx.delete(schema.mailAccounts).where(and(eq(schema.mailAccounts.tenantId, actor.tenantId), eq(schema.mailAccounts.id, accountId)));
      await this.dependencies.recordAuditInTransaction(tx, {
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        action: "mail.account_deleted",
        entityType: "MailAccount",
        entityId: accountId,
        metadata: { ownerUserId: existing.ownerUserId, type: existing.type, emailAddress: existing.emailAddress },
      });
      return { deleted: true };
    });
  }

  async listThreads(actor: MailActor, query: {
    accountId: string; folder?: string; q?: string; page: number; pageSize: number;
  }) {
    const account = await this.account(actor.tenantId, query.accountId);
    assertMailboxPermission(actor, account, "read");
    const offset = (query.page - 1) * query.pageSize;
    const folderFilter = query.folder ? sql`EXISTS (
      SELECT 1 FROM mail_messages message
      INNER JOIN mail_folders folder ON folder.id = message.folder_id
      WHERE message.thread_id = ${schema.mailThreads.id}
        AND message.tenant_id = ${actor.tenantId}
        AND (folder.id::text = ${query.folder} OR folder.remote_ref = ${query.folder} OR folder.type = upper(${query.folder}))
    )` : undefined;
    const searchFilter = query.q?.trim()
      ? or(ilike(schema.mailThreads.subjectNormalized, `%${query.q.trim()}%`), sql`EXISTS (
        SELECT 1 FROM mail_messages message
         WHERE message.thread_id = ${schema.mailThreads.id}
           AND message.tenant_id = ${actor.tenantId}
           AND (message.subject ILIKE ${`%${query.q.trim()}%`} OR message.body_text ILIKE ${`%${query.q.trim()}%`})
      )`) : undefined;
    const where = and(
      eq(schema.mailThreads.tenantId, actor.tenantId),
      eq(schema.mailThreads.accountId, query.accountId), folderFilter, searchFilter,
    );
    const [threads, count] = await Promise.all([
      db.select().from(schema.mailThreads).where(where)
        .orderBy(desc(schema.mailThreads.lastMessageAt), desc(schema.mailThreads.id))
        .limit(query.pageSize).offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(schema.mailThreads).where(where),
    ]);
    const total = count[0]?.count ?? 0;
    return { threads, page: query.page, pageSize: query.pageSize, total, hasMore: offset + query.pageSize < total };
  }

  async getThread(actor: MailActor, threadId: string) {
    const [thread] = await db.select().from(schema.mailThreads).where(and(
      eq(schema.mailThreads.id, threadId), eq(schema.mailThreads.tenantId, actor.tenantId),
    ));
    if (!thread) throw notFound("Mail thread not found");
    const account = await this.account(actor.tenantId, thread.accountId);
    assertMailboxPermission(actor, account, "read");
    const messages = await db.select({ message: schema.mailMessages, folder: schema.mailFolders })
      .from(schema.mailMessages)
      .innerJoin(schema.mailFolders, eq(schema.mailFolders.id, schema.mailMessages.folderId))
      .where(and(eq(schema.mailMessages.tenantId, actor.tenantId), eq(schema.mailMessages.threadId, threadId)))
      .orderBy(schema.mailMessages.receivedAt, schema.mailMessages.sentAt, schema.mailMessages.createdAt);
    const messageIds = messages.map(({ message }) => message.id);
    const [attachments, links] = await Promise.all([
      messageIds.length ? db.select().from(schema.mailAttachments).where(and(
        eq(schema.mailAttachments.tenantId, actor.tenantId), inArray(schema.mailAttachments.messageId, messageIds),
      )) : Promise.resolve([]),
      db.select().from(schema.mailObjectLinks).where(and(
        eq(schema.mailObjectLinks.tenantId, actor.tenantId),
        or(
          eq(schema.mailObjectLinks.threadId, threadId),
          messageIds.length ? inArray(schema.mailObjectLinks.messageId, messageIds) : undefined,
        ),
      )),
    ]);
    const attachmentMap = new Map<string, typeof attachments>();
    for (const attachment of attachments) {
      const current = attachmentMap.get(attachment.messageId) ?? [];
      current.push(attachment);
      attachmentMap.set(attachment.messageId, current);
    }
    return {
      thread,
      messages: messages.map(({ message, folder }) => ({
        ...message,
        folder: { id: folder.id, name: folder.name, type: folder.type },
        attachments: attachmentMap.get(message.id) ?? [],
      })),
      links,
    };
  }

  async send(actor: MailActor, input: SendMailInput) {
    const account = await this.account(actor.tenantId, input.accountId);
    assertMailboxPermission(actor, account, "send");
    return this.sendOutbound(actor, account, {
      to: validateAddresses(input.to, true),
      cc: validateAddresses(input.cc ?? [], false),
      subject: input.subject.trim().slice(0, 998),
      bodyText: input.bodyText,
      bodyHtml: input.bodyHtml,
      attachmentDocumentIds: input.attachmentDocumentIds ?? [],
    });
  }

  async reply(actor: MailActor, messageId: string, input: ReplyMailInput) {
    const [original] = await db.select().from(schema.mailMessages).where(and(
      eq(schema.mailMessages.id, messageId), eq(schema.mailMessages.tenantId, actor.tenantId),
    ));
    if (!original) throw notFound("Mail message not found");
    const account = await this.account(actor.tenantId, original.accountId);
    assertMailboxPermission(actor, account, "send");
    const own = normaliseAddress(account.emailAddress);
    const candidates = original.direction === "inbound" ? original.fromJson : original.toJson;
    const to = candidates.filter((address) => normaliseAddress(address.address) !== own);
    if (!to.length) throw badRequest("Reply recipient cannot be established");
    return this.sendOutbound(actor, account, {
      to: validateAddresses(to, true),
      cc: validateAddresses(input.cc ?? [], false),
      subject: replySubject(original.subject),
      bodyText: input.bodyText,
      bodyHtml: input.bodyHtml,
      attachmentDocumentIds: input.attachmentDocumentIds ?? [],
      threadId: original.threadId,
      inReplyTo: original.messageIdHdr,
      references: replyReferences(original.referencesJson, original.messageIdHdr),
    });
  }

  async linkThread(actor: MailActor, threadId: string, objectType: string, objectId: string) {
    const type = SUPPORTED_LINK_TYPES.find((candidate) => candidate.toLowerCase() === objectType.trim().toLowerCase());
    if (!type) throw badRequest("Unsupported mail link object type");
    const [thread] = await db.select().from(schema.mailThreads).where(and(
      eq(schema.mailThreads.id, threadId), eq(schema.mailThreads.tenantId, actor.tenantId),
    ));
    if (!thread) throw notFound("Mail thread not found");
    const account = await this.account(actor.tenantId, thread.accountId);
    assertMailboxPermission(actor, account, "send");
    await this.assertObjectExists(actor.tenantId, type, objectId);
    return db.transaction(async (tx) => {
      const [link] = await tx.insert(schema.mailObjectLinks).values({
        tenantId: actor.tenantId,
        accountId: thread.accountId,
        threadId,
        objectType: type,
        objectId,
        linkedBy: actor.userId,
        method: "manual",
      }).onConflictDoNothing().returning();
      await this.dependencies.recordAuditInTransaction(tx, {
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        action: "mail.thread_linked",
        entityType: "MailThread",
        entityId: threadId,
        metadata: { objectType: type, objectId },
      });
      return link ?? { threadId, objectType: type, objectId, method: "manual" as const };
    });
  }

  async syncAll(): Promise<void> {
    const accounts = await db.select({ id: schema.mailAccounts.id }).from(schema.mailAccounts)
      .innerJoin(schema.tenantFeatureFlags, and(
        eq(schema.tenantFeatureFlags.tenantId, schema.mailAccounts.tenantId),
        eq(schema.tenantFeatureFlags.featureKey, "mail.hub"),
        eq(schema.tenantFeatureFlags.enabled, true),
      )).where(ne(schema.mailAccounts.syncStatus, "DISABLED"));
    for (const account of accounts) await this.syncAccount(account.id);
  }

  async syncAccount(accountId: string): Promise<void> {
    const [account] = await db.select().from(schema.mailAccounts).where(eq(schema.mailAccounts.id, accountId));
    if (!account || account.syncStatus === "DISABLED") return;
    await db.update(schema.mailAccounts).set({ syncStatus: "SYNCING", updatedAt: this.now() })
      .where(and(eq(schema.mailAccounts.id, account.id), eq(schema.mailAccounts.tenantId, account.tenantId)));
    let session: Awaited<ReturnType<MailImapConnector["connect"]>> | null = null;
    try {
      const config = this.cipher.decrypt<MailImapConfig>(account.imapConfigEncrypted);
      validateProviderConfig(config, "IMAP");
      session = await this.dependencies.imap.connect(config);
      const remoteFolders = await session.listFolders();
      for (const remoteFolder of remoteFolders) {
        const folder = await this.ensureRemoteFolder(account, remoteFolder);
        const selection = await session.selectFolder(remoteFolder.remoteRef);
        let afterUid = folder.lastUid;
        if (folder.uidValidity !== selection.uidValidity) {
          afterUid = 0;
          await db.update(schema.mailFolders).set({ uidValidity: selection.uidValidity, lastUid: 0 }).where(and(
            eq(schema.mailFolders.id, folder.id), eq(schema.mailFolders.tenantId, account.tenantId),
          ));
        }
        const messages = await session.fetchSince(remoteFolder.remoteRef, afterUid);
        for (const remote of [...messages].sort((left, right) => left.uid - right.uid)) {
          await this.ingestRemote(account, { ...folder, uidValidity: selection.uidValidity }, remote);
        }
      }
      await db.update(schema.mailAccounts).set({ syncStatus: "IDLE", lastSyncAt: this.now(), updatedAt: this.now() })
        .where(and(eq(schema.mailAccounts.id, account.id), eq(schema.mailAccounts.tenantId, account.tenantId)));
    } catch (error) {
      await db.update(schema.mailAccounts).set({ syncStatus: "ERROR", updatedAt: this.now() })
        .where(and(eq(schema.mailAccounts.id, account.id), eq(schema.mailAccounts.tenantId, account.tenantId)));
      logEvent("mail.sync_failed", {
        accountId: account.id,
        tenantId: account.tenantId,
        errorType: error instanceof Error ? error.name : "UnknownError",
      }, "warn");
    } finally {
      if (session) {
        try { await session.disconnect(); } catch { /* disconnect failure must not escape sync */ }
      }
    }
  }

  private async sendOutbound(
    actor: MailActor,
    account: typeof schema.mailAccounts.$inferSelect,
    input: {
      to: MailAddress[]; cc: MailAddress[]; subject: string; bodyText?: string; bodyHtml?: string;
      attachmentDocumentIds: string[]; threadId?: string; inReplyTo?: string; references?: string[];
    },
  ) {
    if (!input.bodyText?.trim() && !input.bodyHtml?.trim()) throw badRequest("Mail body is required");
    if (input.attachmentDocumentIds.length > 10) throw badRequest("A message can contain at most 10 attachments");
    const attachments = await this.loadAttachments(actor, input.attachmentDocumentIds);
    const smtpConfig = this.cipher.decrypt<MailSmtpConfig>(account.smtpConfigEncrypted);
    validateProviderConfig(smtpConfig, "SMTP");
    const messageId = messageIdFor(account.emailAddress);
    const sentAt = this.now();
    const html = input.bodyHtml ? sanitizeMailHtml(input.bodyHtml) : undefined;
    await this.dependencies.smtp.send(smtpConfig, {
      from: { address: account.emailAddress, name: account.displayName },
      to: input.to,
      cc: input.cc,
      subject: input.subject,
      text: input.bodyText?.trim() || undefined,
      html,
      messageId,
      inReplyTo: input.inReplyTo,
      references: input.references ?? [],
      attachments,
    });
    const saved = await db.transaction(async (tx) => {
      const folder = await this.ensureSentFolder(tx, account);
      let threadId = input.threadId;
      if (!threadId) {
        const [thread] = await tx.insert(schema.mailThreads).values({
          tenantId: actor.tenantId,
          accountId: account.id,
          subjectNormalized: normaliseSubject(input.subject),
          lastMessageAt: sentAt,
          messageCount: 0,
        }).returning({ id: schema.mailThreads.id });
        threadId = thread.id;
      }
      const [message] = await tx.insert(schema.mailMessages).values({
        tenantId: actor.tenantId,
        accountId: account.id,
        threadId,
        folderId: folder.id,
        messageIdHdr: messageId,
        inReplyTo: input.inReplyTo,
        referencesJson: input.references ?? [],
        fromJson: [{ address: account.emailAddress, name: account.displayName }],
        toJson: input.to,
        ccJson: input.cc,
        subject: input.subject,
        bodyText: input.bodyText?.trim() || null,
        bodyHtmlSanitized: html ?? null,
        sentAt,
        isRead: true,
        isDraft: false,
        direction: "outbound",
      }).returning();
      if (attachments.length) await tx.insert(schema.mailAttachments).values(attachments.map((attachment) => ({
        tenantId: actor.tenantId,
        accountId: account.id,
        messageId: message.id,
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        size: attachment.content.byteLength,
        documentId: attachment.documentId,
      })));
      await tx.update(schema.mailThreads).set({
        lastMessageAt: sentAt,
        messageCount: sql`${schema.mailThreads.messageCount} + 1`,
      }).where(and(eq(schema.mailThreads.id, threadId), eq(schema.mailThreads.tenantId, actor.tenantId)));
      await this.dependencies.recordAuditInTransaction(tx, {
        tenantId: actor.tenantId,
        actorUserId: actor.userId,
        action: "mail.message_sent",
        entityType: "MailMessage",
        entityId: message.id,
        metadata: { accountId: account.id, threadId, attachmentCount: attachments.length },
      });
      return message;
    });
    await this.publishSafely({
      id: `mail.sent:${saved.id}`,
      type: "mail.sent",
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      occurredAt: sentAt,
      payload: { accountId: account.id, messageId: saved.id, threadId: saved.threadId },
    });
    return saved;
  }

  private async loadAttachments(actor: MailActor, documentIds: readonly string[]): Promise<OutboundMailAttachment[]> {
    const attachments: OutboundMailAttachment[] = [];
    for (const documentId of [...new Set(documentIds)]) {
      const document = await this.dependencies.documents.get(documentId, {
        tenantId: actor.tenantId, actorUserId: actor.userId,
      });
      if (!document) throw notFound("Attachment document not found");
      attachments.push({
        filename: document.descriptor.fileName,
        mimeType: document.descriptor.mediaType,
        content: document.bytes,
        documentId,
      });
    }
    return attachments;
  }

  private async ingestRemote(
    account: typeof schema.mailAccounts.$inferSelect,
    folder: typeof schema.mailFolders.$inferSelect,
    remote: RemoteMailMessage,
  ): Promise<void> {
    const parsed = parseMimeMessage(remote.raw);
    const uidValidity = folder.uidValidity ?? "unknown";
    const messageId = parsed.messageId ?? `<imap-${account.id}-${uidValidity}-${remote.uid}@vaka.local>`;
    const [duplicate] = await db.select({ id: schema.mailMessages.id }).from(schema.mailMessages).where(and(
      eq(schema.mailMessages.accountId, account.id),
      or(eq(schema.mailMessages.messageIdHdr, messageId), and(
        eq(schema.mailMessages.folderId, folder.id),
        eq(schema.mailMessages.remoteUidValidity, uidValidity),
        eq(schema.mailMessages.remoteUid, remote.uid),
      )),
    ));
    if (duplicate) {
      await this.advanceFolder(folder, remote.uid);
      return;
    }
    const documentAttachments = await this.storeInboundAttachments(account, parsed);
    const receivedAt = remote.internalDate;
    const direction = folder.type === "SENT" ? "outbound" : "inbound";
    const saved = await db.transaction(async (tx) => {
      const threadId = await this.resolveThread(tx, account, parsed);
      const [message] = await tx.insert(schema.mailMessages).values({
        tenantId: account.tenantId,
        accountId: account.id,
        threadId,
        folderId: folder.id,
        remoteUid: remote.uid,
        remoteUidValidity: uidValidity,
        messageIdHdr: messageId,
        inReplyTo: parsed.inReplyTo,
        referencesJson: parsed.references,
        fromJson: parsed.from,
        toJson: parsed.to,
        ccJson: parsed.cc,
        subject: parsed.subject,
        bodyText: parsed.text,
        bodyHtmlSanitized: parsed.htmlSanitized,
        sentAt: parsed.sentAt ?? (direction === "outbound" ? receivedAt : null),
        receivedAt: direction === "inbound" ? receivedAt : null,
        isRead: remote.flags.some((flag) => flag.toLowerCase() === "\\seen"),
        isDraft: remote.flags.some((flag) => flag.toLowerCase() === "\\draft"),
        direction,
      }).returning();
      if (documentAttachments.length) await tx.insert(schema.mailAttachments).values(documentAttachments.map((attachment) => ({
        tenantId: account.tenantId,
        accountId: account.id,
        messageId: message.id,
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        size: attachment.size,
        documentId: attachment.documentId,
      })));
      await this.autoLink(tx, account, message.id, parsed);
      await tx.update(schema.mailThreads).set({
        lastMessageAt: receivedAt,
        messageCount: sql`${schema.mailThreads.messageCount} + 1`,
      }).where(and(eq(schema.mailThreads.id, threadId), eq(schema.mailThreads.tenantId, account.tenantId)));
      await tx.update(schema.mailFolders).set({ lastUid: remote.uid, uidValidity }).where(and(
        eq(schema.mailFolders.id, folder.id), eq(schema.mailFolders.tenantId, account.tenantId),
      ));
      return message;
    });
    if (direction === "inbound") await this.publishSafely({
      id: `mail.received:${saved.id}`,
      type: "mail.received",
      tenantId: account.tenantId,
      actorUserId: null,
      occurredAt: receivedAt,
      payload: { accountId: account.id, messageId: saved.id, threadId: saved.threadId },
    });
  }

  private async storeInboundAttachments(account: typeof schema.mailAccounts.$inferSelect, parsed: ParsedMailMessage) {
    const stored: Array<{ filename: string; mimeType: string; size: number; documentId: string }> = [];
    for (const attachment of parsed.attachments) {
      const documentId = mailAttachmentDocumentId(randomUUID());
      const descriptor = await this.dependencies.documents.put({
        descriptor: {
          id: documentId,
          tenantId: account.tenantId,
          kind: "mail-attachment",
          classification: "CORRESPONDENCE",
          fileName: attachment.filename,
          mediaType: attachment.mimeType,
          byteSize: attachment.content.byteLength,
          createdAt: this.now(),
        },
        bytes: attachment.content,
      }, { tenantId: account.tenantId, actorUserId: account.ownerUserId });
      stored.push({
        filename: descriptor.fileName,
        mimeType: descriptor.mediaType,
        size: descriptor.byteSize,
        documentId: descriptor.id,
      });
    }
    return stored;
  }

  private async resolveThread(
    tx: MailTransaction,
    account: typeof schema.mailAccounts.$inferSelect,
    parsed: ParsedMailMessage,
  ): Promise<string> {
    const references = [...new Set([...parsed.references, ...(parsed.inReplyTo ? [parsed.inReplyTo] : [])])];
    if (references.length) {
      const [linked] = await tx.select({ threadId: schema.mailMessages.threadId }).from(schema.mailMessages).where(and(
        eq(schema.mailMessages.tenantId, account.tenantId), eq(schema.mailMessages.accountId, account.id),
        inArray(schema.mailMessages.messageIdHdr, references),
      )).orderBy(desc(schema.mailMessages.createdAt)).limit(1);
      if (linked) return linked.threadId;
    }
    const subject = normaliseSubject(parsed.subject);
    const [fallback] = await tx.select({ id: schema.mailThreads.id }).from(schema.mailThreads).where(and(
      eq(schema.mailThreads.tenantId, account.tenantId), eq(schema.mailThreads.accountId, account.id),
      eq(schema.mailThreads.subjectNormalized, subject),
    )).orderBy(desc(schema.mailThreads.lastMessageAt)).limit(1);
    if (fallback) return fallback.id;
    const [created] = await tx.insert(schema.mailThreads).values({
      tenantId: account.tenantId,
      accountId: account.id,
      subjectNormalized: subject,
      lastMessageAt: parsed.sentAt ?? this.now(),
      messageCount: 0,
    }).returning({ id: schema.mailThreads.id });
    return created.id;
  }

  private async autoLink(
    tx: MailTransaction,
    account: typeof schema.mailAccounts.$inferSelect,
    messageId: string,
    parsed: ParsedMailMessage,
  ): Promise<void> {
    const addresses = [...new Set([...parsed.from, ...parsed.to, ...parsed.cc]
      .map((address) => normaliseAddress(address.address))
      .filter((address) => address !== normaliseAddress(account.emailAddress)))];
    if (!addresses.length) return;
    const contacts = await tx.select({
      id: schema.contacts.id,
      isCustomer: schema.contacts.isCustomer,
      isVendor: schema.contacts.isVendor,
    }).from(schema.contacts).where(and(
      eq(schema.contacts.tenantId, account.tenantId), isNull(schema.contacts.deletedAt),
      inArray(sql<string>`lower(${schema.contacts.email})`, addresses),
    ));
    const values = contacts.flatMap((contact) => [
      ...(contact.isCustomer ? [{ objectType: "Customer" }] : []),
      ...(contact.isVendor ? [{ objectType: "Supplier" }] : []),
    ].map(({ objectType }) => ({
      tenantId: account.tenantId,
      accountId: account.id,
      messageId,
      objectType,
      objectId: contact.id,
      linkedBy: account.ownerUserId,
      method: "auto" as const,
    })));
    if (values.length) await tx.insert(schema.mailObjectLinks).values(values).onConflictDoNothing();
  }

  private async ensureRemoteFolder(
    account: typeof schema.mailAccounts.$inferSelect,
    remote: RemoteMailFolder,
  ) {
    const [folder] = await db.insert(schema.mailFolders).values({
      tenantId: account.tenantId,
      accountId: account.id,
      name: remote.name.slice(0, 255),
      remoteRef: remote.remoteRef.slice(0, 1_000),
      type: remote.type,
    }).onConflictDoUpdate({
      target: [schema.mailFolders.accountId, schema.mailFolders.remoteRef],
      set: { name: remote.name.slice(0, 255), type: remote.type },
    }).returning();
    return folder;
  }

  private async ensureSentFolder(tx: MailTransaction, account: typeof schema.mailAccounts.$inferSelect) {
    const [folder] = await tx.insert(schema.mailFolders).values({
      tenantId: account.tenantId,
      accountId: account.id,
      name: "Sent",
      remoteRef: "__vaka_sent__",
      type: "SENT",
    }).onConflictDoUpdate({
      target: [schema.mailFolders.accountId, schema.mailFolders.remoteRef],
      set: { name: "Sent", type: "SENT" },
    }).returning();
    return folder;
  }

  private advanceFolder(folder: typeof schema.mailFolders.$inferSelect, uid: number): Promise<unknown> {
    return db.update(schema.mailFolders).set({ lastUid: uid }).where(and(
      eq(schema.mailFolders.id, folder.id), eq(schema.mailFolders.tenantId, folder.tenantId),
      sql`${schema.mailFolders.lastUid} < ${uid}`,
    ));
  }

  private async account(tenantId: string, accountId: string) {
    const [account] = await db.select().from(schema.mailAccounts).where(and(
      eq(schema.mailAccounts.id, accountId), eq(schema.mailAccounts.tenantId, tenantId),
    ));
    if (!account) throw notFound("Mail account not found");
    return account;
  }

  private async assertObjectExists(tenantId: string, objectType: SupportedLinkType, objectId: string): Promise<void> {
    let found: { id: string } | undefined;
    if (objectType === "Company") [found] = await db.select({ id: schema.tenants.id }).from(schema.tenants)
      .where(and(eq(schema.tenants.id, tenantId), eq(schema.tenants.id, objectId)));
    else if (objectType === "Customer" || objectType === "Supplier") [found] = await db.select({ id: schema.contacts.id })
      .from(schema.contacts).where(and(eq(schema.contacts.tenantId, tenantId), eq(schema.contacts.id, objectId),
        objectType === "Customer" ? eq(schema.contacts.isCustomer, true) : eq(schema.contacts.isVendor, true)));
    else if (objectType === "Invoice") [found] = await db.select({ id: schema.invoices.id }).from(schema.invoices)
      .where(and(eq(schema.invoices.tenantId, tenantId), eq(schema.invoices.id, objectId)));
    else if (objectType === "Payment") [found] = await db.select({ id: schema.payments.id }).from(schema.payments)
      .where(and(eq(schema.payments.tenantId, tenantId), eq(schema.payments.id, objectId)));
    else if (objectType === "Product") [found] = await db.select({ id: schema.products.id }).from(schema.products)
      .where(and(eq(schema.products.tenantId, tenantId), eq(schema.products.id, objectId)));
    else if (objectType === "Employee") [found] = await db.select({ id: schema.employees.id }).from(schema.employees)
      .where(and(eq(schema.employees.tenantId, tenantId), eq(schema.employees.id, objectId)));
    else [found] = await db.select({ id: schema.users.id }).from(schema.users)
      .where(and(eq(schema.users.tenantId, tenantId), eq(schema.users.id, objectId)));
    if (!found) throw notFound(`${objectType} not found`);
  }

  private async publishSafely(event: Parameters<EventBusContract["publish"]>[0]): Promise<void> {
    try { await this.dependencies.events.publish(event); } catch (error) {
      logEvent("event.post_commit_publish_failed", {
        eventType: event.type,
        eventId: event.id,
        errorType: error instanceof Error ? error.name : "UnknownError",
      }, "error");
    }
  }
}
