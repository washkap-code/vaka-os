import { sql } from "drizzle-orm";
import { audit, badRequest, conflict, db, DB, fromCents, mulRate, notFound, schema, toCents } from "./lib.js";
import { postJournal, systemAccount } from "./accounting.js";

type BankTransactionRow = {
  id: string;
  bank_account_id: string;
  tenant_id: string;
  currency: "USD" | "ZWG";
  date: Date | string;
  description: string;
  amount: string;
  reference: string | null;
  matched_journal_entry_id: string | null;
};

async function loadTenantBankTransaction(tx: DB, tenantId: string, bankTransactionId: string) {
  const result = await tx.execute(sql`
    SELECT bt.*, ba.tenant_id, ba.currency
    FROM bank_transactions bt
    JOIN bank_accounts ba ON ba.id = bt.bank_account_id
    WHERE bt.id = ${bankTransactionId} AND ba.tenant_id = ${tenantId}
    LIMIT 1
  `);
  const row = (result as unknown as { rows: BankTransactionRow[] }).rows[0] ?? null;
  return row ? { ...row, date: new Date(row.date) } : null;
}

export async function getBankReconciliationSummary(opts: {
  tenantId: string;
  bankAccountId: string;
}) {
  const accountResult = await db.execute(sql`
    SELECT id, name, bank_name, account_number, currency
    FROM bank_accounts
    WHERE id = ${opts.bankAccountId} AND tenant_id = ${opts.tenantId}
    LIMIT 1
  `);
  const account = (accountResult as unknown as { rows: Array<{
    id: string;
    name: string;
    bank_name: string | null;
    account_number: string | null;
    currency: "USD" | "ZWG";
  }> }).rows[0] ?? null;
  if (!account) throw notFound("Bank account not found");

  const summaryResult = await db.execute(sql`
    SELECT
      count(*)::int AS total_lines,
      count(*) FILTER (WHERE matched_journal_entry_id IS NOT NULL)::int AS matched_lines,
      count(*) FILTER (WHERE matched_journal_entry_id IS NULL)::int AS unreviewed_lines,
      COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0)::numeric(14,2)::text AS inflow,
      COALESCE(SUM(CASE WHEN amount < 0 THEN -amount ELSE 0 END), 0)::numeric(14,2)::text AS outflow,
      COALESCE(SUM(amount), 0)::numeric(14,2)::text AS net_movement,
      COALESCE(SUM(CASE WHEN matched_journal_entry_id IS NOT NULL THEN amount ELSE 0 END), 0)::numeric(14,2)::text AS matched_net,
      COALESCE(SUM(CASE WHEN matched_journal_entry_id IS NULL THEN amount ELSE 0 END), 0)::numeric(14,2)::text AS unreviewed_net,
      MIN(date) AS first_transaction_date,
      MAX(date) AS last_transaction_date,
      MIN(date) FILTER (WHERE matched_journal_entry_id IS NULL) AS oldest_unreviewed_date
    FROM bank_transactions
    WHERE bank_account_id = ${account.id}
  `);
  const row = (summaryResult as unknown as { rows: Array<{
    total_lines: number;
    matched_lines: number;
    unreviewed_lines: number;
    inflow: string;
    outflow: string;
    net_movement: string;
    matched_net: string;
    unreviewed_net: string;
    first_transaction_date: Date | string | null;
    last_transaction_date: Date | string | null;
    oldest_unreviewed_date: Date | string | null;
  }> }).rows[0];
  return {
    account: {
      id: account.id,
      name: account.name,
      bankName: account.bank_name,
      accountNumber: account.account_number,
      currency: account.currency,
    },
    totalLines: Number(row.total_lines),
    matchedLines: Number(row.matched_lines),
    unreviewedLines: Number(row.unreviewed_lines),
    inflow: row.inflow,
    outflow: row.outflow,
    netMovement: row.net_movement,
    matchedNet: row.matched_net,
    unreviewedNet: row.unreviewed_net,
    firstTransactionDate: row.first_transaction_date ? new Date(row.first_transaction_date).toISOString() : null,
    lastTransactionDate: row.last_transaction_date ? new Date(row.last_transaction_date).toISOString() : null,
    oldestUnreviewedDate: row.oldest_unreviewed_date ? new Date(row.oldest_unreviewed_date).toISOString() : null,
  };
}

export async function listBankInvoiceMatchCandidates(opts: {
  tenantId: string;
  bankTransactionId: string;
}) {
  const transaction = await loadTenantBankTransaction(db, opts.tenantId, opts.bankTransactionId);
  if (!transaction) throw notFound("Bank transaction not found");
  if (toCents(transaction.amount) <= 0n || transaction.matched_journal_entry_id) {
    return { transaction, candidates: [] };
  }
  const result = await db.execute(sql`
    SELECT
      i.id,
      i.number,
      i.currency,
      i.total::numeric(14,2)::text AS total,
      i.amount_paid::numeric(14,2)::text AS amount_paid,
      (i.total - i.amount_paid)::numeric(14,2)::text AS outstanding,
      i.due_date,
      c.name AS contact_name,
      CASE
        WHEN ${transaction.reference ?? ""} <> '' AND i.number IS NOT NULL
          AND lower(${transaction.reference ?? ""}) LIKE '%' || lower(i.number) || '%'
        THEN true
        WHEN i.number IS NOT NULL
          AND lower(${transaction.description}) LIKE '%' || lower(i.number) || '%'
        THEN true
        ELSE false
      END AS reference_match
    FROM invoices i
    JOIN contacts c ON c.id = i.contact_id
    WHERE i.tenant_id = ${opts.tenantId}
      AND i.status IN ('ISSUED', 'PARTIAL')
      AND i.currency = ${transaction.currency}
      AND (i.total - i.amount_paid) >= ${transaction.amount}::numeric
    ORDER BY
      reference_match DESC,
      ((i.total - i.amount_paid) = ${transaction.amount}::numeric) DESC,
      i.due_date NULLS LAST,
      i.created_at DESC
    LIMIT 10
  `);
  return { transaction, candidates: (result as unknown as { rows: unknown[] }).rows };
}

export async function matchBankTransactionToInvoice(opts: {
  tenantId: string;
  actorUserId: string;
  bankTransactionId: string;
  invoiceId: string;
}) {
  return db.transaction(async (tx) => {
    const transaction = await loadTenantBankTransaction(tx, opts.tenantId, opts.bankTransactionId);
    if (!transaction) throw notFound("Bank transaction not found");
    if (transaction.matched_journal_entry_id) throw conflict("Bank transaction is already matched");
    const amountCents = toCents(transaction.amount);
    if (amountCents <= 0n) throw conflict("Only incoming bank transactions can be matched to customer invoices");

    const [invoice] = await tx.select().from(schema.invoices)
      .where(sql`${schema.invoices.id} = ${opts.invoiceId} AND ${schema.invoices.tenantId} = ${opts.tenantId}`);
    if (!invoice) throw notFound("Invoice not found");
    if (invoice.status !== "ISSUED" && invoice.status !== "PARTIAL") {
      throw conflict(`Cannot match an invoice in status ${invoice.status}`);
    }
    if (invoice.currency !== transaction.currency) {
      throw conflict("Bank transaction currency must match invoice currency");
    }

    const outstanding = toCents(invoice.total) - toCents(invoice.amountPaid);
    if (amountCents > outstanding) {
      throw conflict("Bank transaction exceeds the selected invoice outstanding balance");
    }

    await tx.insert(schema.payments).values({
      tenantId: opts.tenantId,
      invoiceId: invoice.id,
      bankAccountId: transaction.bank_account_id,
      amount: transaction.amount,
      currency: invoice.currency,
      date: transaction.date,
      reference: transaction.reference ?? transaction.description,
      createdBy: opts.actorUserId,
    });

    const ar = await systemAccount(tx, opts.tenantId, "AR");
    const [bankAccount] = await tx.select().from(schema.bankAccounts)
      .where(sql`${schema.bankAccounts.id} = ${transaction.bank_account_id} AND ${schema.bankAccounts.tenantId} = ${opts.tenantId}`);
    if (!bankAccount) throw notFound("Bank account not found");
    const bankLedgerId = bankAccount.ledgerAccountId ?? (await systemAccount(tx, opts.tenantId, "BANK")).id;
    const baseAmount = fromCents(mulRate(amountCents, invoice.rateToBase));
    const journalEntryId = await postJournal(tx, {
      tenantId: opts.tenantId,
      date: transaction.date,
      memo: `Bank matched payment — Invoice ${invoice.number}`,
      sourceType: "payment",
      sourceId: invoice.id,
      createdBy: opts.actorUserId,
      lines: [
        {
          accountId: bankLedgerId,
          debit: baseAmount,
          originalAmount: transaction.amount,
          originalCurrency: invoice.currency as "USD" | "ZWG",
          exchangeRate: invoice.rateToBase,
        },
        { accountId: ar.id, credit: baseAmount },
      ],
    });

    const newPaid = toCents(invoice.amountPaid) + amountCents;
    const newStatus = newPaid >= toCents(invoice.total) ? "PAID" : "PARTIAL";
    const [updatedInvoice] = await tx.update(schema.invoices)
      .set({ amountPaid: fromCents(newPaid), status: newStatus })
      .where(sql`${schema.invoices.id} = ${invoice.id} AND ${schema.invoices.tenantId} = ${opts.tenantId}`)
      .returning();

    const matched = await tx.update(schema.bankTransactions)
      .set({ matchedJournalEntryId: journalEntryId })
      .where(sql`${schema.bankTransactions.id} = ${transaction.id}
        AND ${schema.bankTransactions.matchedJournalEntryId} IS NULL`)
      .returning({ id: schema.bankTransactions.id });
    if (!matched.length) throw conflict("Bank transaction was matched by another process");

    await audit(tx, opts.tenantId, opts.actorUserId, "invoice.payment_recorded", "invoice", invoice.id, {
      amount: transaction.amount,
      newStatus,
      bankTransactionId: transaction.id,
      journalEntryId,
    });
    await audit(tx, opts.tenantId, opts.actorUserId, "bank_transaction.invoice_matched", "bank_transaction", transaction.id, {
      invoiceId: invoice.id,
      invoiceNumber: invoice.number,
      amount: transaction.amount,
      journalEntryId,
    });

    return { invoice: updatedInvoice, journalEntryId, bankTransactionId: transaction.id };
  });
}

export async function listBankSplitMatchCandidates(opts: {
  tenantId: string;
  bankTransactionId: string;
}) {
  const transaction = await loadTenantBankTransaction(db, opts.tenantId, opts.bankTransactionId);
  if (!transaction) throw notFound("Bank transaction not found");
  if (toCents(transaction.amount) <= 0n || transaction.matched_journal_entry_id) {
    return { transaction, candidates: [] };
  }
  const result = await db.execute(sql`
    SELECT
      i.id,
      i.number,
      i.currency,
      i.total::numeric(14,2)::text AS total,
      i.amount_paid::numeric(14,2)::text AS amount_paid,
      (i.total - i.amount_paid)::numeric(14,2)::text AS outstanding,
      i.due_date,
      c.name AS contact_name,
      CASE
        WHEN ${transaction.reference ?? ""} <> '' AND i.number IS NOT NULL
          AND lower(${transaction.reference ?? ""}) LIKE '%' || lower(i.number) || '%'
        THEN true
        WHEN i.number IS NOT NULL
          AND lower(${transaction.description}) LIKE '%' || lower(i.number) || '%'
        THEN true
        ELSE false
      END AS reference_match
    FROM invoices i
    JOIN contacts c ON c.id = i.contact_id
    WHERE i.tenant_id = ${opts.tenantId}
      AND i.status IN ('ISSUED', 'PARTIAL')
      AND i.currency = ${transaction.currency}
      AND (i.total - i.amount_paid) > 0
      AND (i.total - i.amount_paid) <= ${transaction.amount}::numeric
    ORDER BY reference_match DESC, i.due_date NULLS LAST, i.created_at DESC
    LIMIT 20
  `);
  return { transaction, candidates: (result as unknown as { rows: unknown[] }).rows };
}

export async function matchBankTransactionToInvoices(opts: {
  tenantId: string;
  actorUserId: string;
  bankTransactionId: string;
  allocations: Array<{ invoiceNumber: string; amount: string }>;
}) {
  return db.transaction(async (tx) => {
    const transaction = await loadTenantBankTransaction(tx, opts.tenantId, opts.bankTransactionId);
    if (!transaction) throw notFound("Bank transaction not found");
    if (transaction.matched_journal_entry_id) throw conflict("Bank transaction is already matched");
    const amountCents = toCents(transaction.amount);
    if (amountCents <= 0n) throw conflict("Only incoming bank transactions can be matched to customer invoices");
    if (opts.allocations.length < 2) throw badRequest("Split matching requires at least two invoice allocations");

    const seen = new Set<string>();
    let allocatedTotal = 0n;
    const ar = await systemAccount(tx, opts.tenantId, "AR");
    const [bankAccount] = await tx.select().from(schema.bankAccounts)
      .where(sql`${schema.bankAccounts.id} = ${transaction.bank_account_id} AND ${schema.bankAccounts.tenantId} = ${opts.tenantId}`);
    if (!bankAccount) throw notFound("Bank account not found");
    const bankLedgerId = bankAccount.ledgerAccountId ?? (await systemAccount(tx, opts.tenantId, "BANK")).id;
    const invoiceResults: Array<{ id: string; number: string | null; amount: string; newStatus: string }> = [];
    let totalBaseCents = 0n;

    for (const allocation of opts.allocations) {
      const invoiceNumber = allocation.invoiceNumber.trim();
      if (!invoiceNumber) throw badRequest("Invoice number is required for each allocation");
      if (seen.has(invoiceNumber.toLowerCase())) throw badRequest(`Invoice ${invoiceNumber} is allocated more than once`);
      seen.add(invoiceNumber.toLowerCase());
      const allocationCents = toCents(allocation.amount);
      if (allocationCents <= 0n) throw badRequest(`Allocation for ${invoiceNumber} must be positive`);
      allocatedTotal += allocationCents;

      const [invoice] = await tx.select().from(schema.invoices)
        .where(sql`${schema.invoices.number} = ${invoiceNumber} AND ${schema.invoices.tenantId} = ${opts.tenantId}`);
      if (!invoice) throw notFound(`Invoice ${invoiceNumber} not found`);
      if (invoice.status !== "ISSUED" && invoice.status !== "PARTIAL") {
        throw conflict(`Cannot match invoice ${invoiceNumber} in status ${invoice.status}`);
      }
      if (invoice.currency !== transaction.currency) {
        throw conflict(`Invoice ${invoiceNumber} currency must match the bank transaction currency`);
      }
      const outstanding = toCents(invoice.total) - toCents(invoice.amountPaid);
      if (allocationCents > outstanding) {
        throw conflict(`Allocation for ${invoiceNumber} exceeds outstanding balance ${fromCents(outstanding)}`);
      }

      const amount = fromCents(allocationCents);
      await tx.insert(schema.payments).values({
        tenantId: opts.tenantId,
        invoiceId: invoice.id,
        bankAccountId: transaction.bank_account_id,
        amount,
        currency: invoice.currency,
        date: transaction.date,
        reference: transaction.reference ?? transaction.description,
        createdBy: opts.actorUserId,
      });

      const newPaid = toCents(invoice.amountPaid) + allocationCents;
      const newStatus = newPaid >= toCents(invoice.total) ? "PAID" : "PARTIAL";
      await tx.update(schema.invoices)
        .set({ amountPaid: fromCents(newPaid), status: newStatus })
        .where(sql`${schema.invoices.id} = ${invoice.id} AND ${schema.invoices.tenantId} = ${opts.tenantId}`);
      totalBaseCents += mulRate(allocationCents, invoice.rateToBase);
      invoiceResults.push({ id: invoice.id, number: invoice.number, amount, newStatus });
    }

    if (allocatedTotal !== amountCents) {
      throw conflict(`Split allocations must total the bank transaction amount ${transaction.amount}`);
    }

    const baseAmount = fromCents(totalBaseCents);
    const journalEntryId = await postJournal(tx, {
      tenantId: opts.tenantId,
      date: transaction.date,
      memo: `Bank split payment — ${invoiceResults.map((invoice) => invoice.number).join(", ")}`,
      sourceType: "bank_match",
      sourceId: transaction.id,
      createdBy: opts.actorUserId,
      lines: [
        {
          accountId: bankLedgerId,
          debit: baseAmount,
          originalAmount: transaction.amount,
          originalCurrency: transaction.currency,
        },
        { accountId: ar.id, credit: baseAmount },
      ],
    });

    const matched = await tx.update(schema.bankTransactions)
      .set({ matchedJournalEntryId: journalEntryId })
      .where(sql`${schema.bankTransactions.id} = ${transaction.id}
        AND ${schema.bankTransactions.matchedJournalEntryId} IS NULL`)
      .returning({ id: schema.bankTransactions.id });
    if (!matched.length) throw conflict("Bank transaction was matched by another process");

    for (const invoice of invoiceResults) {
      await audit(tx, opts.tenantId, opts.actorUserId, "invoice.payment_recorded", "invoice", invoice.id, {
        amount: invoice.amount,
        newStatus: invoice.newStatus,
        bankTransactionId: transaction.id,
        journalEntryId,
        splitAllocation: true,
      });
    }
    await audit(tx, opts.tenantId, opts.actorUserId, "bank_transaction.invoices_matched", "bank_transaction", transaction.id, {
      allocations: invoiceResults.map((invoice) => ({
        invoiceId: invoice.id,
        invoiceNumber: invoice.number,
        amount: invoice.amount,
      })),
      amount: transaction.amount,
      journalEntryId,
    });

    return { invoices: invoiceResults, journalEntryId, bankTransactionId: transaction.id };
  });
}
