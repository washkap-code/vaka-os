import { z } from "zod";
import { InvalidMetadataError } from "./platform/metadata/errors.js";
import type { MetadataProvider } from "./platform/metadata/interfaces.js";
import type {
  MetadataFieldDefinition, MetadataObjectDefinition, MetadataRecord,
} from "./platform/metadata/types.js";

export const METADATA_OBJECT_KEYS = ["company", "customer", "invoice", "product"] as const;
export type MetadataObjectKey = typeof METADATA_OBJECT_KEYS[number];
export const METADATA_REGISTRY_VERSION = "2026-07-13.1" as const;

export const metadataQuerySchema = z.object({
  keys: z.preprocess(
    (value) => typeof value === "string" ? value.split(",").filter(Boolean) : value,
    z.array(z.enum(METADATA_OBJECT_KEYS)).max(METADATA_OBJECT_KEYS.length).optional(),
  ),
}).strict();

function field(
  key: string,
  sourceField: string,
  valueType: MetadataFieldDefinition["valueType"],
  format: MetadataFieldDefinition["format"],
  classification: MetadataFieldDefinition["classification"],
  options: Partial<Pick<MetadataFieldDefinition,
    "required" | "choices" | "searchable" | "result" | "aiExposure">> = {},
): MetadataFieldDefinition {
  return {
    key,
    sourceField,
    valueType,
    format,
    classification,
    labelKey: `metadata.fields.${key}`,
    required: options.required ?? false,
    choices: options.choices,
    searchable: options.searchable ?? false,
    result: options.result ?? false,
    aiExposure: options.aiExposure ?? "excluded",
  };
}

export const CANONICAL_METADATA_OBJECTS: readonly MetadataObjectDefinition[] = [
  {
    key: "company",
    version: METADATA_REGISTRY_VERSION,
    canonicalName: "Organisation",
    sourceTable: "tenants",
    tenantScoped: true,
    surrogateNote: "The current tenant workspace/company projection is not a LegalEntity and must not be used to infer statutory ownership.",
    titleField: "companyName",
    lifecycleField: "status",
    readPermission: null,
    writePermission: "settings.manage",
    labelKey: "metadata.objects.company.label",
    pluralLabelKey: "metadata.objects.company.plural",
    fallbackLabel: "Company",
    fallbackPluralLabel: "Companies",
    navigation: { section: "settings", recordView: null },
    searchable: false,
    aiContext: "future-read-only",
    fields: [
      field("id", "tenants.id", "string", "uuid", "internal", { required: true, result: true }),
      field("companyName", "tenants.companyName", "string", "text", "internal", { required: true, result: true, aiExposure: "allowed" }),
      field("baseCurrency", "tenants.baseCurrency", "choice", "currency", "internal", { required: true, choices: ["USD", "ZWG"], result: true, aiExposure: "allowed" }),
      field("countryCode", "tenants.countryCode", "string", "text", "internal", { required: true, result: true, aiExposure: "allowed" }),
      field("status", "tenants.status", "choice", "enum", "internal", { required: true, result: true, aiExposure: "allowed" }),
      field("taxNumber", "tenants.taxNumber", "string", "text", "restricted"),
      field("vatNumber", "tenants.vatNumber", "string", "text", "restricted"),
      field("registrationNumber", "tenants.registrationNumber", "string", "text", "confidential"),
    ],
  },
  {
    key: "customer",
    version: METADATA_REGISTRY_VERSION,
    canonicalName: "CustomerAccount",
    sourceTable: "contacts",
    tenantScoped: true,
    surrogateNote: "Customer is currently a role on contacts where isCustomer is true; the target Party/CustomerAccount separation is incomplete.",
    titleField: "name",
    lifecycleField: null,
    readPermission: "crm.read",
    writePermission: "crm.write",
    labelKey: "metadata.objects.customer.label",
    pluralLabelKey: "metadata.objects.customer.plural",
    fallbackLabel: "Customer",
    fallbackPluralLabel: "Customers",
    navigation: { section: "crm", recordView: "customer" },
    searchable: true,
    aiContext: "future-read-only",
    fields: [
      field("id", "contacts.id", "string", "uuid", "internal", { required: true, result: true }),
      field("name", "contacts.name", "string", "text", "confidential", { required: true, searchable: true, result: true, aiExposure: "allowed" }),
      field("type", "contacts.type", "choice", "enum", "internal", { required: true, choices: ["INDIVIDUAL", "COMPANY"], result: true, aiExposure: "allowed" }),
      field("tags", "contacts.tags", "string", "string-list", "confidential", { searchable: true }),
      field("email", "contacts.email", "string", "text", "restricted"),
      field("phone", "contacts.phone", "string", "text", "restricted"),
      field("address", "contacts.address", "string", "text", "restricted"),
      field("taxNumber", "contacts.taxNumber", "string", "text", "restricted"),
    ],
  },
  {
    key: "invoice",
    version: METADATA_REGISTRY_VERSION,
    canonicalName: "Invoice",
    sourceTable: "invoices",
    tenantScoped: true,
    surrogateNote: "Tenant is the current accounting-entity surrogate; LegalEntity ownership and fiscal-period metadata are incomplete.",
    titleField: "number",
    lifecycleField: "status",
    readPermission: "accounting.read",
    writePermission: "accounting.post",
    labelKey: "metadata.objects.invoice.label",
    pluralLabelKey: "metadata.objects.invoice.plural",
    fallbackLabel: "Invoice",
    fallbackPluralLabel: "Invoices",
    navigation: { section: "accounting", recordView: "invoice" },
    searchable: true,
    aiContext: "future-read-only",
    fields: [
      field("id", "invoices.id", "string", "uuid", "internal", { required: true, result: true }),
      field("number", "invoices.number", "string", "text", "internal", { searchable: true, result: true, aiExposure: "allowed" }),
      field("status", "invoices.status", "choice", "enum", "internal", { required: true, searchable: true, result: true, aiExposure: "allowed" }),
      field("currency", "invoices.currency", "choice", "currency", "internal", { required: true, choices: ["USD", "ZWG"], result: true, aiExposure: "allowed" }),
      field("total", "invoices.total", "string", "money", "confidential", { required: true, result: true, aiExposure: "allowed" }),
      field("customerId", "invoices.contactId", "string", "uuid", "confidential", { required: true }),
      field("customerName", "contacts.name", "string", "text", "confidential", { searchable: true, result: true, aiExposure: "allowed" }),
      field("taxTreatment", "invoices.taxTreatment", "choice", "enum", "confidential", { aiExposure: "allowed" }),
      field("notes", "invoices.notes", "string", "text", "restricted"),
    ],
  },
  {
    key: "product",
    version: METADATA_REGISTRY_VERSION,
    canonicalName: "Product",
    sourceTable: "products",
    tenantScoped: true,
    surrogateNote: "Product and SKU are currently one table projection; category, variant and governed catalogue dimensions are incomplete.",
    titleField: "name",
    lifecycleField: "isActive",
    readPermission: "inventory.read",
    writePermission: "inventory.write",
    labelKey: "metadata.objects.product.label",
    pluralLabelKey: "metadata.objects.product.plural",
    fallbackLabel: "Product",
    fallbackPluralLabel: "Products",
    navigation: { section: "inventory", recordView: "product" },
    searchable: true,
    aiContext: "future-read-only",
    fields: [
      field("id", "products.id", "string", "uuid", "internal", { required: true, result: true }),
      field("sku", "products.sku", "string", "text", "internal", { required: true, searchable: true, result: true, aiExposure: "allowed" }),
      field("name", "products.name", "string", "text", "internal", { required: true, searchable: true, result: true, aiExposure: "allowed" }),
      field("description", "products.description", "string", "text", "internal", { searchable: true, aiExposure: "allowed" }),
      field("currency", "products.currency", "choice", "currency", "internal", { required: true, choices: ["USD", "ZWG"], result: true, aiExposure: "allowed" }),
      field("salePrice", "products.salePrice", "string", "money", "confidential", { required: true, result: true, aiExposure: "allowed" }),
      field("isActive", "products.isActive", "boolean", "boolean", "internal", { required: true, result: true, aiExposure: "allowed" }),
      field("trackStock", "products.trackStock", "boolean", "boolean", "internal", { required: true, result: true, aiExposure: "allowed" }),
      field("costPrice", "products.costPrice", "string", "money", "restricted"),
      field("taxRate", "products.taxRate", "string", "text", "restricted"),
    ],
  },
];

function validateRegistry(objects: readonly MetadataObjectDefinition[]): void {
  const objectKeys = new Set<string>();
  for (const object of objects) {
    if (!/^[a-z][a-z0-9-]*$/.test(object.key) || objectKeys.has(object.key)) {
      throw new InvalidMetadataError(`Invalid or duplicate metadata object key: ${object.key}`);
    }
    objectKeys.add(object.key);
    if (!object.tenantScoped || !object.sourceTable.trim() || !object.labelKey.trim() || !object.fallbackLabel.trim()) {
      throw new InvalidMetadataError(`Metadata object ${object.key} is missing governance fields`);
    }
    if (object.searchable && !object.readPermission) {
      throw new InvalidMetadataError(`Searchable metadata object ${object.key} requires a read permission`);
    }
    const fieldKeys = new Set<string>();
    for (const definition of object.fields) {
      if (!definition.key.trim() || fieldKeys.has(definition.key) || !definition.sourceField.trim() || !definition.labelKey.trim()) {
        throw new InvalidMetadataError(`Invalid or duplicate field on metadata object ${object.key}: ${definition.key}`);
      }
      fieldKeys.add(definition.key);
      if (!object.searchable && definition.searchable) {
        throw new InvalidMetadataError(`Non-searchable metadata object ${object.key} has searchable field ${definition.key}`);
      }
      if (definition.classification === "restricted" && definition.aiExposure !== "excluded") {
        throw new InvalidMetadataError(`Restricted metadata field ${object.key}.${definition.key} must be excluded from AI`);
      }
    }
    if (!fieldKeys.has(object.titleField) || (object.lifecycleField && !fieldKeys.has(object.lifecycleField))) {
      throw new InvalidMetadataError(`Metadata object ${object.key} references an undefined title or lifecycle field`);
    }
  }
}

export class CanonicalMetadataProvider implements MetadataProvider {
  private readonly byKey: ReadonlyMap<string, MetadataObjectDefinition>;
  private readonly registry: readonly MetadataObjectDefinition[];

  constructor(registry: readonly MetadataObjectDefinition[] = CANONICAL_METADATA_OBJECTS) {
    validateRegistry(registry);
    this.registry = Object.freeze(registry.map((object) => Object.freeze({
      ...object,
      navigation: Object.freeze({ ...object.navigation }),
      fields: Object.freeze(object.fields.map((definition) => Object.freeze({ ...definition }))),
    })));
    this.byKey = new Map(this.registry.map((object) => [object.key, object]));
  }

  async objects(tenantId: string): Promise<readonly MetadataObjectDefinition[]> {
    this.requireTenant(tenantId);
    return this.registry;
  }

  async object(entityType: string, tenantId: string): Promise<MetadataObjectDefinition | null> {
    this.requireTenant(tenantId);
    return this.byKey.get(entityType) ?? null;
  }

  async definitions(entityType: string, tenantId: string): Promise<readonly MetadataFieldDefinition[]> {
    return (await this.object(entityType, tenantId))?.fields ?? [];
  }

  async read(_record: Pick<MetadataRecord, "tenantId" | "entityType" | "entityId">): Promise<MetadataRecord | null> {
    this.requireTenant(_record.tenantId);
    return null;
  }

  async write(_record: MetadataRecord): Promise<MetadataRecord> {
    this.requireTenant(_record.tenantId);
    throw new InvalidMetadataError("Canonical metadata registry is read-only; custom metadata values are not implemented");
  }

  private requireTenant(tenantId: string): void {
    if (!tenantId.trim()) throw new InvalidMetadataError("Metadata tenantId is required");
  }
}
