import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db, schema } from "../../src/lib.js";
import { createIssuedServiceInvoice, signupFinanceTenant } from "./helpers.js";

describe("finance kernel - FX snapshot integrity", () => {
  it("preserves invoice and journal exchange-rate snapshots after later exchange-rate changes", async () => {
    const tenant = await signupFinanceTenant("fx-snapshot");
    const invoice = await createIssuedServiceInvoice(tenant, "fx-snapshot", {
      currency: "ZWG",
      rateToBase: "0.050000",
      unitPrice: "2000.00",
      taxRate: "15",
    });
    const [journal] = await db.select().from(schema.journalEntries)
      .where(and(
        eq(schema.journalEntries.tenantId, tenant.tenantId),
        eq(schema.journalEntries.sourceType, "invoice"),
        eq(schema.journalEntries.sourceId, invoice.id),
      ));
    expect(journal).toBeTruthy();
    const linesBefore = await db.select().from(schema.journalLines)
      .where(eq(schema.journalLines.journalEntryId, journal.id));
    const arLineBefore = linesBefore.find((line) => line.originalCurrency === "ZWG");
    expect(arLineBefore).toMatchObject({
      originalAmount: "2300.00",
      originalCurrency: "ZWG",
      exchangeRate: "0.050000",
      debit: "115.00",
    });

    const [rate] = await db.insert(schema.exchangeRates).values({
      tenantId: tenant.tenantId,
      fromCurrency: "ZWG",
      toCurrency: "USD",
      rate: "0.080000",
      effectiveDate: new Date("2026-07-08T00:00:00.000Z"),
    }).returning();
    expect(rate.rate).toBe("0.080000");

    const [invoiceAfter] = await db.select().from(schema.invoices).where(eq(schema.invoices.id, invoice.id));
    expect(invoiceAfter.rateToBase).toBe("0.050000");
    const linesAfter = await db.select().from(schema.journalLines)
      .where(eq(schema.journalLines.journalEntryId, journal.id));
    const arLineAfter = linesAfter.find((line) => line.originalCurrency === "ZWG");
    expect(arLineAfter).toMatchObject({
      originalAmount: "2300.00",
      originalCurrency: "ZWG",
      exchangeRate: "0.050000",
      debit: "115.00",
    });
  });
});
