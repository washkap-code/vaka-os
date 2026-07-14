import { createHash } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema, type DB } from "./lib.js";
import { InvalidSearchQueryError } from "./platform/search/errors.js";
import type { SearchProvider } from "./platform/search/interfaces.js";
import type { SearchQuery, SearchResponse, SearchScope } from "./platform/search/types.js";
import type { EventBusContract } from "./platform/events/interfaces.js";
import { DOMAIN_EVENTS, type DomainEventPayloads } from "./platform/events/registry.js";
import type { MetadataServiceContract } from "./platform/metadata/interfaces.js";
import type { MetadataObjectDefinition } from "./platform/metadata/types.js";

export const SEARCH_ENTITY_TYPES = ["customer", "supplier", "invoice", "product"] as const;
export type SearchEntityType = typeof SEARCH_ENTITY_TYPES[number];
type SearchPermission = "crm.read" | "accounting.read" | "inventory.read";

export const searchQuerySchema = z.object({
  q: z.string().trim().min(2).max(120),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  cursor: z.string().trim().min(1).max(512).optional(),
  entityTypes: z.preprocess(
    (value) => typeof value === "string" ? value.split(",").filter(Boolean) : value,
    z.array(z.enum(SEARCH_ENTITY_TYPES)).max(SEARCH_ENTITY_TYPES.length).optional(),
  ),
}).strict();

export type SearchResultDocument =
  | { id: string; entityType: "customer"; name: string; contactType: "INDIVIDUAL" | "COMPANY" }
  | { id: string; entityType: "supplier"; name: string; contactType: "INDIVIDUAL" | "COMPANY"; supplierCode: string | null; supplierCurrency: "USD" | "ZWG" | null }
  | { id: string; entityType: "invoice"; number: string | null; status: string; currency: "USD" | "ZWG"; total: string; customerName: string }
  | { id: string; entityType: "product"; sku: string; name: string; currency: "USD" | "ZWG"; salePrice: string; isActive: boolean; trackStock: boolean };

type IndexedDocument = {
  tenantId: string;
  entityType: SearchEntityType;
  entityId: string;
  title: string;
  searchText: string;
  permission: SearchPermission;
  document: SearchResultDocument;
};

function normalizeSearchText(parts: readonly (string | null | undefined)[]): string {
  return parts.filter((part): part is string => Boolean(part?.trim()))
    .join(" ").normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

async function upsertDocument(tx: DB, document: IndexedDocument): Promise<void> {
  await tx.insert(schema.searchDocuments).values({ ...document, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [schema.searchDocuments.tenantId, schema.searchDocuments.entityType, schema.searchDocuments.entityId],
      set: {
        title: document.title,
        searchText: document.searchText,
        permission: document.permission,
        document: document.document,
        updatedAt: new Date(),
      },
    });
}

function searchableValues(
  definition: MetadataObjectDefinition,
  values: Record<string, string | readonly string[] | null | undefined>,
): (string | null | undefined)[] {
  return definition.fields.filter((field) => field.searchable).flatMap((field) => {
    const value = values[field.key];
    return Array.isArray(value) ? [...value] : [value as string | null | undefined];
  });
}

function searchPermission(definition: MetadataObjectDefinition): SearchPermission {
  if (!definition.searchable || !definition.readPermission
    || !["crm.read", "accounting.read", "inventory.read"].includes(definition.readPermission)) {
    throw new InvalidSearchQueryError(`Metadata object ${definition.key} is not governed for search`);
  }
  return definition.readPermission as SearchPermission;
}

function customerDocument(row: typeof schema.contacts.$inferSelect, definition: MetadataObjectDefinition): IndexedDocument | null {
  if (!row.isCustomer) return null;
  return {
    tenantId: row.tenantId,
    entityType: "customer",
    entityId: row.id,
    title: row.name,
    searchText: normalizeSearchText(searchableValues(definition, { name: row.name, tags: row.tags })),
    permission: searchPermission(definition),
    document: { id: row.id, entityType: "customer", name: row.name, contactType: row.type },
  };
}

function supplierDocument(row: typeof schema.contacts.$inferSelect, definition: MetadataObjectDefinition): IndexedDocument | null {
  if (!row.isVendor) return null;
  return {
    tenantId: row.tenantId,
    entityType: "supplier",
    entityId: row.id,
    title: row.name,
    searchText: normalizeSearchText(searchableValues(definition, {
      name: row.name,
      supplierCode: row.supplierCode,
      tags: row.tags,
    })),
    permission: searchPermission(definition),
    document: {
      id: row.id,
      entityType: "supplier",
      name: row.name,
      contactType: row.type,
      supplierCode: row.supplierCode,
      supplierCurrency: row.supplierCurrency,
    },
  };
}

function productDocument(row: typeof schema.products.$inferSelect, definition: MetadataObjectDefinition): IndexedDocument {
  return {
    tenantId: row.tenantId,
    entityType: "product",
    entityId: row.id,
    title: `${row.sku} — ${row.name}`,
    searchText: normalizeSearchText(searchableValues(definition, {
      sku: row.sku, name: row.name, description: row.description,
    })),
    permission: searchPermission(definition),
    document: {
      id: row.id,
      entityType: "product",
      sku: row.sku,
      name: row.name,
      currency: row.currency,
      salePrice: row.salePrice,
      isActive: row.isActive,
      trackStock: row.trackStock,
    },
  };
}

function invoiceDocument(row: {
  id: string; tenantId: string; number: string | null; status: string;
  currency: "USD" | "ZWG"; total: string; customerName: string;
}, definition: MetadataObjectDefinition): IndexedDocument {
  const title = row.number ?? `Draft invoice — ${row.customerName}`;
  return {
    tenantId: row.tenantId,
    entityType: "invoice",
    entityId: row.id,
    title,
    searchText: normalizeSearchText(searchableValues(definition, {
      number: row.number ?? "draft invoice", status: row.status, customerName: row.customerName,
    })),
    permission: searchPermission(definition),
    document: {
      id: row.id,
      entityType: "invoice",
      number: row.number,
      status: row.status,
      currency: row.currency,
      total: row.total,
      customerName: row.customerName,
    },
  };
}

function cursorFingerprint(query: SearchQuery, allowedTypes: readonly SearchEntityType[]): string {
  return createHash("sha256").update(JSON.stringify({
    text: normalizeSearchText([query.text]),
    entityTypes: [...allowedTypes].sort(),
  })).digest("hex").slice(0, 16);
}

function decodeCursor(cursor: string | undefined, fingerprint: string): number {
  if (!cursor) return 0;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as unknown;
    const validated = z.object({ v: z.literal(1), offset: z.number().int().min(0).max(1_000_000), fingerprint: z.string() }).strict().parse(parsed);
    if (validated.fingerprint !== fingerprint) throw new Error("cursor scope mismatch");
    return validated.offset;
  } catch {
    throw new InvalidSearchQueryError("Search cursor is invalid for this query");
  }
}

function encodeCursor(offset: number, fingerprint: string): string {
  return Buffer.from(JSON.stringify({ v: 1, offset, fingerprint }), "utf8").toString("base64url");
}

export interface SearchApplicationAdapter extends SearchProvider {
  reconcileTenant(tenantId: string): Promise<void>;
  reindexCustomer(tenantId: string, customerId: string): Promise<void>;
  reindexSupplier(tenantId: string, supplierId: string): Promise<void>;
  reindexInvoice(tenantId: string, invoiceId: string): Promise<void>;
  reindexProduct(tenantId: string, productId: string): Promise<void>;
}

export class PostgresSearchProvider implements SearchApplicationAdapter {
  private readonly reconciledTenants = new Set<string>();
  private readonly pendingReconciliations = new Map<string, Promise<void>>();

  constructor(private readonly metadata: MetadataServiceContract) {}

  private async definition(tenantId: string, entityType: SearchEntityType): Promise<MetadataObjectDefinition> {
    const definition = await this.metadata.object(entityType, tenantId);
    if (!definition) throw new InvalidSearchQueryError(`Metadata object is not registered: ${entityType}`);
    searchPermission(definition);
    return definition;
  }

  async reconcileTenant(tenantId: string): Promise<void> {
    if (this.reconciledTenants.has(tenantId)) return;
    const existing = this.pendingReconciliations.get(tenantId);
    if (existing) return existing;
    const pending = this.rebuildTenant(tenantId).then(() => {
      this.reconciledTenants.add(tenantId);
    }).finally(() => {
      this.pendingReconciliations.delete(tenantId);
    });
    this.pendingReconciliations.set(tenantId, pending);
    return pending;
  }

  private async rebuildTenant(tenantId: string): Promise<void> {
    const [customerDefinition, supplierDefinition, invoiceDefinition, productDefinition] = await Promise.all([
      this.definition(tenantId, "customer"),
      this.definition(tenantId, "supplier"),
      this.definition(tenantId, "invoice"),
      this.definition(tenantId, "product"),
    ]);
    await db.transaction(async (tx) => {
      const customers = await tx.select().from(schema.contacts)
        .where(and(eq(schema.contacts.tenantId, tenantId), eq(schema.contacts.isCustomer, true),
          isNull(schema.contacts.deletedAt)));
      const suppliers = await tx.select().from(schema.contacts)
        .where(and(eq(schema.contacts.tenantId, tenantId), eq(schema.contacts.isVendor, true),
          isNull(schema.contacts.deletedAt)));
      const invoices = await tx.select({
        id: schema.invoices.id,
        tenantId: schema.invoices.tenantId,
        number: schema.invoices.number,
        status: schema.invoices.status,
        currency: schema.invoices.currency,
        total: schema.invoices.total,
        customerName: schema.contacts.name,
      }).from(schema.invoices).innerJoin(schema.contacts, and(
        eq(schema.contacts.id, schema.invoices.contactId),
        eq(schema.contacts.tenantId, tenantId),
      )).where(eq(schema.invoices.tenantId, tenantId));
      const products = await tx.select().from(schema.products)
        .where(eq(schema.products.tenantId, tenantId));
      const documents = [
        ...customers.map((row) => customerDocument(row, customerDefinition)).filter((row): row is IndexedDocument => row !== null),
        ...suppliers.map((row) => supplierDocument(row, supplierDefinition)).filter((row): row is IndexedDocument => row !== null),
        ...invoices.map((row) => invoiceDocument(row, invoiceDefinition)),
        ...products.map((row) => productDocument(row, productDefinition)),
      ];
      await tx.delete(schema.searchDocuments).where(and(
        eq(schema.searchDocuments.tenantId, tenantId),
        inArray(schema.searchDocuments.entityType, SEARCH_ENTITY_TYPES),
      ));
      if (documents.length) await tx.insert(schema.searchDocuments).values(documents);
    });
  }

  async reindexCustomer(tenantId: string, customerId: string): Promise<void> {
    const definition = await this.definition(tenantId, "customer");
    const [row] = await db.select().from(schema.contacts).where(and(
      eq(schema.contacts.tenantId, tenantId), eq(schema.contacts.id, customerId),
      isNull(schema.contacts.deletedAt),
    ));
    const document = row ? customerDocument(row, definition) : null;
    if (document) await upsertDocument(db, document);
    else await db.delete(schema.searchDocuments).where(and(
      eq(schema.searchDocuments.tenantId, tenantId),
      eq(schema.searchDocuments.entityType, "customer"),
      eq(schema.searchDocuments.entityId, customerId),
    ));
    const invoices = await db.select({ id: schema.invoices.id }).from(schema.invoices).where(and(
      eq(schema.invoices.tenantId, tenantId), eq(schema.invoices.contactId, customerId),
    ));
    for (const invoice of invoices) await this.reindexInvoice(tenantId, invoice.id);
  }

  async reindexSupplier(tenantId: string, supplierId: string): Promise<void> {
    const definition = await this.definition(tenantId, "supplier");
    const [row] = await db.select().from(schema.contacts).where(and(
      eq(schema.contacts.tenantId, tenantId), eq(schema.contacts.id, supplierId),
      isNull(schema.contacts.deletedAt),
    ));
    const document = row ? supplierDocument(row, definition) : null;
    if (document) await upsertDocument(db, document);
    else await db.delete(schema.searchDocuments).where(and(
      eq(schema.searchDocuments.tenantId, tenantId),
      eq(schema.searchDocuments.entityType, "supplier"),
      eq(schema.searchDocuments.entityId, supplierId),
    ));
  }

  async reindexInvoice(tenantId: string, invoiceId: string): Promise<void> {
    const definition = await this.definition(tenantId, "invoice");
    const [row] = await db.select({
      id: schema.invoices.id,
      tenantId: schema.invoices.tenantId,
      number: schema.invoices.number,
      status: schema.invoices.status,
      currency: schema.invoices.currency,
      total: schema.invoices.total,
      customerName: schema.contacts.name,
    }).from(schema.invoices).innerJoin(schema.contacts, and(
      eq(schema.contacts.id, schema.invoices.contactId),
      eq(schema.contacts.tenantId, tenantId),
    )).where(and(eq(schema.invoices.tenantId, tenantId), eq(schema.invoices.id, invoiceId)));
    if (row) await upsertDocument(db, invoiceDocument(row, definition));
    else await db.delete(schema.searchDocuments).where(and(
      eq(schema.searchDocuments.tenantId, tenantId),
      eq(schema.searchDocuments.entityType, "invoice"),
      eq(schema.searchDocuments.entityId, invoiceId),
    ));
  }

  async reindexProduct(tenantId: string, productId: string): Promise<void> {
    const definition = await this.definition(tenantId, "product");
    const [row] = await db.select().from(schema.products).where(and(
      eq(schema.products.tenantId, tenantId), eq(schema.products.id, productId),
    ));
    if (row) await upsertDocument(db, productDocument(row, definition));
    else await db.delete(schema.searchDocuments).where(and(
      eq(schema.searchDocuments.tenantId, tenantId),
      eq(schema.searchDocuments.entityType, "product"),
      eq(schema.searchDocuments.entityId, productId),
    ));
  }

  async search<TDocument>(query: SearchQuery, scope: SearchScope): Promise<SearchResponse<TDocument>> {
    await this.reconcileTenant(scope.tenantId);
    const requestedTypes = query.entityTypes?.length
      ? query.entityTypes.map((value) => {
        if (!SEARCH_ENTITY_TYPES.includes(value as SearchEntityType)) {
          throw new InvalidSearchQueryError(`Unsupported search entity type: ${value}`);
        }
        return value as SearchEntityType;
      })
      : [...SEARCH_ENTITY_TYPES];
    const permissions = new Set(scope.permissions ?? []);
    const definitions = new Map<SearchEntityType, MetadataObjectDefinition>();
    for (const type of requestedTypes) definitions.set(type, await this.definition(scope.tenantId, type));
    const allowedTypes = requestedTypes.filter((type) => permissions.has(searchPermission(definitions.get(type)!)));
    if (!allowedTypes.length) return { results: [] };

    const normalizedQuery = normalizeSearchText([query.text]);
    const terms = [...new Set(normalizedQuery.split(" "))].slice(0, 12);
    const fingerprint = cursorFingerprint(query, allowedTypes);
    const offset = decodeCursor(query.cursor, fingerprint);
    const limit = query.limit ?? 25;
    const score = sql<number>`CASE
      WHEN lower(${schema.searchDocuments.title}) = ${normalizedQuery} THEN 100
      WHEN position(${normalizedQuery} in lower(${schema.searchDocuments.title})) = 1 THEN 80
      WHEN position(${normalizedQuery} in lower(${schema.searchDocuments.title})) > 0 THEN 60
      ELSE 40 END`;
    const rows = await db.select({
      entityId: schema.searchDocuments.entityId,
      entityType: schema.searchDocuments.entityType,
      title: schema.searchDocuments.title,
      document: schema.searchDocuments.document,
      score,
    }).from(schema.searchDocuments).where(and(
      eq(schema.searchDocuments.tenantId, scope.tenantId),
      inArray(schema.searchDocuments.entityType, allowedTypes),
      inArray(schema.searchDocuments.permission, [...permissions]),
      ...terms.map((term) => sql`position(${term} in ${schema.searchDocuments.searchText}) > 0`),
    )).orderBy(desc(score), asc(schema.searchDocuments.title), asc(schema.searchDocuments.entityId))
      .limit(limit + 1).offset(offset);
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    return {
      results: page.map((row) => ({
        id: row.entityId,
        entityType: row.entityType,
        title: row.title,
        document: row.document as TDocument,
        score: row.score,
        object: (() => {
          const definition = definitions.get(row.entityType as SearchEntityType)!;
          return {
            key: definition.key,
            version: definition.version,
            labelKey: definition.labelKey,
            fallbackLabel: definition.fallbackLabel,
            navigation: definition.navigation,
          };
        })(),
      })),
      ...(hasMore ? { nextCursor: encodeCursor(offset + limit, fingerprint) } : {}),
    };
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function subscribeSearchIndex(bus: EventBusContract, adapter: SearchApplicationAdapter): void {
  const reindex = (event: { tenantId: string | null }, entityId: string, handler: (tenantId: string, id: string) => Promise<void>) => {
    if (event.tenantId && UUID.test(event.tenantId) && UUID.test(entityId)) return handler(event.tenantId, entityId);
  };
  bus.subscribe<DomainEventPayloads["customer.changed"]>(DOMAIN_EVENTS.CUSTOMER_CHANGED, (event) =>
    reindex(event, event.payload.customerId, adapter.reindexCustomer.bind(adapter)));
  bus.subscribe<DomainEventPayloads["supplier.changed"]>(DOMAIN_EVENTS.SUPPLIER_CHANGED, (event) =>
    reindex(event, event.payload.supplierId, adapter.reindexSupplier.bind(adapter)));
  bus.subscribe<DomainEventPayloads["product.changed"]>(DOMAIN_EVENTS.PRODUCT_CHANGED, (event) =>
    reindex(event, event.payload.productId, adapter.reindexProduct.bind(adapter)));
  bus.subscribe<DomainEventPayloads["invoice.changed"]>(DOMAIN_EVENTS.INVOICE_CHANGED, (event) =>
    reindex(event, event.payload.invoiceId, adapter.reindexInvoice.bind(adapter)));
  bus.subscribe<DomainEventPayloads["invoice.issued"]>(DOMAIN_EVENTS.INVOICE_ISSUED, (event) =>
    reindex(event, event.payload.invoiceId, adapter.reindexInvoice.bind(adapter)));
  bus.subscribe<DomainEventPayloads["payment.recorded"]>(DOMAIN_EVENTS.PAYMENT_RECORDED, (event) =>
    reindex(event, event.payload.invoiceId, adapter.reindexInvoice.bind(adapter)));
  bus.subscribe<DomainEventPayloads["invoice.voided"]>(DOMAIN_EVENTS.INVOICE_VOIDED, (event) =>
    reindex(event, event.payload.invoiceId, adapter.reindexInvoice.bind(adapter)));
  bus.subscribe<DomainEventPayloads["stock.moved"]>(DOMAIN_EVENTS.STOCK_MOVED, (event) =>
    reindex(event, event.payload.productId, adapter.reindexProduct.bind(adapter)));
  bus.subscribe<DomainEventPayloads["stock.adjusted"]>(DOMAIN_EVENTS.STOCK_ADJUSTED, (event) =>
    reindex(event, event.payload.productId, adapter.reindexProduct.bind(adapter)));
}
