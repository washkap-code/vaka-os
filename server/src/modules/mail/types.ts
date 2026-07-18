export type MailAccountType = "imap" | "shared";
export type MailFolderType = "INBOX" | "SENT" | "DRAFTS" | "TRASH" | "ARCHIVE" | "CUSTOM";
export type MailDirection = "inbound" | "outbound";
export type MailTlsMode = "implicit" | "starttls" | "none";

export interface MailAddress {
  address: string;
  name?: string;
}

export interface MailImapConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  tls: MailTlsMode;
}

export interface MailSmtpConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  tls: MailTlsMode;
}

export interface MailAccountSecrets {
  imap: MailImapConfig;
  smtp: MailSmtpConfig;
}

export interface MailActor {
  tenantId: string;
  userId: string;
  permissions: readonly string[];
}

export interface RemoteMailFolder {
  name: string;
  remoteRef: string;
  type: MailFolderType;
}

export interface RemoteMailMessage {
  uid: number;
  raw: Uint8Array;
  flags: readonly string[];
  internalDate: Date;
}

export interface MailImapSession {
  listFolders(): Promise<readonly RemoteMailFolder[]>;
  selectFolder(remoteRef: string): Promise<{ uidValidity: string }>;
  fetchSince(remoteRef: string, afterUid: number): Promise<readonly RemoteMailMessage[]>;
  disconnect(): Promise<void>;
}

export interface MailImapConnector {
  connect(config: MailImapConfig): Promise<MailImapSession>;
}

export interface OutboundMailAttachment {
  filename: string;
  mimeType: string;
  content: Uint8Array;
  documentId: string;
}

export interface OutboundMailMessage {
  from: MailAddress;
  to: readonly MailAddress[];
  cc: readonly MailAddress[];
  subject: string;
  text?: string;
  html?: string;
  messageId: string;
  inReplyTo?: string;
  references: readonly string[];
  attachments: readonly OutboundMailAttachment[];
}

export interface MailSmtpSender {
  send(config: MailSmtpConfig, message: OutboundMailMessage): Promise<{ providerMessageId?: string }>;
}

export interface ParsedMailAttachment {
  filename: string;
  mimeType: string;
  content: Uint8Array;
}

export interface ParsedMailMessage {
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
  from: MailAddress[];
  to: MailAddress[];
  cc: MailAddress[];
  subject: string;
  text: string | null;
  htmlSanitized: string | null;
  sentAt: Date | null;
  attachments: ParsedMailAttachment[];
}

export interface MailAccountView {
  id: string;
  tenantId: string;
  ownerUserId: string;
  type: MailAccountType;
  emailAddress: string;
  displayName: string;
  syncStatus: string;
  lastSyncAt: Date | null;
  imapConfigured: true;
  smtpConfigured: true;
  createdAt: Date;
  updatedAt: Date;
}
