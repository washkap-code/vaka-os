import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as schema from "../../../src/db/schema.js";
import { CANONICAL_OBJECT_DEFINITIONS } from "../../../src/platform/metadata/definitions.js";
import {
  InvalidMetadataRegistryError,
  UnknownMetadataObjectError,
} from "../../../src/platform/metadata/errors.js";
import { MetadataRegistry } from "../../../src/platform/metadata/registry.js";

const UUID_A = "11111111-1111-4111-8111-111111111111";

describe("MetadataRegistry registration and retrieval", () => {
  it("registers the canonical business objects with real Drizzle field names", () => {
    const registry = new MetadataRegistry();
    expect(registry.listObjects().map((definition) => definition.name)).toEqual([
      "Company", "Customer", "Supplier", "Invoice", "Payment", "Product", "Employee", "User",
      "BusinessProfile",
    ]);
    expect(registry.getFields("Company").map((field) => field.name))
      .toEqual(Object.keys(getTableColumns(schema.tenants)));
    expect(registry.getFields("Customer").map((field) => field.name))
      .toEqual(Object.keys(getTableColumns(schema.contacts)));
    expect(registry.getFields("Supplier").map((field) => field.name))
      .toEqual(Object.keys(getTableColumns(schema.contacts)));
    expect(registry.getFields("Invoice").map((field) => field.name))
      .toEqual(Object.keys(getTableColumns(schema.invoices)));
    expect(registry.getFields("Payment").map((field) => field.name))
      .toEqual(Object.keys(getTableColumns(schema.payments)));
    expect(registry.getFields("Product").map((field) => field.name))
      .toEqual(Object.keys(getTableColumns(schema.products)));
    expect(registry.getFields("Employee").map((field) => field.name))
      .toEqual(Object.keys(getTableColumns(schema.employees)));
    expect(registry.getFields("User").map((field) => field.name))
      .toEqual(Object.keys(getTableColumns(schema.users)));
    expect(registry.getFields("BusinessProfile").map((field) => field.name))
      .toEqual(Object.keys(getTableColumns(schema.businessProfiles)));
  });

  it("retrieves immutable objects, fields, relationships and domain lists", () => {
    const registry = new MetadataRegistry();
    expect(registry.getObject("customer")).toMatchObject({
      name: "Customer",
      parent: "Company",
      domain: "crm",
      searchable: true,
      aiVisible: true,
      auditEnabled: true,
    });
    expect(registry.getRelationships("Invoice")).toContainEqual({
      name: "customer",
      target: "Customer",
      cardinality: "many-to-one",
      cascade: false,
    });
    expect(registry.listObjects("FINANCE").map((definition) => definition.name))
      .toEqual(["Invoice", "Payment"]);
    expect(Object.isFrozen(registry.listObjects())).toBe(true);
    expect(Object.isFrozen(registry.getObject("Product"))).toBe(true);
    expect(Object.isFrozen(registry.getFields("Product"))).toBe(true);
    expect(Object.isFrozen(registry.getRelationships("Product"))).toBe(true);
  });

  it("keeps AI write authority closed and restricted fields unreadable", () => {
    const registry = new MetadataRegistry();
    const fields = registry.listObjects().flatMap((definition) => definition.fields);
    expect(fields.every((field) => field.aiWritable === false)).toBe(true);
    expect(fields.filter((field) => field.classification === "restricted")
      .every((field) => field.aiReadable === false)).toBe(true);
    expect(registry.getObject("Employee").aiVisible).toBe(false);
    expect(registry.getObject("User").aiVisible).toBe(false);
  });

  it("fails construction for duplicate metadata shape", () => {
    const company = CANONICAL_OBJECT_DEFINITIONS[0];
    expect(() => new MetadataRegistry([{
      ...company,
      relationships: [],
      fields: [...company.fields, company.fields[0]],
    }])).toThrow(InvalidMetadataRegistryError);
  });

  it("throws a typed error for unknown objects across every query path", () => {
    const registry = new MetadataRegistry();
    expect(() => registry.getObject("Ledger")).toThrow(UnknownMetadataObjectError);
    expect(() => registry.getFields("Ledger")).toThrow("Unknown metadata object: Ledger");
    expect(() => registry.getRelationships("Ledger")).toThrow("Unknown metadata object: Ledger");
    expect(() => registry.validate("Ledger", {})).toThrow(UnknownMetadataObjectError);
  });

});

describe("MetadataRegistry validation", () => {
  const registry = new MetadataRegistry();

  it("accepts valid payloads for every registered object", () => {
    const payloads: Record<string, Record<string, unknown>> = {
      Company: { companyName: "VAKA Test", subdomain: "vaka-test", baseCurrency: "USD" },
      Customer: { name: "Mutare Retail", type: "COMPANY", email: "ops@mutare.example", tags: ["priority"] },
      Supplier: { name: "Bulawayo Supply", supplierCode: "BYO-001", supplierPaymentTermsDays: 30 },
      Invoice: { contactId: UUID_A, currency: "ZWG", total: "1250.00", taxDate: "2026-07-18" },
      Payment: { invoiceId: UUID_A, amount: "1250.00", currency: "ZWG", date: "2026-07-18T10:30:00.000Z" },
      Product: { sku: "VAKA-001", name: "Ledger Book", salePrice: "5.50", reorderLevel: 10, trackStock: true },
      Employee: { employeeNumber: "EMP-001", firstName: "Tariro", lastName: "Moyo", currency: "USD", basicSalary: "850.00" },
      User: { email: "owner@vaka.example", fullName: "VAKA Owner", status: "active" },
      BusinessProfile: {
        companyId: UUID_A,
        slug: "vaka-test-business",
        name: "VAKA Test Business",
        description: "A complete public business profile describing the company's capabilities, operating footprint, customer outcomes, and reliable contact path.",
        industryPrimary: "professional-services",
        country: "ZW",
        emailPublic: "hello@vaka.example",
      },
    };
    for (const [objectName, payload] of Object.entries(payloads)) {
      expect(registry.validate(objectName, payload), objectName).toEqual({ valid: true, errors: [] });
    }
  });

  it("enforces required fields", () => {
    expect(registry.validate("Customer", { email: "hello@example.com" })).toMatchObject({
      valid: false,
      errors: [{ field: "name", code: "required" }],
    });
  });

  it("enforces maximum lengths", () => {
    const result = registry.validate("Product", { sku: "A".repeat(65), name: "Valid name" });
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.objectContaining({ field: "sku", code: "max_length" }));
  });

  it("enforces declared types and validation formats", () => {
    const wrongType = registry.validate("Payment", {
      invoiceId: UUID_A,
      amount: 10,
      currency: "USD",
      date: "2026-07-18T10:30:00.000Z",
    });
    expect(wrongType.errors).toContainEqual(expect.objectContaining({ field: "amount", code: "type" }));
    const wrongFormat = registry.validate("Employee", {
      employeeNumber: "EMP-002",
      firstName: "Rudo",
      lastName: "Ncube",
      currency: "EUR",
      basicSalary: "850.000",
    });
    expect(wrongFormat.errors).toContainEqual(expect.objectContaining({ field: "currency", code: "validation" }));
    expect(wrongFormat.errors).toContainEqual(expect.objectContaining({ field: "basicSalary", code: "validation" }));
  });

  it("enforces unique-item and strict object-shape rules without database calls", () => {
    const result = registry.validate("Customer", {
      name: "Harare Foods",
      tags: ["priority", "PRIORITY"],
      inventedField: true,
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.objectContaining({ field: "tags", code: "unique" }));
    expect(result.errors).toContainEqual(expect.objectContaining({ field: "inventedField", code: "unknown_field" }));
  });

  it("rejects non-object payloads", () => {
    expect(registry.validate("Customer", null)).toEqual({
      valid: false,
      errors: [{ field: "$", code: "payload", message: "Payload must be an object" }],
    });
  });

  it("enforces Business Profile publication length and contact rules without database calls", () => {
    const result = registry.validate("BusinessProfile", {
      companyId: UUID_A,
      slug: "short-profile",
      name: "Short profile",
      description: "Too short",
      industryPrimary: "manufacturing",
      country: "ZW",
    });
    expect(result.errors).toContainEqual(expect.objectContaining({ field: "description", code: "validation" }));
    expect(result.errors).toContainEqual(expect.objectContaining({ field: "phone|emailPublic|website", code: "required" }));
  });
});
