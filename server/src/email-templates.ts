import type { EmailTransportMessage } from "./platform/notifications/index.js";

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

function required(message: EmailTransportMessage, key: string): string {
  const value = message.variables[key]?.trim();
  if (!value) throw new Error(`Email template ${message.template} requires variable ${key}`);
  return value;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
  })[character]!);
}

function paragraph(value: string): string {
  return `<p>${escapeHtml(value)}</p>`;
}

export function renderEmailTemplate(message: EmailTransportMessage): RenderedEmail {
  if (message.template === "security.user_invitation.v1") {
    const fullName = required(message, "fullName");
    const workspaceName = required(message, "workspaceName");
    const temporaryPassword = required(message, "temporaryPassword");
    const loginUrl = required(message, "loginUrl");
    const subject = `You have been invited to ${workspaceName} on VAKA`;
    const text = [
      `Hello ${fullName},`,
      `${workspaceName} has invited you to its VAKA workspace.`,
      `Temporary password: ${temporaryPassword}`,
      `Sign in: ${loginUrl}`,
      "You will be required to choose a new password after signing in.",
    ].join("\n\n");
    const html = [
      paragraph(`Hello ${fullName},`),
      paragraph(`${workspaceName} has invited you to its VAKA workspace.`),
      paragraph(`Temporary password: ${temporaryPassword}`),
      `<p><a href="${escapeHtml(loginUrl)}">Sign in to VAKA</a></p>`,
      paragraph("You will be required to choose a new password after signing in."),
    ].join("");
    return { subject, text, html };
  }

  if (message.template === "security.password_reset.v1"
    || message.template === "security.password_reset") {
    const fullName = required(message, "fullName");
    const resetUrl = required(message, "resetUrl");
    const expiresInMinutes = required(message, "expiresInMinutes");
    const subject = "Reset your VAKA password";
    const text = [
      `Hello ${fullName},`,
      `Use this secure link to reset your password: ${resetUrl}`,
      `The link expires in ${expiresInMinutes} minutes. If you did not request this, ignore this email.`,
    ].join("\n\n");
    const html = [
      paragraph(`Hello ${fullName},`),
      `<p><a href="${escapeHtml(resetUrl)}">Reset your VAKA password</a></p>`,
      paragraph(`The link expires in ${expiresInMinutes} minutes. If you did not request this, ignore this email.`),
    ].join("");
    return { subject, text, html };
  }

  if (message.template === "finance.invoice.issued.v1"
    || message.template === "finance.customer-statement.v1"
    || message.template === "finance.payment-reminder.v1") {
    const subject = required(message, "subject");
    const preview = required(message, "preview");
    const documentUrl = message.variables.documentUrl?.trim();
    const text = documentUrl ? `${preview}\n\nOpen the secure document: ${documentUrl}` : preview;
    const html = documentUrl
      ? `${paragraph(preview)}<p><a href="${escapeHtml(documentUrl)}">Open the secure document</a></p>`
      : paragraph(preview);
    return { subject, text, html };
  }

  throw new Error(`Unknown transactional email template: ${message.template}`);
}
