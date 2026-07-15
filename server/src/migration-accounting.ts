// ============================================================================
// PM-002 — Accounting migration pack (runs on the PM-001 engine).
//
// Three step kinds:
//   opening_trial_balance — staged TB rows resolved against the tenant's
//     chart of accounts by code; commit posts ONE balanced opening journal
//     via postJournal (period-close guard applies); rollback posts the
//     reversal journal (append-only ledger — history is never edited).
//   open_invoices / open_bills — AR/AP open-item registers. These are memo
//     records reconciled against the TB control totals; they have no ledger
//     effect (the ledger effect is the TB's AR/AP lines). Converting them to
//     live documents is a later mission.
// The accountant reconciliation report compares staged vs posted totals and
// backs the project sign-off (the PM-002 "P (accountant)" gate).
// ============================================================================
import { and, eq, sql as dsql } from "drizzle-orm";
import { audit, badRequest, conflict, db, fromCents, schema, toCents, type DB } from "./lib.js";
import { postJournal } from "./accounting.js";
import { normalizeHeader, parseCsv, parseMoney, safeText } from "./imports.js";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// ---------------------------------------------------------------------------
// Opening trial balance
// ---------------------------------------------------------------------------
type TbRow = { code: string; name: string | null; debit: string; credit: string; accountId: string };

const tbHeaderAliases: Record<string, "code" | "name" | "debit" | "credit"> = {
  code: "code", account_code: "code", account: "code", gl_code: "code",
  name: "name", account_name: "name", description: "name",
  debit: "debit", dr: "debit", debit_amount: "debit",
  credit: "credit", cr: "credit", credit_amount: "credit",
};

export async function previewOpeningTrialBalance(opts: {
  tenantId: string; actorUserId: string; csvText: string;
}) {
  const csvRows = parseCsv(opts.csvText.replace(/^﻿/, ""));
  const headers = csvRows[0].map(normalizeHeader).map((h) => tbHeaderAliases[h] ?? null);
  if (!headers.includes("code")) throw badRequest("CSV must include an account_code column");
  if (!headers.includes("debit") || !headers.includes("credit")) {
    throw badRequest("CSV must include debit and credit columns");
  }
  const accounts = await db.select({
    id: schema.accounts.id, code: schema.accounts.code, name: schema.accounts.name,
  }).from(schema.accounts).where(and(
    eq(schema.accounts.tenantId, opts.tenantId), eq(schema.accounts.isActive, true),
  ));
  const byCode = new Map(accounts.map((account) => [account.code.trim().toLowerCase(), account]));
  const seen = new Set<string>();
  let debitTotal = 0n, creditTotal = 0n;

  const staged = csvRows.slice(1).map((cells, index) => {
    try {
      const cell = (key: "code" | "name" | "debit" | "credit") => {
        const i = headers.indexOf(key);
        return i >= 0 ? (cells[i] ?? "").trim() : "";
      };
      const code = cell("code");
      if (!code) throw badRequest("account_code is required");
      const account = byCode.get(code.toLowerCase());
      if (!account) throw badRequest(`Account code "${code}" not found in the chart of accounts`);
      if (seen.has(account.id)) throw badRequest(`Account code "${code}" appears more than once`);
      seen.add(account.id);
      const debit = cell("debit") ? parseMoney(cell("debit"), "debit") : "0.00";
      const credit = cell("credit") ? parseMoney(cell("credit"), "credit") : "0.00";
      const debitCents = toCents(debit), creditCents = toCents(credit);
      if (debitCents > 0n && creditCents > 0n) throw badRequest("A row may carry a debit or a credit, not both");
      if (debitCents === 0n && creditCents === 0n) throw badRequest("Row has neither debit nor credit");
      debitTotal += debitCents; creditTotal += creditCents;
      const data: TbRow = {
        code: account.code, name: safeText(cell("name") || account.name, "name", 200),
        debit, credit, accountId: account.id,
      };
      return { rowNumber: index + 2, data, status: "VALID", error: null as string | null };
    } catch (error: unknown) {
      return {
        rowNumber: index + 2, data: { source: cells }, status: "INVALID",
        error: error instanceof Error ? error.message : "Invalid row",
      };
    }
  });

  const summary = {
    totalRows: staged.length,
    validRows: staged.filter((row) => row.status === "VALID").length,
    invalidRows: staged.filter((row) => row.status === "INVALID").length,
    duplicateRows: 0,
  };
  const balanced = debitTotal === creditTotal && debitTotal > 0n;

  return db.transaction(async (tx) => {
    const [batch] = await tx.insert(schema.importBatches).values({
      tenantId: opts.tenantId, entityType: "opening_trial_balance",
      status: "PREVIEW", ...summary, createdBy: opts.actorUserId,
    }).returning();
    await tx.insert(schema.importRows).values(staged.map((row) => ({ batchId: batch.id, ...row })));
    await audit(tx, opts.tenantId, opts.actorUserId,
      "migration.trial_balance_previewed", "import_batch", batch.id, {
        ...summary, debitTotal: fromCents(debitTotal), creditTotal: fromCents(creditTotal), balanced,
      });
    return {
      batch, rows: staged.slice(0, 100),
      extra: { debitTotal: fromCents(debitTotal), creditTotal: fromCents(creditTotal), balanced },
    };
  });
}

export async function commitOpeningTrialBalance(opts: {
  tenantId: string; actorUserId: string; batchId: string; stepId: string; asOfDate?: string;
}) {
  if (!opts.asOfDate || !ISO_DATE.test(opts.asOfDate)) {
    throw badRequest("asOfDate (YYYY-MM-DD) is required to post opening balances");
  }
  return db.transaction(async (tx) => {
    const [claimed] = await tx.update(schema.importBatches).set({ status: "PROCESSING" }).where(and(
      eq(schema.importBatches.id, opts.batchId),
      eq(schema.importBatches.tenantId, opts.tenantId),
      eq(schema.importBatches.entityType, "opening_trial_balance"),
      eq(schema.importBatches.status, "PREVIEW"),
    )).returning();
    if (!claimed) throw conflict("Trial balance batch is unavailable or already processed");
    if (claimed.invalidRows > 0) {
      throw conflict("Trial balance has invalid rows — fix the source file and re-stage before committing");
    }
    const rows = await tx.select().from(schema.importRows).where(and(
      eq(schema.importRows.batchId, claimed.id),
      eq(schema.importRows.status, "VALID"),
    )).orderBy(schema.importRows.rowNumber);
    if (!rows.length) throw conflict("Trial balance batch has no valid rows");

    let debitTotal = 0n, creditTotal = 0n;
    const lines = rows.map((row) => {
      const data = row.data as TbRow;
      const debit = toCents(data.debit), credit = toCents(data.credit);
      debitTotal += debit; creditTotal += credit;
      return debit > 0n
        ? { accountId: data.accountId, debit: data.debit }
        : { accountId: data.accountId, credit: data.credit };
    });
    if (debitTotal !== creditTotal) {
      throw conflict(`Trial balance does not balance (debits ${fromCents(debitTotal)} vs credits ${fromCents(creditTotal)}) — nothing was posted`);
    }

    const journalEntryId = await postJournal(tx, {
      tenantId: opts.tenantId, date: new Date(`${opts.asOfDate}T00:00:00.000Z`),
      memo: `Opening balances as at ${opts.asOfDate} (migration)`,
      sourceType: "migration_opening_balance", sourceId: opts.stepId,
      createdBy: opts.actorUserId, lines,
    });

    for (const row of rows) {
      await tx.update(schema.importRows).set({ status: "IMPORTED" })
        .where(eq(schema.importRows.id, row.id));
    }
    await tx.update(schema.importBatches).set({ status: "COMPLETED", completedAt: new Date() })
      .where(eq(schema.importBatches.id, claimed.id));
    await audit(tx, opts.tenantId, opts.actorUserId,
      "migration.opening_balances_posted", "journal_entry", journalEntryId, {
        stepId: opts.stepId, asOfDate: opts.asOfDate, lines: lines.length,
        debitTotal: fromCents(debitTotal), creditTotal: fromCents(creditTotal),
      });
    return {
      journalEntryId, asOfDate: opts.asOfDate, lineCount: lines.length,
      debitTotal: fromCents(debitTotal), creditTotal: fromCents(creditTotal),
    };
  });
}

/** Reversal inside the caller's transaction (append-only correction). */
export async function rollbackOpeningTrialBalance(tx: DB, opts: {
  tenantId: string; actorUserId: string;
  step: { id: string; journalEntryId: string | null }; reason: string;
}) {
  if (!opts.step.journalEntryId) throw conflict("Step has no posted journal to reverse");
  const lines = await tx.select().from(schema.journalLines)
    .where(eq(schema.journalLines.journalEntryId, opts.step.journalEntryId));
  if (!lines.length) throw conflict("Posted journal has no lines");
  const reversalJournalEntryId = await postJournal(tx, {
    tenantId: opts.tenantId, date: new Date(),
    memo: `Reversal of migration opening balances: ${opts.reason}`,
    sourceType: "migration_opening_balance_reversal", sourceId: opts.step.id,
    createdBy: opts.actorUserId,
    lines: lines.map((line) => {
      const debit = toCents(String(line.debit ?? "0"));
      return debit > 0n
        ? { accountId: line.accountId, credit: fromCents(debit) }
        : { accountId: line.accountId, debit: String(line.credit) };
    }),
  });
  return { reversalJournalEntryId };
}

// ---------------------------------------------------------------------------
// AR/AP open items (memo register; ledger effect lives in the TB)
// ---------------------------------------------------------------------------
type OpenItemRow = {
  contactName: string; reference: string; issueDate: string | null; dueDate: string | null;
  currency: "USD" | "ZWG"; amount: string; balance: string;
};

const openItemHeaderAliases: Record<string, keyof OpenItemRow> = {
  contact: "contactName", contact_name: "contactName", customer: "contactName",
  customer_name: "contactName", supplier: "contactName", supplier_name: "contactName",
  vendor: "contactName", name: "contactName",
  reference: "reference", invoice_number: "reference", bill_number: "reference",
  document_number: "reference", number: "reference",
  date: "issueDate", issue_date: "issueDate", invoice_date: "issueDate",
  due_date: "dueDate", due: "dueDate",
  currency: "currency",
  amount: "amount", total: "amount", original_amount: "amount",
  balance: "balance", outstanding: "balance", amount_due: "balance", open_balance: "balance",
};

export async function previewOpenItems(opts: {
  tenantId: string; actorUserId: string; csvText: string; side: "AR" | "AP";
}) {
  const csvRows = parseCsv(opts.csvText.replace(/^﻿/, ""));
  const headers = csvRows[0].map(normalizeHeader).map((h) => openItemHeaderAliases[h] ?? null);
  if (!headers.includes("contactName") || !headers.includes("reference")) {
    throw badRequest("CSV must include contact/customer/supplier and reference columns");
  }
  const seen = new Set<string>();
  let totalBalance = { USD: 0n, ZWG: 0n };

  const staged = csvRows.slice(1).map((cells, index) => {
    try {
      const cell = (key: keyof OpenItemRow) => {
        const i = headers.indexOf(key);
        return i >= 0 ? (cells[i] ?? "").trim() : "";
      };
      const contactName = safeText(cell("contactName"), "contact", 200);
      const reference = safeText(cell("reference"), "reference", 100);
      if (!contactName) throw badRequest("contact name is required");
      if (!reference) throw badRequest("reference is required");
      const currencyRaw = (cell("currency") || "USD").toUpperCase();
      if (currencyRaw !== "USD" && currencyRaw !== "ZWG") {
        throw badRequest(`Unsupported currency "${currencyRaw}"`);
      }
      const amount = parseMoney(cell("amount") || cell("balance"), "amount");
      const balance = cell("balance") ? parseMoney(cell("balance"), "balance") : amount;
      if (toCents(balance) > toCents(amount)) throw badRequest("balance cannot exceed amount");
      const dateOf = (key: "issueDate" | "dueDate") => {
        const value = cell(key);
        if (!value) return null;
        if (!ISO_DATE.test(value)) throw badRequest(`${key} must be YYYY-MM-DD`);
        return value;
      };
      const data: OpenItemRow = {
        contactName, reference, issueDate: dateOf("issueDate"), dueDate: dateOf("dueDate"),
        currency: currencyRaw, amount, balance,
      };
      const key = `${contactName.toLowerCase()}::${reference.toLowerCase()}`;
      const duplicate = seen.has(key);
      seen.add(key);
      if (!duplicate) totalBalance[currencyRaw] += toCents(balance);
      return {
        rowNumber: index + 2, data,
        status: duplicate ? "DUPLICATE" : "VALID",
        error: duplicate ? "Duplicate contact + reference in this file" : null,
      };
    } catch (error: unknown) {
      return {
        rowNumber: index + 2, data: { source: cells }, status: "INVALID",
        error: error instanceof Error ? error.message : "Invalid row",
      };
    }
  });

  const summary = {
    totalRows: staged.length,
    validRows: staged.filter((row) => row.status === "VALID").length,
    invalidRows: staged.filter((row) => row.status === "INVALID").length,
    duplicateRows: staged.filter((row) => row.status === "DUPLICATE").length,
  };

  return db.transaction(async (tx) => {
    const [batch] = await tx.insert(schema.importBatches).values({
      tenantId: opts.tenantId, entityType: opts.side === "AR" ? "open_items_ar" : "open_items_ap",
      status: "PREVIEW", ...summary, createdBy: opts.actorUserId,
    }).returning();
    await tx.insert(schema.importRows).values(staged.map((row) => ({ batchId: batch.id, ...row })));
    await audit(tx, opts.tenantId, opts.actorUserId,
      "migration.open_items_previewed", "import_batch", batch.id, {
        side: opts.side, ...summary,
        totalBalanceUSD: fromCents(totalBalance.USD), totalBalanceZWG: fromCents(totalBalance.ZWG),
      });
    return {
      batch, rows: staged.slice(0, 100),
      extra: {
        side: opts.side,
        totalBalanceUSD: fromCents(totalBalance.USD), totalBalanceZWG: fromCents(totalBalance.ZWG),
      },
    };
  });
}

export async function commitOpenItems(opts: {
  tenantId: string; actorUserId: string; batchId: string;
  stepId: string; projectId: string; side: "AR" | "AP";
}) {
  return db.transaction(async (tx) => {
    const [claimed] = await tx.update(schema.importBatches).set({ status: "PROCESSING" }).where(and(
      eq(schema.importBatches.id, opts.batchId),
      eq(schema.importBatches.tenantId, opts.tenantId),
      eq(schema.importBatches.entityType, opts.side === "AR" ? "open_items_ar" : "open_items_ap"),
      eq(schema.importBatches.status, "PREVIEW"),
    )).returning();
    if (!claimed) throw conflict("Open-item batch is unavailable or already processed");

    const rows = await tx.select().from(schema.importRows).where(and(
      eq(schema.importRows.batchId, claimed.id),
      eq(schema.importRows.status, "VALID"),
    )).orderBy(schema.importRows.rowNumber);

    const contacts = await tx.select({
      id: schema.contacts.id, name: schema.contacts.name,
    }).from(schema.contacts).where(eq(schema.contacts.tenantId, opts.tenantId));
    const contactByName = new Map(contacts.map((contact) => [contact.name.trim().toLowerCase(), contact.id]));

    let matched = 0;
    let totalBalance = 0n;
    for (const row of rows) {
      const data = row.data as OpenItemRow;
      const matchedContactId = contactByName.get(data.contactName.trim().toLowerCase()) ?? null;
      if (matchedContactId) matched += 1;
      totalBalance += toCents(data.balance);
      const [item] = await tx.insert(schema.migrationOpenItems).values({
        tenantId: opts.tenantId, projectId: opts.projectId, stepId: opts.stepId,
        side: opts.side, contactName: data.contactName, reference: data.reference,
        issueDate: data.issueDate, dueDate: data.dueDate, currency: data.currency,
        amount: data.amount, balance: data.balance, matchedContactId,
      }).returning({ id: schema.migrationOpenItems.id });
      await tx.update(schema.importRows).set({ status: "IMPORTED", createdRecordId: item.id })
        .where(eq(schema.importRows.id, row.id));
    }
    await tx.update(schema.importBatches).set({ status: "COMPLETED", completedAt: new Date() })
      .where(eq(schema.importBatches.id, claimed.id));
    await audit(tx, opts.tenantId, opts.actorUserId,
      "migration.open_items_committed", "migration_step", opts.stepId, {
        side: opts.side, itemCount: rows.length, matchedContacts: matched,
        totalBalance: fromCents(totalBalance),
      });
    return { itemCount: rows.length, matchedContacts: matched, totalBalance: fromCents(totalBalance) };
  });
}

export async function rollbackOpenItems(tx: DB, opts: { tenantId: string; stepId: string }) {
  const deleted = await tx.delete(schema.migrationOpenItems).where(and(
    eq(schema.migrationOpenItems.tenantId, opts.tenantId),
    eq(schema.migrationOpenItems.stepId, opts.stepId),
  )).returning({ id: schema.migrationOpenItems.id });
  return { deleted: deleted.length };
}

// ---------------------------------------------------------------------------
// Reconciliation report — what the accountant signs.
// ---------------------------------------------------------------------------
export async function projectReconciliation(tenantId: string, projectId: string) {
  const [project] = await db.select().from(schema.migrationProjects).where(and(
    eq(schema.migrationProjects.id, projectId),
    eq(schema.migrationProjects.tenantId, tenantId),
  ));
  if (!project) throw badRequest("Migration project not found");
  const steps = await db.select().from(schema.migrationSteps)
    .where(and(
      eq(schema.migrationSteps.projectId, projectId),
      eq(schema.migrationSteps.tenantId, tenantId),
    )).orderBy(schema.migrationSteps.createdAt);

  const openItems = await db.select({
    side: schema.migrationOpenItems.side,
    currency: schema.migrationOpenItems.currency,
    count: dsql<number>`count(*)::int`,
    totalBalance: dsql<string>`sum(${schema.migrationOpenItems.balance})::text`,
    matched: dsql<number>`count(${schema.migrationOpenItems.matchedContactId})::int`,
  }).from(schema.migrationOpenItems)
    .where(and(
      eq(schema.migrationOpenItems.projectId, projectId),
      eq(schema.migrationOpenItems.tenantId, tenantId),
    ))
    .groupBy(schema.migrationOpenItems.side, schema.migrationOpenItems.currency);

  const tbStep = steps.find((step) =>
    step.kind === "opening_trial_balance" && step.status === "COMMITTED");
  let postedTotals: { debitTotal: string; creditTotal: string; lineCount: number } | null = null;
  if (tbStep?.journalEntryId) {
    const [row] = await db.select({
      debitTotal: dsql<string>`coalesce(sum(${schema.journalLines.debit}), 0)::text`,
      creditTotal: dsql<string>`coalesce(sum(${schema.journalLines.credit}), 0)::text`,
      lineCount: dsql<number>`count(*)::int`,
    }).from(schema.journalLines)
      .where(eq(schema.journalLines.journalEntryId, tbStep.journalEntryId));
    postedTotals = row;
  }

  return {
    project: {
      id: project.id, name: project.name, sourceSystem: project.sourceSystem,
      status: project.status, signOff: project.signOff,
    },
    steps: steps.map((step) => ({
      id: step.id, kind: step.kind, status: step.status, summary: step.summary,
      journalEntryId: step.journalEntryId, reversalJournalEntryId: step.reversalJournalEntryId,
    })),
    openingTrialBalance: tbStep ? {
      stepId: tbStep.id, journalEntryId: tbStep.journalEntryId,
      staged: tbStep.summary, posted: postedTotals,
    } : null,
    openItems,
    notice: "This report backs the accountant sign-off required by the PM-002 gate. Open items are a memo register; their ledger effect is the AR/AP control lines in the opening trial balance.",
  };
}
