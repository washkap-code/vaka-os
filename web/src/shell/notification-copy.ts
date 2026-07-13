export type NotificationItem = {
  id: string;
  template: string;
  locale: string;
  variables: Record<string, unknown>;
  status: string;
  createdAt: string;
};

export type NotificationCopy = {
  lowStockTitle: string;
  lowStockDetail: string;
  deliverySentTitle: string;
  deliverySentDetail: string;
  deliveryFailedTitle: string;
  deliveryFailedDetail: string;
  securityTitle: string;
  securityDetail: string;
  genericTitle: string;
  genericDetail: string;
  stockItem: string;
  unknownAmount: string;
  document: string;
  recipient: string;
};

function safeText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function notificationCopy(item: NotificationItem, copy: NotificationCopy): { title: string; detail: string } {
  if (item.template === "inventory.low_stock") {
    const name = safeText(item.variables.name) ?? copy.stockItem;
    const onHand = safeText(item.variables.onHand) ?? copy.unknownAmount;
    const threshold = safeText(item.variables.threshold) ?? copy.unknownAmount;
    return { title: copy.lowStockTitle, detail: copy.lowStockDetail
      .replace("{name}", name).replace("{onHand}", onHand).replace("{threshold}", threshold) };
  }
  if (item.template === "finance.delivery.sent.v1") {
    const documentType = safeText(item.variables.documentType) ?? copy.document;
    const recipientName = safeText(item.variables.recipientName) ?? copy.recipient;
    return { title: copy.deliverySentTitle, detail: copy.deliverySentDetail
      .replace("{documentType}", documentType).replace("{recipientName}", recipientName) };
  }
  if (item.template === "finance.delivery.failed.v1") {
    const documentType = safeText(item.variables.documentType) ?? copy.document;
    const recipientName = safeText(item.variables.recipientName) ?? copy.recipient;
    return { title: copy.deliveryFailedTitle, detail: copy.deliveryFailedDetail
      .replace("{documentType}", documentType).replace("{recipientName}", recipientName) };
  }
  if (item.template === "security.notice") {
    return { title: copy.securityTitle, detail: safeText(item.variables.event) ?? copy.securityDetail };
  }
  return { title: copy.genericTitle, detail: copy.genericDetail };
}
