// ============================================================================
// PM-001 — Migration Hub: project-grouped staged migrations.
//
// Generalises the existing self-service import framework (import_batches /
// import_rows remain the row-staging authority) into migrations a business
// runs when moving onto VAKA:
//
//   stage (preview) → validate → commit → reconcile → rollback
//
// A migration PROJECT groups STEPS. Every step wraps either an import batch
// (contacts, products, opening stock — the existing, already-audited
// importers) or an accounting step (opening trial balance, AR/AP open items
// — PM-002, migration-accounting.ts). Steps are individually committed and
// individually rollbackable where a safe inverse exists:
//   contacts/products  → guarded hard delete (refused if records are in use)
//   opening TB         → reversal journal (append-only ledger, P2-005 safe)
//   open items         → register delete (memo data, no ledger effect)
//   opening stock      → NOT rollbackable in v1 (stock movements + valuation
//                        layers need a dedicated reversal mission)
// The whole surface ships dark behind `migration.hub` and fails closed.
// ============================================================================
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { audit, badRequest, conflict, db, notFound, schema } from "./lib.js";
import {
  commitContactImport, commitProductImport, commitOpeningStockImport,
  previewContactImport, previewProductImport, previewOpeningStockImport,
} from "./imports.js";
import {
  commitOpenItems, commitOpeningTrialBalance, previewOpenItems,
  previewOpeningTrialBalance, rollbackOpenItems, rollbackOpeningTrialBalance,
} from "./migration-accounting.js";

export const MIGRATION_STEP_KINDS = [
  "contacts", "products", "opening_stock", "opening_trial_balance",
  "open_invoices", "open_bills",
] as const;
export type MigrationStepKind = (typeof MIGRATION_STEP_KINDS)[number];

export const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(120),
  sourceSystem: z.string().trim().min(1).max(120),
});
export const previewStepSchema = z.object({
  csvText: z.string().min(1).max(1_000_000),
});
export const commitStepSchema = z.object({
  // Opening-balance date for the trial-balance step; ignored by other kinds.
  asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export const stepKindSchema = z.enum(MIGRATION_STEP_KINDS);
export const signOffSchema = z.object({
  reviewerName: z.string().trim().min(1).max(120),
  reviewerRole: z.string().trim().min(1).max(120),
  note: z.string().trim().max(1000).optional(),
});

async function requireProject(tenantId: string, projectId: string, mustBeOpen = false) {
  const [project] = await db.select().from(schema.migrationProjects).where(and(
    eq(schema.migrationProjects.id, projectId),
    eq(schema.migrationProjects.tenantId, tenantId),
  ));
  if (!project) throw notFound("Migration project not found");
  if (mustBeOpen && project.status !== "OPEN") throw conflict("Migration project is closed");
  return project;
}

export async function createProject(
  tenantId: string, userId: string, input: z.infer<typeof createProjectSchema>,
) {
  return db.transaction(async (tx) => {
    const [project] = await tx.insert(schema.migrationProjects).values({
      tenantId, name: input.name, sourceSystem: input.sourceSystem, createdBy: userId,
    }).returning();
    await audit(tx, tenantId, userId, "migration_project.created", "migration_project",
      project.id, { name: input.name, sourceSystem: input.sourceSystem });
    return project;
  });
}

export async function listProjects(tenantId: string) {
  return db.select().from(schema.migrationProjects)
    .where(eq(schema.migrationProjects.tenantId, tenantId))
    .orderBy(desc(schema.migrationProjects.createdAt)).limit(100);
}

export async function getProject(tenantId: string, projectId: string) {
  const project = await requireProject(tenantId, projectId);
  const steps = await db.select().from(schema.migrationSteps)
    .where(and(
      eq(schema.migrationSteps.projectId, projectId),
      eq(schema.migrationSteps.tenantId, tenantId),
    )).orderBy(schema.migrationSteps.createdAt);
  return { ...project, steps };
}

// ---------------------------------------------------------------------------
// Stage (preview): every kind stages into the existing framework and records
// a STAGED step. Nothing touches live records until commit.
// ---------------------------------------------------------------------------
export async function previewStep(opts: {
  tenantId: string; userId: string; projectId: string;
  kind: MigrationStepKind; csvText: string;
}) {
  await requireProject(opts.tenantId, opts.projectId, true);
  const common = { tenantId: opts.tenantId, actorUserId: opts.userId, csvText: opts.csvText };
  const staged =
    opts.kind === "contacts" ? await previewContactImport(common)
    : opts.kind === "products" ? await previewProductImport(common)
    : opts.kind === "opening_stock" ? await previewOpeningStockImport(common)
    : opts.kind === "opening_trial_balance" ? await previewOpeningTrialBalance(common)
    : await previewOpenItems({ ...common, side: opts.kind === "open_invoices" ? "AR" : "AP" });

  return db.transaction(async (tx) => {
    const [step] = await tx.insert(schema.migrationSteps).values({
      tenantId: opts.tenantId, projectId: opts.projectId, kind: opts.kind,
      importBatchId: staged.batch.id, createdBy: opts.userId,
      summary: {
        totalRows: staged.batch.totalRows, validRows: staged.batch.validRows,
        invalidRows: staged.batch.invalidRows, duplicateRows: staged.batch.duplicateRows,
        ...("extra" in staged ? (staged as { extra: object }).extra : {}),
      },
    }).returning();
    await audit(tx, opts.tenantId, opts.userId, "migration_step.staged", "migration_step",
      step.id, { kind: opts.kind, batchId: staged.batch.id, ...step.summary as object });
    return { step, rows: staged.rows };
  });
}

// ---------------------------------------------------------------------------
// Commit: claims the step, delegates to the kind's committer, records result.
// ---------------------------------------------------------------------------
export async function commitStep(opts: {
  tenantId: string; userId: string; projectId: string; stepId: string; asOfDate?: string;
}) {
  await requireProject(opts.tenantId, opts.projectId, true);
  const [step] = await db.select().from(schema.migrationSteps).where(and(
    eq(schema.migrationSteps.id, opts.stepId),
    eq(schema.migrationSteps.tenantId, opts.tenantId),
    eq(schema.migrationSteps.projectId, opts.projectId),
  ));
  if (!step) throw notFound("Migration step not found");
  if (step.status !== "STAGED") throw conflict("Migration step is not in a committable state");
  if (!step.importBatchId) throw conflict("Migration step has no staged batch");

  const common = { tenantId: opts.tenantId, actorUserId: opts.userId, batchId: step.importBatchId };
  const kind = step.kind as MigrationStepKind;
  const result =
    kind === "contacts" ? await commitContactImport(common)
    : kind === "products" ? await commitProductImport(common)
    : kind === "opening_stock" ? await commitOpeningStockImport(common)
    : kind === "opening_trial_balance" ? await commitOpeningTrialBalance({
        ...common, stepId: step.id, asOfDate: opts.asOfDate,
      })
    : await commitOpenItems({
        ...common, stepId: step.id, projectId: opts.projectId,
        side: kind === "open_invoices" ? "AR" : "AP",
      });

  return db.transaction(async (tx) => {
    const [updated] = await tx.update(schema.migrationSteps).set({
      status: "COMMITTED",
      journalEntryId: "journalEntryId" in result ? (result as { journalEntryId: string }).journalEntryId : null,
      summary: { ...(step.summary as object), ...summaryOf(result) },
      updatedAt: new Date(),
    }).where(and(
      eq(schema.migrationSteps.id, step.id),
      eq(schema.migrationSteps.status, "STAGED"),
    )).returning();
    if (!updated) throw conflict("Migration step was committed concurrently");
    await audit(tx, opts.tenantId, opts.userId, "migration_step.committed", "migration_step",
      step.id, { kind, ...summaryOf(result) });
    return { step: updated, result };
  });
}

const summaryOf = (result: object) =>
  Object.fromEntries(Object.entries(result).filter(([, v]) =>
    ["string", "number", "boolean"].includes(typeof v) || v === null));

// ---------------------------------------------------------------------------
// Discard: a STAGED step that will never be committed (bad file, wrong data).
// Nothing was written to live records, so this only retires the step and
// cancels its staged batch so it can never be committed later.
// ---------------------------------------------------------------------------
export async function discardStep(opts: {
  tenantId: string; userId: string; projectId: string; stepId: string;
}) {
  await requireProject(opts.tenantId, opts.projectId, true);
  return db.transaction(async (tx) => {
    const [step] = await tx.select().from(schema.migrationSteps).where(and(
      eq(schema.migrationSteps.id, opts.stepId),
      eq(schema.migrationSteps.tenantId, opts.tenantId),
      eq(schema.migrationSteps.projectId, opts.projectId),
    )).for("update");
    if (!step) throw notFound("Migration step not found");
    if (step.status !== "STAGED") throw conflict("Only staged steps can be discarded");
    if (step.importBatchId) {
      await tx.update(schema.importBatches).set({ status: "CANCELLED" }).where(and(
        eq(schema.importBatches.id, step.importBatchId),
        eq(schema.importBatches.status, "PREVIEW"),
      ));
    }
    const [updated] = await tx.update(schema.migrationSteps).set({
      status: "DISCARDED", updatedAt: new Date(),
    }).where(eq(schema.migrationSteps.id, step.id)).returning();
    await audit(tx, opts.tenantId, opts.userId, "migration_step.discarded", "migration_step",
      step.id, { kind: step.kind });
    return updated;
  });
}

// ---------------------------------------------------------------------------
// Rollback (owner-only at the route): safe inverses only, all-or-nothing.
// ---------------------------------------------------------------------------
export async function rollbackStep(opts: {
  tenantId: string; userId: string; projectId: string; stepId: string; reason: string;
}) {
  await requireProject(opts.tenantId, opts.projectId, true);
  return db.transaction(async (tx) => {
    const [step] = await tx.select().from(schema.migrationSteps).where(and(
      eq(schema.migrationSteps.id, opts.stepId),
      eq(schema.migrationSteps.tenantId, opts.tenantId),
      eq(schema.migrationSteps.projectId, opts.projectId),
    )).for("update");
    if (!step) throw notFound("Migration step not found");
    if (step.status !== "COMMITTED") throw conflict("Only committed steps can be rolled back");

    const kind = step.kind as MigrationStepKind;
    let detail: Record<string, unknown>;

    if (kind === "contacts" || kind === "products") {
      const rows = await tx.select().from(schema.importRows).where(and(
        eq(schema.importRows.batchId, step.importBatchId!),
        eq(schema.importRows.status, "IMPORTED"),
      ));
      const ids = rows.map((row) => row.createdRecordId).filter((v): v is string => !!v);
      const table = kind === "contacts" ? schema.contacts : schema.products;
      if (ids.length) {
        await tx.delete(table).where(and(
          eq(table.tenantId, opts.tenantId), inArray(table.id, ids),
        )).catch((error: unknown) => {
          const code = (error as { code?: string }).code
            ?? (error as { cause?: { code?: string } }).cause?.code;
          if (code === "23503") {
            throw conflict(`Cannot roll back: some imported ${kind} are already referenced by other records`);
          }
          throw error;
        });
        await tx.update(schema.importRows).set({ status: "ROLLED_BACK" })
          .where(inArray(schema.importRows.id, rows.map((row) => row.id)));
      }
      detail = { deleted: ids.length };
    } else if (kind === "opening_trial_balance") {
      detail = await rollbackOpeningTrialBalance(tx, {
        tenantId: opts.tenantId, actorUserId: opts.userId, step, reason: opts.reason,
      });
    } else if (kind === "open_invoices" || kind === "open_bills") {
      detail = await rollbackOpenItems(tx, { tenantId: opts.tenantId, stepId: step.id });
    } else {
      throw badRequest("Opening stock steps cannot be rolled back automatically — stock movements and valuation layers require a dedicated reversal. Correct via stock adjustments instead.");
    }

    const [updated] = await tx.update(schema.migrationSteps).set({
      status: "ROLLED_BACK",
      reversalJournalEntryId: (detail.reversalJournalEntryId as string | undefined) ?? null,
      summary: { ...(step.summary as object), rollback: { ...detail, reason: opts.reason } },
      updatedAt: new Date(),
    }).where(eq(schema.migrationSteps.id, step.id)).returning();
    await audit(tx, opts.tenantId, opts.userId, "migration_step.rolled_back", "migration_step",
      step.id, { kind, reason: opts.reason, ...detail });
    return updated;
  });
}

// ---------------------------------------------------------------------------
// Sign-off + close (PM-002 accountant gate; owner-only at the route).
// ---------------------------------------------------------------------------
export async function signOffProject(
  tenantId: string, userId: string, projectId: string, input: z.infer<typeof signOffSchema>,
) {
  await requireProject(tenantId, projectId, true);
  return db.transaction(async (tx) => {
    const signOff = {
      ...input, signedAt: new Date().toISOString(), recordedBy: userId,
    };
    const [project] = await tx.update(schema.migrationProjects).set({
      signOff, updatedAt: new Date(),
    }).where(eq(schema.migrationProjects.id, projectId)).returning();
    await audit(tx, tenantId, userId, "migration_project.signed_off", "migration_project",
      projectId, signOff);
    return project;
  });
}

export async function closeProject(tenantId: string, userId: string, projectId: string) {
  const project = await requireProject(tenantId, projectId, true);
  const steps = await db.select({ status: schema.migrationSteps.status })
    .from(schema.migrationSteps).where(eq(schema.migrationSteps.projectId, projectId));
  if (steps.some((step) => step.status === "STAGED")) {
    throw conflict("Commit or discard staged steps before closing the project");
  }
  return db.transaction(async (tx) => {
    const [closed] = await tx.update(schema.migrationProjects).set({
      status: "CLOSED", updatedAt: new Date(),
    }).where(eq(schema.migrationProjects.id, project.id)).returning();
    await audit(tx, tenantId, userId, "migration_project.closed", "migration_project", project.id, {
      signedOff: !!project.signOff,
    });
    return closed;
  });
}
