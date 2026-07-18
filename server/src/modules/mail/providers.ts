import net from "node:net";
import tls from "node:tls";
import type { Duplex } from "node:stream";
import nodemailer from "nodemailer";
import { MailProtocolError } from "./errors.js";
import type {
  MailFolderType, MailImapConfig, MailImapConnector, MailImapSession,
  MailSmtpConfig, MailSmtpSender, OutboundMailMessage, RemoteMailFolder,
  RemoteMailMessage,
} from "./types.js";

const CONNECTION_TIMEOUT_MS = 15_000;
const COMMAND_TIMEOUT_MS = 30_000;

function quoteImap(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

class BufferedSocket {
  private buffer = Buffer.alloc(0);
  private closedError: Error | null = null;
  private waiter: {
    pattern: RegExp;
    resolve: (value: Buffer) => void;
    reject: (error: Error) => void;
    timer: NodeJS.Timeout;
  } | null = null;

  private readonly onData = (chunk: Buffer) => {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    this.flush();
  };
  private readonly onError = (error: Error) => this.fail(error);
  private readonly onClose = () => this.fail(new MailProtocolError("IMAP connection closed"));

  constructor(readonly socket: Duplex) {
    socket.on("data", this.onData);
    socket.on("error", this.onError);
    socket.on("close", this.onClose);
  }

  detach(): void {
    this.socket.off("data", this.onData);
    this.socket.off("error", this.onError);
    this.socket.off("close", this.onClose);
    if (this.waiter) this.fail(new MailProtocolError("IMAP connection was upgraded"));
  }

  write(value: string): void {
    this.socket.write(value);
  }

  takeThrough(pattern: RegExp, timeoutMs = COMMAND_TIMEOUT_MS): Promise<Buffer> {
    if (this.waiter) throw new MailProtocolError("Concurrent IMAP commands are not supported");
    if (this.closedError) return Promise.reject(this.closedError);
    return new Promise<Buffer>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiter = null;
        reject(new MailProtocolError("IMAP command timed out"));
      }, timeoutMs);
      timer.unref?.();
      this.waiter = { pattern, resolve, reject, timer };
      this.flush();
    });
  }

  private flush(): void {
    if (!this.waiter) return;
    const text = this.buffer.toString("latin1");
    this.waiter.pattern.lastIndex = 0;
    const match = this.waiter.pattern.exec(text);
    if (!match || match.index === undefined) return;
    const end = match.index + match[0].length;
    const response = this.buffer.subarray(0, end);
    this.buffer = this.buffer.subarray(end);
    const waiter = this.waiter;
    this.waiter = null;
    clearTimeout(waiter.timer);
    waiter.resolve(response);
  }

  private fail(error: Error): void {
    this.closedError = error;
    if (!this.waiter) return;
    const waiter = this.waiter;
    this.waiter = null;
    clearTimeout(waiter.timer);
    waiter.reject(error);
  }
}

function folderType(flags: string, name: string): MailFolderType {
  const value = `${flags} ${name}`.toLowerCase();
  if (value.includes("\\sent")) return "SENT";
  if (value.includes("\\drafts")) return "DRAFTS";
  if (value.includes("\\trash")) return "TRASH";
  if (value.includes("\\archive") || value.includes("all mail")) return "ARCHIVE";
  if (value.includes("\\inbox") || name.toLowerCase() === "inbox") return "INBOX";
  return "CUSTOM";
}

function unquoteImap(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/\\([\\"])/g, "$1");
  }
  return trimmed;
}

class WireImapSession implements MailImapSession {
  private sequence = 0;
  private selectedFolder: string | null = null;

  constructor(private transport: BufferedSocket) {}

  static async open(config: MailImapConfig): Promise<WireImapSession> {
    const socket = await openSocket(config);
    let transport = new BufferedSocket(socket);
    const greeting = (await transport.takeThrough(/\r\n/, CONNECTION_TIMEOUT_MS)).toString("latin1");
    if (!/^\* (?:OK|PREAUTH)\b/i.test(greeting)) throw new MailProtocolError("IMAP server rejected the connection");
    const session = new WireImapSession(transport);
    if (config.tls === "starttls") {
      await session.command("STARTTLS");
      transport.detach();
      const upgraded = tls.connect({ socket: socket as net.Socket, servername: config.host });
      await onceConnected(upgraded, "secureConnect");
      transport = new BufferedSocket(upgraded);
      session.transport = transport;
    }
    await session.command(`LOGIN ${quoteImap(config.username)} ${quoteImap(config.password)}`);
    return session;
  }

  async listFolders(): Promise<readonly RemoteMailFolder[]> {
    const response = (await this.command('LIST "" "*"')).toString("latin1");
    const folders: RemoteMailFolder[] = [];
    for (const line of response.split("\r\n")) {
      const match = /^\* LIST \(([^)]*)\) (?:"[^"]*"|NIL) (.+)$/i.exec(line);
      if (!match) continue;
      const remoteRef = unquoteImap(match[2]);
      folders.push({ name: remoteRef, remoteRef, type: folderType(match[1], remoteRef) });
    }
    return folders;
  }

  async selectFolder(remoteRef: string): Promise<{ uidValidity: string }> {
    const response = (await this.command(`EXAMINE ${quoteImap(remoteRef)}`)).toString("latin1");
    const uidValidity = /\[UIDVALIDITY\s+(\d+)\]/i.exec(response)?.[1];
    if (!uidValidity) throw new MailProtocolError("IMAP folder did not report UIDVALIDITY");
    this.selectedFolder = remoteRef;
    return { uidValidity };
  }

  async fetchSince(remoteRef: string, afterUid: number): Promise<readonly RemoteMailMessage[]> {
    if (this.selectedFolder !== remoteRef) await this.selectFolder(remoteRef);
    const search = (await this.command(`UID SEARCH UID ${Math.max(1, afterUid + 1)}:*`)).toString("latin1");
    const line = search.split("\r\n").find((candidate) => /^\* SEARCH\b/i.test(candidate)) ?? "";
    const uids = line.replace(/^\* SEARCH\s*/i, "").trim().split(/\s+/)
      .filter((value) => /^\d+$/.test(value)).map(Number).filter((uid) => uid > afterUid)
      .sort((left, right) => left - right);
    const messages: RemoteMailMessage[] = [];
    for (const uid of uids) {
      const response = await this.command(`UID FETCH ${uid} (UID FLAGS INTERNALDATE BODY.PEEK[])`);
      const text = response.toString("latin1");
      const literal = /\{(\d+)\}\r\n/.exec(text);
      if (!literal || literal.index === undefined) throw new MailProtocolError("IMAP FETCH response omitted message content");
      const size = Number(literal[1]);
      const start = literal.index + literal[0].length;
      const raw = response.subarray(start, start + size);
      if (raw.length !== size) throw new MailProtocolError("IMAP FETCH message content was truncated");
      const flags = /FLAGS \(([^)]*)\)/i.exec(text)?.[1].split(/\s+/).filter(Boolean) ?? [];
      const internalDateValue = /INTERNALDATE "([^"]+)"/i.exec(text)?.[1];
      const internalDate = internalDateValue ? new Date(internalDateValue) : new Date();
      messages.push({
        uid,
        raw,
        flags,
        internalDate: Number.isNaN(internalDate.getTime()) ? new Date() : internalDate,
      });
    }
    return messages;
  }

  async disconnect(): Promise<void> {
    try { await this.command("LOGOUT", 5_000); } catch { /* remote disconnect is expected */ }
    this.transport.socket.destroy();
  }

  private async command(command: string, timeoutMs = COMMAND_TIMEOUT_MS): Promise<Buffer> {
    const tag = `VAKA${(++this.sequence).toString().padStart(5, "0")}`;
    this.transport.write(`${tag} ${command}\r\n`);
    const pattern = new RegExp(`(?:^|\\r\\n)${tag} (?:OK|NO|BAD)[^\\r\\n]*\\r\\n`, "i");
    const response = await this.transport.takeThrough(pattern, timeoutMs);
    const finalLine = new RegExp(`${tag} (OK|NO|BAD)`, "i").exec(response.toString("latin1"));
    if (!finalLine || finalLine[1].toUpperCase() !== "OK") {
      throw new MailProtocolError(`IMAP command failed: ${command.split(" ", 1)[0]}`);
    }
    return response;
  }
}

function onceConnected(socket: net.Socket | tls.TLSSocket, event: "connect" | "secureConnect"): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new MailProtocolError("Mail server connection timed out"));
    }, CONNECTION_TIMEOUT_MS);
    timer.unref?.();
    const finish = () => { clearTimeout(timer); resolve(); };
    const fail = (error: Error) => { clearTimeout(timer); reject(error); };
    socket.once(event, finish);
    socket.once("error", fail);
  });
}

async function openSocket(config: MailImapConfig): Promise<net.Socket | tls.TLSSocket> {
  if (config.tls === "implicit") {
    const socket = tls.connect({ host: config.host, port: config.port, servername: config.host });
    await onceConnected(socket, "secureConnect");
    return socket;
  }
  const socket = net.createConnection({ host: config.host, port: config.port });
  await onceConnected(socket, "connect");
  return socket;
}

export class NodeImapConnector implements MailImapConnector {
  connect(config: MailImapConfig): Promise<MailImapSession> {
    return WireImapSession.open(config);
  }
}

function nodemailerTls(config: MailSmtpConfig) {
  return {
    host: config.host,
    port: config.port,
    secure: config.tls === "implicit",
    requireTLS: config.tls === "starttls",
    ignoreTLS: config.tls === "none",
    auth: { user: config.username, pass: config.password },
  };
}

export class NodemailerMailSender implements MailSmtpSender {
  async send(config: MailSmtpConfig, message: OutboundMailMessage): Promise<{ providerMessageId?: string }> {
    const transport = nodemailer.createTransport(nodemailerTls(config));
    try {
      const result = await transport.sendMail({
        from: message.from,
        to: message.to.map((address) => address.name ? address : address.address),
        cc: message.cc.map((address) => address.name ? address : address.address),
        subject: message.subject,
        text: message.text,
        html: message.html,
        messageId: message.messageId,
        inReplyTo: message.inReplyTo,
        references: [...message.references],
        attachments: message.attachments.map((attachment) => ({
          filename: attachment.filename,
          contentType: attachment.mimeType,
          content: Buffer.from(attachment.content),
        })),
      });
      return { providerMessageId: result.messageId };
    } finally {
      transport.close();
    }
  }
}
