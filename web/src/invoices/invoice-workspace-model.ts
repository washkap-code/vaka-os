export type InvoiceLifecycleStatus = "DRAFT" | "ISSUED" | "PARTIAL" | "PAID" | "VOID";

export type InvoiceRecordAction =
  | "preview"
  | "download"
  | "sendEmail"
  | "createShareLink"
  | "manageShareLinks"
  | "emailLink"
  | "whatsAppLink"
  | "issue"
  | "recordPayment"
  | "void";

export function invoiceRecordActions(status: InvoiceLifecycleStatus, canPost: boolean): InvoiceRecordAction[] {
  const actions: InvoiceRecordAction[] = [];
  if (status !== "DRAFT") actions.push("preview", "download");
  if (!canPost) return actions;
  if (status === "ISSUED" || status === "PARTIAL") actions.push("sendEmail");
  if (status === "ISSUED" || status === "PARTIAL" || status === "PAID") {
    actions.push("createShareLink", "manageShareLinks", "emailLink", "whatsAppLink");
  }
  if (status === "DRAFT") actions.push("issue");
  if (status === "ISSUED" || status === "PARTIAL") actions.push("recordPayment");
  if (status !== "VOID" && status !== "PAID") actions.push("void");
  return actions;
}
