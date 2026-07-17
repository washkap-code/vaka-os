import type { BlackbookCategory } from "../blackbook/blackbook-model";
import type { WorkspacePage } from "./navigation";

const BLACKBOOK_SEARCH_CATEGORIES: readonly BlackbookCategory[] = [
  "government_organisation", "regulator", "local_authority", "utility",
  "tender_portal", "business_association", "licence_type", "compliance_event", "service",
];

type SearchObject = {
  key: "customer" | "supplier" | "invoice" | "product" | "blackbook";
  fallbackLabel: string;
  navigation: { section: string; recordView: string | null };
};

type CustomerSearchDocument = {
  id: string;
  entityType: "customer";
  name: string;
  contactType: "INDIVIDUAL" | "COMPANY";
};

type SupplierSearchDocument = {
  id: string;
  entityType: "supplier";
  name: string;
  contactType: "INDIVIDUAL" | "COMPANY";
  supplierCode: string | null;
  supplierCurrency: "USD" | "ZWG" | null;
};

type InvoiceSearchDocument = {
  id: string;
  entityType: "invoice";
  number: string | null;
  status: string;
  currency: "USD" | "ZWG";
  total: string;
  customerName: string;
};

type ProductSearchDocument = {
  id: string;
  entityType: "product";
  sku: string;
  name: string;
  currency: "USD" | "ZWG";
  salePrice: string;
  isActive: boolean;
  trackStock: boolean;
};

type BlackbookSearchDocument = {
  id: string;
  entityType: "blackbook";
  key: string;
  name: string;
  category: BlackbookCategory;
  verified: boolean;
  lastReviewed: string;
};

export type WorkspaceSearchResult = {
  id: string;
  entityType: "customer" | "supplier" | "invoice" | "product" | "blackbook";
  title: string;
  document: CustomerSearchDocument | SupplierSearchDocument | InvoiceSearchDocument | ProductSearchDocument
    | BlackbookSearchDocument;
  object: SearchObject;
};

export type WorkspaceSearchTarget = {
  page: Extract<WorkspacePage, "contacts" | "suppliers" | "invoices" | "products" | "blackbook">;
  entityType: WorkspaceSearchResult["entityType"];
  recordId: string;
};

const navigationByEntity = {
  customer: { page: "contacts", section: "crm", recordView: "customer" },
  supplier: { page: "suppliers", section: "procurement", recordView: "supplier" },
  invoice: { page: "invoices", section: "accounting", recordView: "invoice" },
  product: { page: "products", section: "inventory", recordView: "product" },
  blackbook: { page: "blackbook", section: "blackbook", recordView: "entry" },
} as const;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function string(value: unknown): value is string {
  return typeof value === "string";
}

function currency(value: unknown): value is "USD" | "ZWG" {
  return value === "USD" || value === "ZWG";
}

function blackbookCategory(value: unknown): value is BlackbookCategory {
  return typeof value === "string" && (BLACKBOOK_SEARCH_CATEGORIES as readonly string[]).includes(value);
}

function parseObject(value: unknown, entityType: WorkspaceSearchResult["entityType"]): SearchObject | null {
  const candidate = record(value);
  const navigation = record(candidate?.navigation);
  if (!candidate || !navigation || candidate.key !== entityType || !string(candidate.fallbackLabel)
    || !string(navigation.section) || !(navigation.recordView === null || string(navigation.recordView))) return null;
  return {
    key: entityType,
    fallbackLabel: candidate.fallbackLabel,
    navigation: { section: navigation.section, recordView: navigation.recordView },
  };
}

function parseDocument(value: unknown, entityType: WorkspaceSearchResult["entityType"], id: string) {
  const candidate = record(value);
  if (!candidate || candidate.id !== id || candidate.entityType !== entityType) return null;
  if (entityType === "customer" && string(candidate.name)
    && (candidate.contactType === "INDIVIDUAL" || candidate.contactType === "COMPANY")) {
    return { id, entityType, name: candidate.name, contactType: candidate.contactType } satisfies CustomerSearchDocument;
  }
  if (entityType === "supplier" && string(candidate.name)
    && (candidate.contactType === "INDIVIDUAL" || candidate.contactType === "COMPANY")
    && (candidate.supplierCode === null || string(candidate.supplierCode))
    && (candidate.supplierCurrency === null || currency(candidate.supplierCurrency))) {
    return {
      id, entityType, name: candidate.name, contactType: candidate.contactType,
      supplierCode: candidate.supplierCode, supplierCurrency: candidate.supplierCurrency,
    } satisfies SupplierSearchDocument;
  }
  if (entityType === "invoice" && (candidate.number === null || string(candidate.number))
    && string(candidate.status) && currency(candidate.currency) && string(candidate.total)
    && string(candidate.customerName)) {
    return {
      id, entityType, number: candidate.number, status: candidate.status,
      currency: candidate.currency, total: candidate.total, customerName: candidate.customerName,
    } satisfies InvoiceSearchDocument;
  }
  if (entityType === "product" && string(candidate.sku) && string(candidate.name)
    && currency(candidate.currency) && string(candidate.salePrice)
    && typeof candidate.isActive === "boolean" && typeof candidate.trackStock === "boolean") {
    return {
      id, entityType, sku: candidate.sku, name: candidate.name, currency: candidate.currency,
      salePrice: candidate.salePrice, isActive: candidate.isActive, trackStock: candidate.trackStock,
    } satisfies ProductSearchDocument;
  }
  if (entityType === "blackbook" && candidate.key === id && string(candidate.name)
    && blackbookCategory(candidate.category) && typeof candidate.verified === "boolean"
    && string(candidate.lastReviewed)) {
    return {
      id, entityType, key: candidate.key, name: candidate.name, category: candidate.category,
      verified: candidate.verified, lastReviewed: candidate.lastReviewed,
    } satisfies BlackbookSearchDocument;
  }
  return null;
}

function parseResult(value: unknown): WorkspaceSearchResult | null {
  const candidate = record(value);
  if (!candidate || !string(candidate.id) || !string(candidate.title)
    || !["customer", "supplier", "invoice", "product", "blackbook"].includes(String(candidate.entityType))) return null;
  const entityType = candidate.entityType as WorkspaceSearchResult["entityType"];
  const object = parseObject(candidate.object, entityType);
  const document = parseDocument(candidate.document, entityType, candidate.id);
  if (!object || !document) return null;
  return { id: candidate.id, entityType, title: candidate.title, document, object };
}

export function parseWorkspaceSearchResponse(value: unknown): WorkspaceSearchResult[] {
  const response = record(value);
  if (!response || !Array.isArray(response.results)) return [];
  return response.results.map(parseResult).filter((result): result is WorkspaceSearchResult => result !== null);
}

export function workspaceSearchTarget(result: WorkspaceSearchResult): WorkspaceSearchTarget | null {
  const expected = navigationByEntity[result.entityType];
  if (result.object.key !== result.entityType || result.document.entityType !== result.entityType
    || result.object.navigation.section !== expected.section
    || result.object.navigation.recordView !== expected.recordView) return null;
  return { page: expected.page, entityType: result.entityType, recordId: result.id };
}

export function isEditableSearchShortcutTarget(value: EventTarget | null): boolean {
  return typeof HTMLElement !== "undefined" && value instanceof HTMLElement && (value.isContentEditable
    || ["INPUT", "TEXTAREA", "SELECT"].includes(value.tagName));
}
