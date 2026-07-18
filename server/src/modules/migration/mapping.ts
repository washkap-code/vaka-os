import type { MetadataRegistryContract } from "../../platform/metadata/interfaces.js";
import type { FieldDefinition } from "../../platform/metadata/types.js";
import type { MappingSuggestion, MigrationObjectType } from "./types.js";

const DENIED_FIELDS = new Set([
  "id", "tenantId", "createdAt", "deletedAt", "deletedBy", "ownerUserId", "isCustomer", "isVendor",
]);

const aliases: Record<string, string> = {
  company: "name",
  companyname: "name",
  customername: "name",
  suppliername: "name",
  contactname: "name",
  emailaddress: "email",
  telephone: "phone",
  mobile: "phone",
  physicaladdress: "address",
  taxid: "taxNumber",
  vatnumber: "taxNumber",
  bpnumber: "taxNumber",
  itemcode: "sku",
  productcode: "sku",
  itemname: "name",
  productname: "name",
  unit: "unitOfMeasure",
  uom: "unitOfMeasure",
  cost: "costPrice",
  purchaseprice: "costPrice",
  price: "salePrice",
  sellingprice: "salePrice",
  vatrate: "taxRate",
  vattreatment: "taxTreatment",
  minimumstock: "reorderLevel",
  active: "isActive",
};

export function normaliseMappingName(value: string): string {
  return value.trim().replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLocaleLowerCase("en")
    .replace(/[^a-z0-9]+/g, "").trim();
}

function levenshtein(left: string, right: string): number {
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = row[0];
    row[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const previous = row[rightIndex];
      row[rightIndex] = Math.min(
        row[rightIndex] + 1,
        row[rightIndex - 1] + 1,
        diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
      diagonal = previous;
    }
  }
  return row[right.length];
}

export function importableFields(registry: MetadataRegistryContract, objectType: MigrationObjectType): readonly FieldDefinition[] {
  return registry.getFields(objectType).filter((field) => field.apiExposed && !DENIED_FIELDS.has(field.name));
}

export function suggestMappings(
  registry: MetadataRegistryContract,
  objectType: MigrationObjectType,
  headers: readonly string[],
): MappingSuggestion[] {
  const fields = importableFields(registry, objectType);
  const used = new Set<string>();
  return headers.map((column) => {
    const source = normaliseMappingName(column);
    const candidates = fields.filter((field) => !used.has(field.name)).map((field) => {
      const target = normaliseMappingName(field.name);
      if (source === target) return { field: field.name, score: 100, reason: "exact" as const };
      if (aliases[source] === field.name) return { field: field.name, score: 95, reason: "alias" as const };
      const distance = levenshtein(source, target);
      const score = Math.max(0, Math.round((1 - distance / Math.max(source.length, target.length, 1)) * 100));
      return { field: field.name, score, reason: "fuzzy" as const };
    }).sort((a, b) => b.score - a.score || a.field.localeCompare(b.field, "en"));
    const best = candidates[0];
    if (!best || best.score < 55) return { column, field: null, score: best?.score ?? 0, reason: "none" };
    used.add(best.field);
    return { column, ...best };
  });
}
