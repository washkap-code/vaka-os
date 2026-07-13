// ============================================================================
// INVOICING — the cross-module heart of the platform.
// issueInvoice() runs ONE database transaction that:
//   1. assigns the immutable sequential invoice number
//   2. posts the revenue journal entry     (Dr AR / Cr Sales / Cr VAT Output)
//   3. posts COGS for stock-tracked lines  (Dr COGS / Cr Inventory)
//   4. decrements stock via the inventory ledger (refusing to oversell)
//   5. marks a linked CRM deal WON
//   6. writes the audit trail
// If ANY step fails, everything rolls back — the three modules can never
// disagree with each other.
// ============================================================================
import { and, eq } from "drizzle-orm";
import {
  DB, db, schema, badRequest, conflict, notFound,
  toCents, fromCents, mulRate, audit, nextDocNumber,
  assertIdempotencyFingerprint, payloadFingerprint, requireIdempotencyKey,
} from "./lib.js";
import { ensureBankLedgerAccount, postJournal, systemAccount } from "./accounting.js";
import { recordStockMovement } from "./inventory.js";
import { DOMAIN_EVENTS, runWithPostCommitEvents } from "./platform/events/index.js";

export interface DraftLine {
  productId?: string;
  warehouseId?: string;
  description: string;
  quantity: string;
  unitPrice: string;
  taxRate: string; // percent, e.g. "15"
}

export function computeTotals(lines: DraftLine[]) {
  let subtotal = 0n, taxTotal = 0n;
  const computed = lines.map((l) => {
    const qty = Number(l.quantity);
    if (!isFinite(qty) || qty <= 0) throw badRequest("Line quantity must be positive");
    const lineNet = mulRate(toCents(l.unitPrice), qty.toFixed(6));
    const lineTax = mulRate(lineNet, (Number(l.taxRate) / 100).toFixed(6));
    subtotal += lineNet; taxTotal += lineTax;
    return { ...l, lineTotal: fromCents(lineNet) };
  });
  return { computed, subtotal: fromCents(subtotal), taxTotal: fromCents(taxTotal), total: fromCents(subtotal + taxTotal) };
}

export async function createDraftInvoice(opts: {
  tenantId: string; contactId: string; currency: "USD" | "ZWG";
  rateToBase?: string; dueDate?: Date; notes?: string;
  lines: DraftLine[]; dealId?: string; createdBy?: string | null;
}) {
  if (!opts.lines.length) throw badRequest("Invoice needs at least one line");
  const { computed, subtotal, taxTotal, total } = computeTotals(opts.lines);
  return db.transaction(async (tx) => {
    const [contact] = await tx.select().from(schema.contacts).where(and(
      eq(schema.contacts.id, opts.contactId), eq(schema.contacts.tenantId, opts.tenantId)));
    if (!contact) throw notFound("Contact not found");

    const [inv] = await tx.insert(schema.invoices).values({
      tenantId: opts.tenantId, contactId: opts.contactId,
      currency: opts.currency, rateToBase: opts.rateToBase ?? "1",
      status: "DRAFT", dueDate: opts.dueDate ?? null, notes: opts.notes ?? null,
      subtotal, taxTotal, total, createdBy: opts.createdBy ?? null,
    }).returning();

    await tx.insert(schema.invoiceLineItems).values(computed.map((l) => ({
      invoiceId: inv.id, productId: l.productId ?? null, warehouseId: l.warehouseId ?? null,
      description: l.description, quantity: l.quantity, unitPrice: l.unitPrice,
      taxRate: l.taxRate, lineTotal: l.lineTotal,
    })));

    if (opts.dealId) {
      await tx.update(schema.deals).set({ wonInvoiceId: inv.id })
        .where(and(eq(schema.deals.id, opts.dealId), eq(schema.deals.tenantId, opts.tenantId)));
    }
    await audit(tx, opts.tenantId, opts.createdBy ?? null, "invoice.drafted", "invoice", inv.id);
    return inv;
  });
}

export async function issueInvoice(opts: { tenantId: string; invoiceId: string; createdBy?: string | null }) {
  return runWithPostCommitEvents((queue) => db.transaction(async (tx) => {
    const [inv] = await tx.select().from(schema.invoices).where(and(
      eq(schema.invoices.id, opts.invoiceId), eq(schema.invoices.tenantId, opts.tenantId)));
    if (!inv) throw notFound("Invoice not found");
    if (inv.status !== "DRAFT") throw conflict(`Only DRAFT invoices can be issued (status: ${inv.status})`);

    const lines = await tx.select().from(schema.invoiceLineItems)
      .where(eq(schema.invoiceLineItems.invoiceId, inv.id));
    if (!lines.length) throw badRequest("Invoice has no line items");
    const [issuer] = await tx.select().from(schema.tenants)
      .where(eq(schema.tenants.id, opts.tenantId));
    const [customer] = await tx.select().from(schema.contacts).where(and(
      eq(schema.contacts.id, inv.contactId),
      eq(schema.contacts.tenantId, opts.tenantId),
    ));
    if (!issuer || !customer) throw notFound("Invoice document party not found");

    // 1. immutable sequential number
    const number = await nextDocNumber(tx, opts.tenantId, "invoice", "INV");
    const issueDate = new Date();

    await tx.insert(schema.invoiceDocumentSnapshots).values({
      tenantId: opts.tenantId,
      invoiceId: inv.id,
      templateVersion: "invoice-document-v1",
      document: {
        issuedAt: issueDate.toISOString(),
        issuer: {
          companyName: issuer.companyName,
          logoUrl: issuer.logoUrl,
          brandPrimaryColor: issuer.brandPrimaryColor,
          brandSecondaryColor: issuer.brandSecondaryColor,
          physicalAddress: issuer.physicalAddress,
          registrationNumber: issuer.registrationNumber,
          taxNumber: issuer.taxNumber,
          vatNumber: issuer.vatNumber,
        },
        customer: {
          name: customer.name,
          address: customer.address,
          taxNumber: customer.taxNumber,
        },
        invoice: {
          id: inv.id,
          number,
          status: "ISSUED",
          currency: inv.currency,
          rateToBase: inv.rateToBase,
          issueDate: issueDate.toISOString(),
          dueDate: inv.dueDate?.toISOString() ?? null,
          subtotal: inv.subtotal,
          taxTotal: inv.taxTotal,
          total: inv.total,
          notes: inv.notes,
        },
        lines: lines.map((line) => ({
          description: line.description,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          taxRate: line.taxRate,
          lineTotal: line.lineTotal,
        })),
      },
    });

    // 2. revenue entry in base currency (rate snapshot from the invoice)
    const ar = await systemAccount(tx, opts.tenantId, "AR");
    const salesAcc = await systemAccount(tx, opts.tenantId, "SALES");
    const vatOut = await systemAccount(tx, opts.tenantId, "VAT_OUTPUT");
    const subtotalBase = mulRate(toCents(inv.subtotal), inv.rateToBase);
    const taxBase = mulRate(toCents(inv.taxTotal), inv.rateToBase);
    const totalBase = subtotalBase + taxBase;

    const jLines = [
      { accountId: ar.id, debit: fromCents(totalBase), originalAmount: inv.total, originalCurrency: inv.currency as "USD" | "ZWG", exchangeRate: inv.rateToBase },
      { accountId: salesAcc.id, credit: fromCents(subtotalBase) },
    ];
    if (taxBase > 0n) jLines.push({ accountId: vatOut.id, credit: fromCents(taxBase) } as any);
    await postJournal(tx, {
      tenantId: opts.tenantId, date: issueDate, memo: `Invoice ${number}`,
      sourceType: "invoice", sourceId: inv.id, createdBy: opts.createdBy, lines: jLines,
    });

    // 3+4. stock decrement + COGS for tracked product lines
    let cogsBase = 0n;
    for (const line of lines) {
      if (!line.productId) continue;
      const [product] = await tx.select().from(schema.products)
        .where(eq(schema.products.id, line.productId));
      if (!product || !product.trackStock) continue;
      let warehouseId = line.warehouseId;
      if (!warehouseId) {
        const [wh] = await tx.select().from(schema.warehouses).where(and(
          eq(schema.warehouses.tenantId, opts.tenantId), eq(schema.warehouses.isDefault, true)));
        if (!wh) throw badRequest(`Line "${line.description}" has no warehouse and no default warehouse exists`);
        warehouseId = wh.id;
      }
      const movement = await recordStockMovement(tx, {
        tenantId: opts.tenantId, productId: line.productId, warehouseId,
        quantityDelta: `-${line.quantity}`, unitCost: product.costPrice,
        reason: "SALE", sourceType: "invoice", sourceId: inv.id, createdBy: opts.createdBy,
      });
      queue({
        id: `${DOMAIN_EVENTS.STOCK_MOVED}:${movement.movementId}`,
        type: DOMAIN_EVENTS.STOCK_MOVED, tenantId: opts.tenantId, actorUserId: opts.createdBy ?? null,
        payload: { movementId: movement.movementId, productId: line.productId, warehouseId, quantityDelta: `-${line.quantity}`, kind: "SALE" },
      });
      cogsBase += mulRate(mulRate(toCents(product.costPrice), Number(line.quantity).toFixed(6)), "1");
    }
    if (cogsBase > 0n) {
      const cogs = await systemAccount(tx, opts.tenantId, "COGS");
      const inventory = await systemAccount(tx, opts.tenantId, "INVENTORY");
      await postJournal(tx, {
        tenantId: opts.tenantId, date: issueDate, memo: `COGS — Invoice ${number}`,
        sourceType: "invoice", sourceId: inv.id, createdBy: opts.createdBy,
        lines: [
          { accountId: cogs.id, debit: fromCents(cogsBase) },
          { accountId: inventory.id, credit: fromCents(cogsBase) },
        ],
      });
    }

    // 5. lock the invoice as ISSUED
    const [updated] = await tx.update(schema.invoices)
      .set({ status: "ISSUED", number, issueDate })
      .where(eq(schema.invoices.id, inv.id)).returning();

    await audit(tx, opts.tenantId, opts.createdBy ?? null, "invoice.issued", "invoice", inv.id,
      { number, total: inv.total, currency: inv.currency });
    queue({
      id: `${DOMAIN_EVENTS.INVOICE_ISSUED}:${inv.id}`,
      type: DOMAIN_EVENTS.INVOICE_ISSUED, tenantId: opts.tenantId, actorUserId: opts.createdBy ?? null,
      payload: { invoiceId: inv.id, customerId: inv.contactId, currency: inv.currency, totalCents: toCents(inv.total).toString(), issuedAt: issueDate.toISOString() },
    });
    return updated;
  }));
}

/**
 * Record a payment against an issued invoice:
 * Dr Bank / Cr AR in base currency; status moves ISSUED→PARTIAL→PAID.
 */
export async function recordPayment(opts: {
  tenantId: string; invoiceId: string; amount: string;
  bankAccountId?: string; date?: Date; reference?: string; idempotencyKey: string; createdBy?: string | null;
}) {
  const idempotencyKey = requireIdempotencyKey(opts.idempotencyKey);
  const fingerprint = payloadFingerprint({
    action: "invoice_payment",
    invoiceId: opts.invoiceId,
    amount: opts.amount,
    bankAccountId: opts.bankAccountId ?? null,
    requestedDate: opts.date?.toISOString() ?? null,
    reference: opts.reference ?? null,
  });
  return runWithPostCommitEvents((queue) => db.transaction(async (tx) => {
    const [existingPayment] = await tx.select().from(schema.payments).where(and(
      eq(schema.payments.tenantId, opts.tenantId),
      eq(schema.payments.idempotencyKey, idempotencyKey),
    ));
    if (existingPayment) {
      assertIdempotencyFingerprint(existingPayment.idempotencyFingerprint, fingerprint, "payment");
      const [existingInvoice] = await tx.select().from(schema.invoices).where(and(
        eq(schema.invoices.id, existingPayment.invoiceId),
        eq(schema.invoices.tenantId, opts.tenantId),
      ));
      if (!existingInvoice) throw notFound("Invoice not found");
      return existingInvoice;
    }

    const [inv] = await tx.select().from(schema.invoices).where(and(
      eq(schema.invoices.id, opts.invoiceId), eq(schema.invoices.tenantId, opts.tenantId)));
    if (!inv) throw notFound("Invoice not found");
    if (inv.status !== "ISSUED" && inv.status !== "PARTIAL")
      throw conflict(`Cannot pay an invoice in status ${inv.status}`);

    const amountC = toCents(opts.amount);
    if (amountC <= 0n) throw badRequest("Payment amount must be positive");
    const outstanding = toCents(inv.total) - toCents(inv.amountPaid);
    if (amountC > outstanding)
      throw conflict(`Payment ${opts.amount} exceeds outstanding balance ${fromCents(outstanding)}`);

    const date = opts.date ?? new Date();
    const [payment] = await tx.insert(schema.payments).values({
      tenantId: opts.tenantId, invoiceId: inv.id, bankAccountId: opts.bankAccountId ?? null,
      amount: opts.amount, currency: inv.currency, date, reference: opts.reference ?? null,
      idempotencyKey,
      idempotencyFingerprint: fingerprint,
      createdBy: opts.createdBy ?? null,
    }).returning({ id: schema.payments.id });

    const ar = await systemAccount(tx, opts.tenantId, "AR");
    let bankLedgerId: string;
    if (opts.bankAccountId) {
      const [ba] = await tx.select().from(schema.bankAccounts).where(and(
        eq(schema.bankAccounts.id, opts.bankAccountId), eq(schema.bankAccounts.tenantId, opts.tenantId)));
      if (!ba) throw notFound("Bank account not found");
      bankLedgerId = (await ensureBankLedgerAccount(tx, ba)).id;
    } else {
      bankLedgerId = (await systemAccount(tx, opts.tenantId, "BANK")).id;
    }
    const baseAmount = fromCents(mulRate(amountC, inv.rateToBase));
    await postJournal(tx, {
      tenantId: opts.tenantId, date, memo: `Payment — Invoice ${inv.number}`,
      sourceType: "payment", sourceId: inv.id, createdBy: opts.createdBy,
      lines: [
        { accountId: bankLedgerId, debit: baseAmount, originalAmount: opts.amount, originalCurrency: inv.currency as "USD" | "ZWG", exchangeRate: inv.rateToBase },
        { accountId: ar.id, credit: baseAmount },
      ],
    });

    const newPaid = toCents(inv.amountPaid) + amountC;
    const newStatus = newPaid >= toCents(inv.total) ? "PAID" : "PARTIAL";
    const [updated] = await tx.update(schema.invoices)
      .set({ amountPaid: fromCents(newPaid), status: newStatus })
      .where(eq(schema.invoices.id, inv.id)).returning();
    await audit(tx, opts.tenantId, opts.createdBy ?? null, "invoice.payment_recorded", "invoice", inv.id,
      { amount: opts.amount, newStatus });
    queue({
      id: `${DOMAIN_EVENTS.PAYMENT_RECORDED}:${payment.id}`,
      type: DOMAIN_EVENTS.PAYMENT_RECORDED, tenantId: opts.tenantId, actorUserId: opts.createdBy ?? null,
      payload: { paymentId: payment.id, invoiceId: inv.id, customerId: inv.contactId, currency: inv.currency, amountCents: amountC.toString() },
    });
    return updated;
  }));
}

/**
 * Void an issued invoice: posts full reversing journal entries and returns
 * stock — history is never deleted, only offset (audit-safe).
 */
export async function voidInvoice(opts: { tenantId: string; invoiceId: string; reason: string; createdBy?: string | null }) {
  return runWithPostCommitEvents((queue) => db.transaction(async (tx) => {
    const [inv] = await tx.select().from(schema.invoices).where(and(
      eq(schema.invoices.id, opts.invoiceId), eq(schema.invoices.tenantId, opts.tenantId)));
    if (!inv) throw notFound("Invoice not found");
    if (inv.status === "VOID") throw conflict("Invoice is already void");
    if (toCents(inv.amountPaid) > 0n) throw conflict("Cannot void an invoice with recorded payments — refund/credit-note it instead");
    if (!opts.reason?.trim()) throw badRequest("A reason is mandatory when voiding an invoice");

    if (inv.status !== "DRAFT") {
      // reverse every journal entry this invoice created
      const entries = await tx.select().from(schema.journalEntries).where(and(
        eq(schema.journalEntries.tenantId, opts.tenantId),
        eq(schema.journalEntries.sourceType, "invoice"),
        eq(schema.journalEntries.sourceId, inv.id)));
      for (const e of entries) {
        const jl = await tx.select().from(schema.journalLines)
          .where(eq(schema.journalLines.journalEntryId, e.id));
        await postJournal(tx, {
          tenantId: opts.tenantId, date: new Date(), memo: `VOID reversal — ${e.memo}: ${opts.reason}`,
          sourceType: "invoice_void", sourceId: inv.id, createdBy: opts.createdBy,
          lines: jl.map((l) => ({ accountId: l.accountId, debit: l.credit, credit: l.debit })),
        });
      }
      // return stock via offsetting movements
      const moves = await tx.select().from(schema.stockMovements).where(and(
        eq(schema.stockMovements.tenantId, opts.tenantId),
        eq(schema.stockMovements.sourceType, "invoice"),
        eq(schema.stockMovements.sourceId, inv.id)));
      for (const m of moves) {
        const movement = await recordStockMovement(tx, {
          tenantId: opts.tenantId, productId: m.productId, warehouseId: m.warehouseId,
          quantityDelta: String(-Number(m.quantityDelta)), unitCost: m.unitCost ?? undefined,
          reason: "ADJUSTMENT", sourceType: "invoice_void", sourceId: inv.id,
          note: `Void of invoice ${inv.number}`, createdBy: opts.createdBy, allowNegative: true,
        });
        queue({
          id: `${DOMAIN_EVENTS.STOCK_MOVED}:${movement.movementId}`,
          type: DOMAIN_EVENTS.STOCK_MOVED, tenantId: opts.tenantId, actorUserId: opts.createdBy ?? null,
          payload: { movementId: movement.movementId, productId: m.productId, warehouseId: m.warehouseId, quantityDelta: String(-Number(m.quantityDelta)), kind: "ADJUSTMENT" },
        });
      }
    }
    const [updated] = await tx.update(schema.invoices).set({ status: "VOID" })
      .where(eq(schema.invoices.id, inv.id)).returning();
    await audit(tx, opts.tenantId, opts.createdBy ?? null, "invoice.voided", "invoice", inv.id, { reason: opts.reason });
    queue({
      id: `${DOMAIN_EVENTS.INVOICE_VOIDED}:${inv.id}`,
      type: DOMAIN_EVENTS.INVOICE_VOIDED, tenantId: opts.tenantId, actorUserId: opts.createdBy ?? null,
      payload: { invoiceId: inv.id, reason: opts.reason },
    });
    return updated;
  }));
}
