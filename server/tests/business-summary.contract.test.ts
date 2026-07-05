import { describe, expect, it } from "vitest";
import {
  businessSummaryQuerySchema,
  getBusinessSummary,
  type BusinessSummaryContext,
} from "../src/ai/business-summary.js";
import type { DB } from "../src/lib.js";

const context: BusinessSummaryContext = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  actorUserId: "22222222-2222-4222-8222-222222222222",
  baseCurrency: "USD",
  permissions: ["reports.read", "accounting.read", "inventory.read", "crm.read"],
};

function fakeDatabase(resultSets: Array<{ rows: unknown[] }>): DB {
  let call = 0;
  return {
    execute: async () => {
      const result = resultSets[call];
      call += 1;
      if (!result) throw new Error(`Unexpected database call ${call}`);
      return result;
    },
  } as unknown as DB;
}

const period = {
  from: new Date("2026-07-01T00:00:00.000Z"),
  to: new Date("2026-07-31T23:59:59.000Z"),
};

describe("business summary contract", () => {
  it("preserves exact values and builds the versioned deterministic contract", async () => {
    const database = fakeDatabase([
      { rows: [{ income: "8450.00", expenses: "1250.25" }] },
      {
        rows: [
          { currency: "USD", outstanding: "8450.00", overdue: "8450.00" },
          { currency: "ZWG", outstanding: "1200.50", overdue: "0.00" },
        ],
      },
      {
        rows: [{
          invoice_id: "33333333-3333-4333-8333-333333333333",
          invoice_number: "INV-00042",
          customer_id: "44444444-4444-4444-8444-444444444444",
          customer_name: "Synthetic Customer",
          currency: "USD",
          outstanding: "8450.00",
          due_date: "2026-06-15T00:00:00.000Z",
          days_overdue: 46,
        }],
      },
      {
        rows: [{
          product_id: "55555555-5555-4555-8555-555555555555",
          sku: "SYN-001",
          name: "Synthetic Product",
          quantity_on_hand: "2.500",
          reorder_level: "5.000",
        }],
      },
      {
        rows: [{
          stage: "PROPOSAL",
          currency: "USD",
          deal_count: 3,
          value: "12500.00",
        }],
      },
    ]);

    const summary = await getBusinessSummary(context, period, {
      database,
      generatedAt: new Date("2026-08-01T08:00:00.000Z"),
    });

    expect(summary.schemaVersion).toBe("1.0");
    expect(summary.kind).toBe("vaka.business_summary");
    expect(summary.scope).toEqual({
      tenantId: context.tenantId,
      actorUserId: context.actorUserId,
      baseCurrency: "USD",
      period: {
        from: "2026-07-01T00:00:00.000Z",
        to: "2026-07-31T23:59:59.000Z",
        timeZone: "Africa/Harare",
      },
    });

    const financial = summary.sections.financialPerformance;
    expect(financial.status).toBe("available");
    if (financial.status === "available") {
      expect(financial.data.income).toBe("8450.00");
      expect(financial.data.expenses).toBe("1250.25");
      expect(financial.data.netProfit).toBe("7199.75");
    }

    const receivables = summary.sections.receivables;
    expect(receivables.status).toBe("available");
    if (receivables.status === "available") {
      expect(receivables.data.totals).toEqual([
        { currency: "USD", amount: "8450.00" },
        { currency: "ZWG", amount: "1200.50" },
      ]);
      expect(receivables.data.attentionItems[0]).toEqual(expect.objectContaining({
        invoiceNumber: "INV-00042",
        outstanding: "8450.00",
        daysOverdue: 46,
      }));
    }

    const inventory = summary.sections.inventoryAttention;
    if (inventory.status === "available") {
      expect(inventory.data.items[0].quantityOnHand).toBe("2.500");
    }
    const pipeline = summary.sections.pipelineAttention;
    if (pipeline.status === "available") {
      expect(pipeline.data.stages[0]).toEqual({
        stage: "PROPOSAL",
        currency: "USD",
        dealCount: 3,
        value: "12500.00",
      });
    }
  });

  it("returns explicit unavailable sections when optional permissions are absent", async () => {
    const database = fakeDatabase([{ rows: [{ income: "0.00", expenses: "0.00" }] }]);
    const summary = await getBusinessSummary({
      ...context,
      permissions: ["reports.read"],
    }, period, { database, generatedAt: period.to });

    expect(summary.sections.financialPerformance.status).toBe("available");
    expect(summary.sections.receivables).toEqual({
      status: "unavailable",
      reason: "PERMISSION_REQUIRED",
      requiredPermission: "accounting.read",
    });
    expect(summary.sections.inventoryAttention).toEqual({
      status: "unavailable",
      reason: "PERMISSION_REQUIRED",
      requiredPermission: "inventory.read",
    });
    expect(summary.sections.pipelineAttention).toEqual({
      status: "unavailable",
      reason: "PERMISSION_REQUIRED",
      requiredPermission: "crm.read",
    });
  });

  it("rejects invalid periods before the service is called", () => {
    expect(() => businessSummaryQuerySchema.parse({
      from: "2026-07-05",
      to: "2026-07-04",
    })).toThrow(/from must be before/);

    expect(() => businessSummaryQuerySchema.parse({
      from: "2024-01-01",
      to: "2026-01-02",
    })).toThrow(/period cannot exceed/);
  });

  it("fails closed when a database value is not an exact decimal string", async () => {
    const database = fakeDatabase([{ rows: [{ income: "100", expenses: "0.00" }] }]);
    await expect(getBusinessSummary({
      ...context,
      permissions: ["reports.read"],
    }, period, { database, generatedAt: period.to })).rejects.toThrow(/Expected exact two-decimal money/);
  });
});
