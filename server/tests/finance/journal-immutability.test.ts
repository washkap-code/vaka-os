import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db, schema } from "../../src/lib.js";
import { createIssuedServiceInvoice, signupFinanceTenant } from "./helpers.js";

describe("finance kernel - posted journal immutability evidence", () => {
  it("rejects direct updates to posted journal headers and lines", async () => {
    const tenant = await signupFinanceTenant("journal-mutable");
    const invoice = await createIssuedServiceInvoice(tenant, "journal-mutable");
    const [entry] = await db.select().from(schema.journalEntries)
      .where(eq(schema.journalEntries.sourceId, invoice.id));
    expect(entry).toBeTruthy();
    const [line] = await db.select().from(schema.journalLines)
      .where(eq(schema.journalLines.journalEntryId, entry.id));
    expect(line).toBeTruthy();

    await expect(db.transaction((tx) =>
      tx.update(schema.journalEntries)
        .set({ memo: "MUTATED INSIDE ROLLBACK" })
        .where(eq(schema.journalEntries.id, entry.id))
        .returning())).rejects.toThrow(/Failed query/);

    await expect(db.transaction((tx) =>
      tx.update(schema.journalLines)
        .set({ debit: "999.99" })
        .where(eq(schema.journalLines.id, line.id))
        .returning())).rejects.toThrow(/Failed query/);

    const [afterEntry] = await db.select().from(schema.journalEntries)
      .where(eq(schema.journalEntries.id, entry.id));
    const [afterLine] = await db.select().from(schema.journalLines)
      .where(eq(schema.journalLines.id, line.id));
    expect(afterEntry.memo).toBe(entry.memo);
    expect(afterLine.debit).toBe(line.debit);
  });

  it("rejects direct deletion of posted journals and lines while preserving history", async () => {
    const tenant = await signupFinanceTenant("journal-cascade");
    const invoice = await createIssuedServiceInvoice(tenant, "journal-cascade");
    const [entry] = await db.select().from(schema.journalEntries)
      .where(eq(schema.journalEntries.sourceId, invoice.id));
    const beforeLines = await db.select().from(schema.journalLines)
      .where(eq(schema.journalLines.journalEntryId, entry.id));
    expect(beforeLines.length).toBeGreaterThan(0);

    await expect(db.transaction((tx) =>
      tx.delete(schema.journalEntries).where(eq(schema.journalEntries.id, entry.id))))
      .rejects.toThrow(/Failed query/);

    await expect(db.transaction((tx) =>
      tx.delete(schema.journalLines).where(eq(schema.journalLines.id, beforeLines[0].id))))
      .rejects.toThrow(/Failed query/);

    const afterLines = await db.select().from(schema.journalLines)
      .where(eq(schema.journalLines.journalEntryId, entry.id));
    expect(afterLines).toHaveLength(beforeLines.length);
  });
});
