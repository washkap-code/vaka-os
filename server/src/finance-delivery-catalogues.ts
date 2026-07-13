export const FINANCE_DELIVERY_LOCALES = ["en-ZW", "sn-ZW", "nd-ZW"] as const;
export type FinanceDeliveryLocale = typeof FINANCE_DELIVERY_LOCALES[number];
export type ReviewedFinanceDeliveryLocale = "en-ZW";
export type FinanceDeliveryKind = "INVOICE" | "STATEMENT" | "PAYMENT_REMINDER";

export const FINANCE_DELIVERY_TEMPLATES = {
  INVOICE: "finance.invoice.issued.v1",
  STATEMENT: "finance.customer-statement.v1",
  PAYMENT_REMINDER: "finance.payment-reminder.v1",
  OUTCOME_SENT: "finance.delivery.sent.v1",
  OUTCOME_FAILED: "finance.delivery.failed.v1",
} as const;

type FinanceCopy = {
  subject: (variables: Record<string, string>) => string;
  preview: (variables: Record<string, string>) => string;
};

const englishCatalogue: Record<FinanceDeliveryKind, FinanceCopy> = {
  INVOICE: {
    subject: (v) => `Invoice ${v.invoiceNumber} from ${v.companyName}`,
    preview: (v) => `Invoice ${v.invoiceNumber} for ${v.currency} ${v.total} is available through a secure link.`,
  },
  STATEMENT: {
    subject: (v) => `Customer statement from ${v.companyName}`,
    preview: (v) => `Your statement as at ${v.asAt} is ready. Amounts remain separated by currency.`,
  },
  PAYMENT_REMINDER: {
    subject: (v) => `Payment reminder for invoice ${v.invoiceNumber}`,
    preview: (v) => `Invoice ${v.invoiceNumber} has ${v.currency} ${v.outstanding} outstanding.`,
  },
};

// ChiShona and isiNdebele preferences are retained, but finance copy remains
// disabled until native/professional review. English is the explicit fallback.
export function resolveFinanceCatalogue(requestedLocale: FinanceDeliveryLocale): {
  requestedLocale: FinanceDeliveryLocale;
  resolvedLocale: ReviewedFinanceDeliveryLocale;
  fellBack: boolean;
  copy: Record<FinanceDeliveryKind, FinanceCopy>;
} {
  return {
    requestedLocale,
    resolvedLocale: "en-ZW",
    fellBack: requestedLocale !== "en-ZW",
    copy: englishCatalogue,
  };
}
