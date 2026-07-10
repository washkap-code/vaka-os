import { sql } from "drizzle-orm";
import {
  audit, badRequest, conflict, db, DB, fromCents, mulRate, notFound, payloadFingerprint, schema, toCents,
} from "./lib.js";
import { ensureBankLedgerAccount, postJournal, systemAccount } from "./accounting.js";

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

type BankReconciliationRecord = typeof schema.bankReconciliations.$inferSelect;

function serializeBankReconciliation(record: BankReconciliationRecord) {
  return {
    id: record.id,
    tenantId: record.tenantId,
    bankAccountId: record.bankAccountId,
    statementDate: record.statementDate.toISOString().slice(0, 10),
    statementClosingBalance: record.statementClosingBalance,
    openingBalance: record.openingBalance,
    importedNetMovement: record.importedNetMovement,
    expectedBookBalance: record.expectedBookBalance,
    difference: record.difference,
    totalLines: record.totalLines,
    matchedLines: record.matchedLines,
    unreviewedLines: record.unreviewedLines,
    unreviewedNet: record.unreviewedNet,
    status: record.status,
    reconciliationStatus: record.reconciliationStatus,
    notes: record.notes,
    preparedBy: record.preparedBy,
    preparedAt: record.preparedAt.toISOString(),
    approvedBy: record.approvedBy,
    approvedAt: record.approvedAt ? record.approvedAt.toISOString() : null,
    createdAt: record.createdAt.toISOString(),
  };
}

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

export async function getBankReconciliationWorksheet(opts: {
  tenantId: string;
  bankAccountId: string;
  statementDate: string;
  statementClosingBalance: string;
}) {
  const accountResult = await db.execute(sql`
    SELECT id, name, bank_name, account_number, currency, opening_balance::numeric(14,2)::text AS opening_balance
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
    opening_balance: string;
  }> }).rows[0] ?? null;
  if (!account) throw notFound("Bank account not found");

  const worksheetResult = await db.execute(sql`
    SELECT
      count(*)::int AS total_lines,
      count(*) FILTER (WHERE matched_journal_entry_id IS NOT NULL)::int AS matched_lines,
      count(*) FILTER (WHERE matched_journal_entry_id IS NULL)::int AS unreviewed_lines,
      COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0)::numeric(14,2)::text AS inflow,
      COALESCE(SUM(CASE WHEN amount < 0 THEN -amount ELSE 0 END), 0)::numeric(14,2)::text AS outflow,
      COALESCE(SUM(amount), 0)::numeric(14,2)::text AS imported_net_movement,
      COALESCE(SUM(CASE WHEN matched_journal_entry_id IS NULL THEN amount ELSE 0 END), 0)::numeric(14,2)::text AS unreviewed_net,
      MIN(date) AS first_transaction_date,
      MAX(date) AS last_transaction_date
    FROM bank_transactions
    WHERE bank_account_id = ${account.id}
      AND date < (${opts.statementDate}::date + interval '1 day')
  `);
  const row = (worksheetResult as unknown as { rows: Array<{
    total_lines: number;
    matched_lines: number;
    unreviewed_lines: number;
    inflow: string;
    outflow: string;
    imported_net_movement: string;
    unreviewed_net: string;
    first_transaction_date: Date | string | null;
    last_transaction_date: Date | string | null;
  }> }).rows[0];
  const openingCents = toCents(account.opening_balance);
  const movementCents = toCents(row.imported_net_movement);
  const expectedBookBalanceCents = openingCents + movementCents;
  const statementClosingCents = toCents(opts.statementClosingBalance);
  const differenceCents = expectedBookBalanceCents - statementClosingCents;
  return {
    account: {
      id: account.id,
      name: account.name,
      bankName: account.bank_name,
      accountNumber: account.account_number,
      currency: account.currency,
    },
    statementDate: opts.statementDate,
    statementClosingBalance: fromCents(statementClosingCents),
    openingBalance: account.opening_balance,
    importedNetMovement: row.imported_net_movement,
    expectedBookBalance: fromCents(expectedBookBalanceCents),
    difference: fromCents(differenceCents),
    totalLines: Number(row.total_lines),
    matchedLines: Number(row.matched_lines),
    unreviewedLines: Number(row.unreviewed_lines),
    unreviewedNet: row.unreviewed_net,
    inflow: row.inflow,
    outflow: row.outflow,
    firstTransactionDate: row.first_transaction_date ? new Date(row.first_transaction_date).toISOString() : null,
    lastTransactionDate: row.last_transaction_date ? new Date(row.last_transaction_date).toISOString() : null,
    status: differenceCents === 0n && Number(row.unreviewed_lines) === 0 ? "balanced" : "needs_review",
  };
}

export async function listBankReconciliations(opts: {
  tenantId: string;
  bankAccountId: string;
}) {
  const accountResult = await db.execute(sql`
    SELECT id
    FROM bank_accounts
    WHERE id = ${opts.bankAccountId} AND tenant_id = ${opts.tenantId}
    LIMIT 1
  `);
  const account = (accountResult as unknown as { rows: Array<{ id: string }> }).rows[0] ?? null;
  if (!account) throw notFound("Bank account not found");

  const reports = await db.select().from(schema.bankReconciliations)
    .where(sql`${schema.bankReconciliations.tenantId} = ${opts.tenantId}
      AND ${schema.bankReconciliations.bankAccountId} = ${opts.bankAccountId}`)
    .orderBy(sql`${schema.bankReconciliations.statementDate} DESC`)
    .limit(24);
  return reports.map(serializeBankReconciliation);
}

export async function prepareBankReconciliation(opts: {
  tenantId: string;
  actorUserId: string;
  bankAccountId: string;
  statementDate: string;
  statementClosingBalance: string;
  notes?: string | null;
}) {
  const worksheet = await getBankReconciliationWorksheet({
    tenantId: opts.tenantId,
    bankAccountId: opts.bankAccountId,
    statementDate: opts.statementDate,
    statementClosingBalance: opts.statementClosingBalance,
  });
  return db.transaction(async (tx) => {
    const statementDate = new Date(`${opts.statementDate}T00:00:00.000Z`);
    const [existing] = await tx.select({ id: schema.bankReconciliations.id })
      .from(schema.bankReconciliations)
      .where(sql`${schema.bankReconciliations.tenantId} = ${opts.tenantId}
        AND ${schema.bankReconciliations.bankAccountId} = ${opts.bankAccountId}
        AND ${schema.bankReconciliations.statementDate} = ${statementDate}`);
    if (existing) throw conflict("A reconciliation for this statement date already exists.");

    const [record] = await tx.insert(schema.bankReconciliations).values({
      tenantId: opts.tenantId,
      bankAccountId: opts.bankAccountId,
      statementDate,
      statementClosingBalance: worksheet.statementClosingBalance,
      openingBalance: worksheet.openingBalance,
      importedNetMovement: worksheet.importedNetMovement,
      expectedBookBalance: worksheet.expectedBookBalance,
      difference: worksheet.difference,
      totalLines: worksheet.totalLines,
      matchedLines: worksheet.matchedLines,
      unreviewedLines: worksheet.unreviewedLines,
      unreviewedNet: worksheet.unreviewedNet,
      status: "PREPARED",
      reconciliationStatus: worksheet.status,
      notes: opts.notes || null,
      preparedBy: opts.actorUserId,
    }).returning();
    await audit(tx, opts.tenantId, opts.actorUserId, "bank_reconciliation.prepared",
      "bank_reconciliation", record.id, {
        bankAccountId: opts.bankAccountId,
        statementDate: opts.statementDate,
        difference: record.difference,
        unreviewedLines: record.unreviewedLines,
        reconciliationStatus: record.reconciliationStatus,
      });
    return serializeBankReconciliation(record);
  });
}

export async function approveBankReconciliation(opts: {
  tenantId: string;
  actorUserId: string;
  reconciliationId: string;
}) {
  return db.transaction(async (tx) => {
    const [record] = await tx.select().from(schema.bankReconciliations)
      .where(sql`${schema.bankReconciliations.id} = ${opts.reconciliationId}
        AND ${schema.bankReconciliations.tenantId} = ${opts.tenantId}`);
    if (!record) throw notFound("Bank reconciliation not found");
    if (record.status === "APPROVED") throw conflict("Bank reconciliation is already approved.");
    if (record.reconciliationStatus !== "balanced" || record.difference !== "0.00" || record.unreviewedLines > 0) {
      throw conflict("Only balanced reconciliations with no unreviewed bank lines can be approved.");
    }

    const [approved] = await tx.update(schema.bankReconciliations).set({
      status: "APPROVED",
      approvedBy: opts.actorUserId,
      approvedAt: new Date(),
    }).where(sql`${schema.bankReconciliations.id} = ${record.id}
      AND ${schema.bankReconciliations.tenantId} = ${opts.tenantId}
      AND ${schema.bankReconciliations.status} = 'PREPARED'`)
      .returning();
    if (!approved) throw conflict("Bank reconciliation could not be approved.");
    await audit(tx, opts.tenantId, opts.actorUserId, "bank_reconciliation.approved",
      "bank_reconciliation", approved.id, {
        bankAccountId: approved.bankAccountId,
        statementDate: approved.statementDate.toISOString().slice(0, 10),
        difference: approved.difference,
      });
    return serializeBankReconciliation(approved);
  });
}

export async function getBankReconciliationReport(opts: {
  tenantId: string;
  actorUserId: string;
  reconciliationId: string;
}) {
  const reportResult = await db.execute(sql`
    SELECT
      br.*,
      t.company_name,
      ba.name AS account_name,
      ba.bank_name,
      ba.account_number,
      ba.currency,
      prepared_user.full_name AS prepared_by_name,
      approved_user.full_name AS approved_by_name
    FROM bank_reconciliations br
    JOIN tenants t ON t.id = br.tenant_id
    JOIN bank_accounts ba ON ba.id = br.bank_account_id
    LEFT JOIN users prepared_user ON prepared_user.id = br.prepared_by
    LEFT JOIN users approved_user ON approved_user.id = br.approved_by
    WHERE br.id = ${opts.reconciliationId} AND br.tenant_id = ${opts.tenantId}
    LIMIT 1
  `);
  const report = (reportResult as unknown as { rows: Array<{
    id: string;
    tenant_id: string;
    bank_account_id: string;
    statement_date: Date | string;
    statement_closing_balance: string;
    opening_balance: string;
    imported_net_movement: string;
    expected_book_balance: string;
    difference: string;
    total_lines: number;
    matched_lines: number;
    unreviewed_lines: number;
    unreviewed_net: string;
    status: "PREPARED" | "APPROVED";
    reconciliation_status: "balanced" | "needs_review";
    notes: string | null;
    prepared_at: Date | string;
    approved_at: Date | string | null;
    company_name: string;
    account_name: string;
    bank_name: string | null;
    account_number: string | null;
    currency: "USD" | "ZWG";
    prepared_by_name: string | null;
    approved_by_name: string | null;
  }> }).rows[0] ?? null;
  if (!report) throw notFound("Bank reconciliation not found");

  const statementDate = new Date(report.statement_date);
  const linesResult = await db.execute(sql`
    SELECT
      id,
      date,
      description,
      amount::numeric(14,2)::text AS amount,
      reference,
      matched_journal_entry_id
    FROM bank_transactions
    WHERE bank_account_id = ${report.bank_account_id}
      AND date < (${statementDate.toISOString().slice(0, 10)}::date + interval '1 day')
    ORDER BY date ASC, created_at ASC
    LIMIT 1000
  `);
  const lines = (linesResult as unknown as { rows: Array<{
    id: string;
    date: Date | string;
    description: string;
    amount: string;
    reference: string | null;
    matched_journal_entry_id: string | null;
  }> }).rows.map((line) => ({
    id: line.id,
    date: new Date(line.date).toISOString().slice(0, 10),
    description: line.description,
    amount: line.amount,
    reference: line.reference,
    status: line.matched_journal_entry_id ? "matched" : "unreviewed",
  }));

  await audit(db, opts.tenantId, opts.actorUserId, "bank_reconciliation.report_generated",
    "bank_reconciliation", report.id, {
      bankAccountId: report.bank_account_id,
      statementDate: statementDate.toISOString().slice(0, 10),
    });

  return {
    generatedAt: new Date().toISOString(),
    companyName: report.company_name,
    account: {
      id: report.bank_account_id,
      name: report.account_name,
      bankName: report.bank_name,
      accountNumber: report.account_number,
      currency: report.currency,
    },
    reconciliation: {
      id: report.id,
      statementDate: statementDate.toISOString().slice(0, 10),
      statementClosingBalance: report.statement_closing_balance,
      openingBalance: report.opening_balance,
      importedNetMovement: report.imported_net_movement,
      expectedBookBalance: report.expected_book_balance,
      difference: report.difference,
      totalLines: Number(report.total_lines),
      matchedLines: Number(report.matched_lines),
      unreviewedLines: Number(report.unreviewed_lines),
      unreviewedNet: report.unreviewed_net,
      status: report.status,
      reconciliationStatus: report.reconciliation_status,
      notes: report.notes,
      preparedByName: report.prepared_by_name,
      preparedAt: new Date(report.prepared_at).toISOString(),
      approvedByName: report.approved_by_name,
      approvedAt: report.approved_at ? new Date(report.approved_at).toISOString() : null,
    },
    lines,
  };
}

export async function postBankTransactionFee(opts: {
  tenantId: string;
  actorUserId: string;
  bankTransactionId: string;
}) {
  return db.transaction(async (tx) => {
    const transaction = await loadTenantBankTransaction(tx, opts.tenantId, opts.bankTransactionId);
    if (!transaction) throw notFound("Bank transaction not found");
    if (transaction.matched_journal_entry_id) throw conflict("Bank transaction is already matched");
    const feeCents = -toCents(transaction.amount);
    if (feeCents <= 0n) throw badRequest("Only negative bank lines can be posted as bank fees.");

    const [bankAccount] = await tx.select().from(schema.bankAccounts)
      .where(sql`${schema.bankAccounts.id} = ${transaction.bank_account_id}
        AND ${schema.bankAccounts.tenantId} = ${opts.tenantId}`);
    if (!bankAccount) throw notFound("Bank account not found");
    const [feeAccount] = await tx.select().from(schema.accounts)
      .where(sql`${schema.accounts.tenantId} = ${opts.tenantId}
        AND ${schema.accounts.code} = '6400'
        AND ${schema.accounts.type} = 'EXPENSE'`);
    if (!feeAccount) throw badRequest("Bank Charges & IMTT account 6400 is missing for this tenant.");
    const bankLedgerId = (await ensureBankLedgerAccount(tx, bankAccount)).id;
    const amount = fromCents(feeCents);

    const journalEntryId = await postJournal(tx, {
      tenantId: opts.tenantId,
      date: new Date(transaction.date),
      memo: `Bank fee — ${transaction.description}`,
      sourceType: "bank_fee",
      sourceId: transaction.id,
      createdBy: opts.actorUserId,
      lines: [
        {
          accountId: feeAccount.id,
          debit: amount,
          originalAmount: amount,
          originalCurrency: transaction.currency,
          exchangeRate: "1",
        },
        {
          accountId: bankLedgerId,
          credit: amount,
          originalAmount: amount,
          originalCurrency: transaction.currency,
          exchangeRate: "1",
        },
      ],
    });
    const matched = await tx.update(schema.bankTransactions)
      .set({ matchedJournalEntryId: journalEntryId })
      .where(sql`${schema.bankTransactions.id} = ${transaction.id}
        AND ${schema.bankTransactions.matchedJournalEntryId} IS NULL`)
      .returning({ id: schema.bankTransactions.id });
    if (!matched.length) throw conflict("Bank transaction was matched by another process");
    await audit(tx, opts.tenantId, opts.actorUserId, "bank_transaction.fee_posted",
      "bank_transaction", transaction.id, {
        journalEntryId,
        amount,
        currency: transaction.currency,
        expenseAccountId: feeAccount.id,
      });
    return { bankTransactionId: transaction.id, journalEntryId, amount, currency: transaction.currency };
  });
}

export async function listBankTransferMatchCandidates(opts: {
  tenantId: string;
  bankTransactionId: string;
}) {
  const transaction = await loadTenantBankTransaction(db, opts.tenantId, opts.bankTransactionId);
  if (!transaction) throw notFound("Bank transaction not found");
  if (transaction.matched_journal_entry_id || toCents(transaction.amount) === 0n) {
    return { transaction, candidates: [] };
  }
  const targetAmount = fromCents(-toCents(transaction.amount));
  const result = await db.execute(sql`
    SELECT
      bt.id,
      bt.date,
      bt.description,
      bt.amount::numeric(14,2)::text AS amount,
      bt.reference,
      ba.id AS bank_account_id,
      ba.name AS bank_account_name,
      ba.bank_name,
      ba.account_number,
      ba.currency
    FROM bank_transactions bt
    JOIN bank_accounts ba ON ba.id = bt.bank_account_id
    WHERE ba.tenant_id = ${opts.tenantId}
      AND ba.currency = ${transaction.currency}
      AND bt.bank_account_id <> ${transaction.bank_account_id}
      AND bt.matched_journal_entry_id IS NULL
      AND bt.amount = ${targetAmount}::numeric
      AND bt.date BETWEEN (${new Date(transaction.date).toISOString()}::timestamptz - interval '7 days')
        AND (${new Date(transaction.date).toISOString()}::timestamptz + interval '7 days')
    ORDER BY abs(extract(epoch from (bt.date - ${new Date(transaction.date).toISOString()}::timestamptz))) ASC,
      bt.created_at ASC
    LIMIT 10
  `);
  return { transaction, candidates: (result as unknown as { rows: unknown[] }).rows };
}

export async function matchBankTransactionsAsTransfer(opts: {
  tenantId: string;
  actorUserId: string;
  bankTransactionId: string;
  counterpartyBankTransactionId: string;
}) {
  return db.transaction(async (tx) => {
    const primary = await loadTenantBankTransaction(tx, opts.tenantId, opts.bankTransactionId);
    const counterparty = await loadTenantBankTransaction(tx, opts.tenantId, opts.counterpartyBankTransactionId);
    if (!primary || !counterparty) throw notFound("Bank transaction not found");
    if (primary.id === counterparty.id) throw badRequest("Choose two different bank lines.");
    if (primary.bank_account_id === counterparty.bank_account_id) {
      throw conflict("Internal transfers must be between two different registered bank accounts.");
    }
    if (primary.matched_journal_entry_id || counterparty.matched_journal_entry_id) {
      throw conflict("Both bank lines must be unreviewed before they can be matched as a transfer.");
    }
    if (primary.currency !== counterparty.currency) {
      throw conflict("Internal transfer bank lines must use the same currency.");
    }
    const primaryCents = toCents(primary.amount);
    const counterpartyCents = toCents(counterparty.amount);
    if (primaryCents === 0n || primaryCents + counterpartyCents !== 0n) {
      throw conflict("Internal transfer bank lines must have equal and opposite amounts.");
    }

    const outgoing = primaryCents < 0n ? primary : counterparty;
    const incoming = primaryCents > 0n ? primary : counterparty;
    const amount = fromCents(toCents(incoming.amount));
    const [incomingAccount] = await tx.select().from(schema.bankAccounts)
      .where(sql`${schema.bankAccounts.id} = ${incoming.bank_account_id}
        AND ${schema.bankAccounts.tenantId} = ${opts.tenantId}`);
    const [outgoingAccount] = await tx.select().from(schema.bankAccounts)
      .where(sql`${schema.bankAccounts.id} = ${outgoing.bank_account_id}
        AND ${schema.bankAccounts.tenantId} = ${opts.tenantId}`);
    if (!incomingAccount || !outgoingAccount) throw notFound("Bank account not found");
    const incomingLedgerId = (await ensureBankLedgerAccount(tx, incomingAccount)).id;
    const outgoingLedgerId = (await ensureBankLedgerAccount(tx, outgoingAccount)).id;

    const journalEntryId = await postJournal(tx, {
      tenantId: opts.tenantId,
      date: new Date(incoming.date),
      memo: `Internal bank transfer — ${outgoingAccount.name} to ${incomingAccount.name}`,
      sourceType: "bank_transfer",
      sourceId: outgoing.id,
      createdBy: opts.actorUserId,
      lines: [
        {
          accountId: incomingLedgerId,
          debit: amount,
          originalAmount: amount,
          originalCurrency: incoming.currency,
          exchangeRate: "1",
        },
        {
          accountId: outgoingLedgerId,
          credit: amount,
          originalAmount: amount,
          originalCurrency: outgoing.currency,
          exchangeRate: "1",
        },
      ],
    });
    const matched = await tx.update(schema.bankTransactions)
      .set({ matchedJournalEntryId: journalEntryId })
      .where(sql`${schema.bankTransactions.id} IN (${incoming.id}, ${outgoing.id})
        AND ${schema.bankTransactions.matchedJournalEntryId} IS NULL`)
      .returning({ id: schema.bankTransactions.id });
    if (matched.length !== 2) throw conflict("One of the bank lines was matched by another process");
    await audit(tx, opts.tenantId, opts.actorUserId, "bank_transaction.transfer_matched",
      "bank_transaction", incoming.id, {
        journalEntryId,
        amount,
        currency: incoming.currency,
        incomingBankTransactionId: incoming.id,
        outgoingBankTransactionId: outgoing.id,
        incomingBankAccountId: incoming.bank_account_id,
        outgoingBankAccountId: outgoing.bank_account_id,
      });
    await audit(tx, opts.tenantId, opts.actorUserId, "bank_transaction.transfer_matched",
      "bank_transaction", outgoing.id, {
        journalEntryId,
        amount,
        currency: outgoing.currency,
        incomingBankTransactionId: incoming.id,
        outgoingBankTransactionId: outgoing.id,
        incomingBankAccountId: incoming.bank_account_id,
        outgoingBankAccountId: outgoing.bank_account_id,
      });
    return {
      journalEntryId,
      amount,
      currency: incoming.currency,
      incomingBankTransactionId: incoming.id,
      outgoingBankTransactionId: outgoing.id,
    };
  });
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

    const idempotencyKey = `bank-match:${transaction.id}:invoice:${invoice.id}`;
    await tx.insert(schema.payments).values({
      tenantId: opts.tenantId,
      invoiceId: invoice.id,
      bankAccountId: transaction.bank_account_id,
      amount: transaction.amount,
      currency: invoice.currency,
      date: transaction.date,
      reference: transaction.reference ?? transaction.description,
      idempotencyKey,
      idempotencyFingerprint: payloadFingerprint({
        action: "bank_invoice_match",
        bankTransactionId: transaction.id,
        invoiceId: invoice.id,
        amount: transaction.amount,
      }),
      createdBy: opts.actorUserId,
    });

    const ar = await systemAccount(tx, opts.tenantId, "AR");
    const [bankAccount] = await tx.select().from(schema.bankAccounts)
      .where(sql`${schema.bankAccounts.id} = ${transaction.bank_account_id} AND ${schema.bankAccounts.tenantId} = ${opts.tenantId}`);
    if (!bankAccount) throw notFound("Bank account not found");
    const bankLedgerId = (await ensureBankLedgerAccount(tx, bankAccount)).id;
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
    const bankLedgerId = (await ensureBankLedgerAccount(tx, bankAccount)).id;
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
      const idempotencyKey = `bank-split-match:${transaction.id}:invoice:${invoice.id}`;
      await tx.insert(schema.payments).values({
        tenantId: opts.tenantId,
        invoiceId: invoice.id,
        bankAccountId: transaction.bank_account_id,
        amount,
        currency: invoice.currency,
        date: transaction.date,
        reference: transaction.reference ?? transaction.description,
        idempotencyKey,
        idempotencyFingerprint: payloadFingerprint({
          action: "bank_split_invoice_match",
          bankTransactionId: transaction.id,
          invoiceId: invoice.id,
          amount,
        }),
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
