import { describe, expect, it } from "vitest";
import { MetadataRegistry } from "../../../src/platform/metadata/registry.js";
import {
  decodeCsvInput, MAX_MIGRATION_ROWS, parseCsvDocument,
} from "../../../src/modules/migration/csv.js";
import { suggestMappings } from "../../../src/modules/migration/mapping.js";

describe("P15-001 CSV intake", () => {
  it("detects delimiters and preserves quoted delimiters, escaped quotes, and line breaks", () => {
    const parsed = parseCsvDocument([
      "Company Name;Notes;Email",
      'Mazowe Foods;"Quoted; value";hello@mazowe.example',
      'Mutare Goods;"Line one\nLine ""two""";sales@mutare.example',
    ].join("\r\n"));
    expect(parsed.delimiter).toBe(";");
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0].raw.Notes).toBe("Quoted; value");
    expect(parsed.rows[1].raw.Notes).toBe('Line one\nLine "two"');
    expect(parsed.rows[1].rowNumber).toBe(3);
  });

  it("rejects malformed quoting, uneven rows, duplicate headers, and over-capacity documents", () => {
    expect(() => parseCsvDocument('name,email\n"Unclosed,hello@example.com')).toThrow(/unclosed/i);
    expect(() => parseCsvDocument("name,email\nOnly one cell")).toThrow(/expected 2/i);
    expect(() => parseCsvDocument("Name,name\nOne,Two")).toThrow(/unique/i);
    const oversized = ["name", ...Array.from({ length: MAX_MIGRATION_ROWS + 1 }, (_, index) => `Customer ${index}`)].join("\n");
    expect(() => parseCsvDocument(oversized)).toThrow(/10,000 row limit/i);
  });

  it("decodes UTF-16 and Windows-1252 uploads without replacing source characters", () => {
    const utf16 = Buffer.concat([
      Buffer.from([0xff, 0xfe]),
      Buffer.from("name,email\nTariro,tariro@example.com", "utf16le"),
    ]);
    const decodedUtf16 = decodeCsvInput({ contentBase64: utf16.toString("base64"), encoding: "auto" });
    expect(decodedUtf16.encoding).toBe("utf16le");
    expect(parseCsvDocument(decodedUtf16.text).rows[0].raw.name).toBe("Tariro");

    const windows = Buffer.from([110, 97, 109, 101, 10, 67, 97, 102, 233]);
    const decodedWindows = decodeCsvInput({ contentBase64: windows.toString("base64"), encoding: "auto" });
    expect(decodedWindows.encoding).toBe("windows1252");
    expect(parseCsvDocument(decodedWindows.text).rows[0].raw.name).toBe("Café");
    expect(() => decodeCsvInput({ contentBase64: "not base64", encoding: "auto" })).toThrow(/malformed/i);
  });

  it("parses exactly 10,000 data rows with accurate row numbers", () => {
    const csv = [
      "name,email",
      ...Array.from({ length: MAX_MIGRATION_ROWS }, (_, index) =>
        `Customer ${index + 1},customer-${index + 1}@example.com`),
    ].join("\n");
    const parsed = parseCsvDocument(csv);
    expect(parsed.rows).toHaveLength(10_000);
    expect(parsed.rows[0].rowNumber).toBe(2);
    expect(parsed.rows.at(-1)).toMatchObject({
      rowNumber: 10_001,
      raw: { name: "Customer 10000", email: "customer-10000@example.com" },
    });
  });
});

describe("P15-001 deterministic mapping suggestions", () => {
  it("uses registry fields with stable exact, alias, fuzzy, and no-match outcomes", () => {
    const suggestions = suggestMappings(new MetadataRegistry(), "Product", [
      "Product Code", "Item Name", "Selling Price", "Reordr Level", "Unrelated Column",
    ]);
    expect(suggestions).toEqual([
      { column: "Product Code", field: "sku", score: 95, reason: "alias" },
      { column: "Item Name", field: "name", score: 95, reason: "alias" },
      { column: "Selling Price", field: "salePrice", score: 95, reason: "alias" },
      expect.objectContaining({ column: "Reordr Level", field: "reorderLevel", reason: "fuzzy" }),
      expect.objectContaining({ column: "Unrelated Column", field: null, reason: "none" }),
    ]);
    expect(suggestMappings(new MetadataRegistry(), "Product", ["Product Code", "Item Name"]))
      .toEqual(suggestMappings(new MetadataRegistry(), "Product", ["Product Code", "Item Name"]));
  });
});
