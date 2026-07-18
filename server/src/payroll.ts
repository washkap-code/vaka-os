// ============================================================================
// P2-009 — Zimbabwe payroll (TECHNICAL PREVIEW — accountant gate active).
//
// The engine contains no country-specific rates: PAYE bands, the AIDS levy
// and NSSA rules come from effective-dated country-pack configuration and are
// snapshotted per payslip with a full calculation trace. Posting a run
// creates ONE balanced journal through postJournal (period close, tenant
// isolation and append-only history therefore apply automatically). Posted
// runs are immutable; the only correction is a full offsetting reversal,
// which frees the month for a corrected re-run.
//
// v1 limits (documented in the mission pack): monthly pay, tenant base
// currency only, statutory deductions only (no advances/garnishees), no
// remittance/settlement automation.
// ============================================================================
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import {
  audit, badRequest, conflict, db, fromCents, mulRate, notFound, schema, toCents, type DB,
} from "./lib.js";
import { postJournal } from "./accounting.js";
import { periodMonthSchema } from "./accounting-periods.js";
import { LOCALISATION_SERVICE, platformKernel } from "./platform-runtime.js";
import { enforceApprovalPolicy } from "./approval-policies.js";
import type {
  PayeTable, PayrollConfig, SocialSecurityRule,
} from "./platform/localisation/types.js";
import { DOMAIN_EVENTS, runWithPostCommitEvents } from "./platform/events/index.js";

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------
const moneyString = z.string().regex(/^\d{1,10}(\.\d{1,2})?$/, "Amount must be a non-negative number with up to 2 decimals");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

export const employeeInputSchema = z.object({
  employeeNumber: z.string().trim().min(1).max(30),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  nationalId: z.string().trim().max(50).optional(),
  nssaNumber: z.string().trim().max(50).optional(),
  email: z.string().trim().email().max(255).optional(),
  phone: z.string().trim().max(50).optional(),
  currency: z.enum(["USD", "ZWG"]),
  basicSalary: moneyString,
  startDate: isoDate.optional(),
});

export const employeeUpdateSchema = employeeInputSchema.partial().extend({
  status: z.enum(["ACTIVE", "ENDED"]).optional(),
  endDate: isoDate.optional(),
});

export const payslipAdjustmentSchema = z.object({
  allowances: moneyString,
});

export const reverseReasonSchema = z.string().trim().min(3).max(500);

// ---------------------------------------------------------------------------
// Effective-dated configuration resolution — fail closed everywhere.
// ---------------------------------------------------------------------------
function payrollConfigFor(countryCode: string): PayrollConfig {
  const pack = platformKernel().container.get(LOCALISATION_SERVICE).pack(countryCode);
  if (!pack.payroll) {
    throw badRequest(`Payroll is not yet available for ${pack.name} — no statutory payroll configuration exists`);
  }
  return pack.payroll;
}

const coversDate = (from: string, to: string | null, onDate: string) =>
  from <= onDate && (to === null || onDate < to);

export function effectivePayeTable(config: PayrollConfig, currencyCode: string, onDate: string): PayeTable {
  const table = config.payeTables.find((t) =>
    t.currency === currencyCode && coversDate(t.effectiveFrom, t.effectiveTo, onDate));
  if (!table) {
    throw badRequest(`No effective PAYE table covers ${currencyCode} on ${onDate} — payroll cannot be calculated`);
  }
  return table;
}

export function effectiveSocialSecurity(config: PayrollConfig, onDate: string): SocialSecurityRule {
  const rule = config.socialSecurity.find((r) => coversDate(r.effectiveFrom, r.effectiveTo, onDate));
  if (!rule) {
    throw badRequest(`No effective social-security rule covers ${onDate} — payroll cannot be calculated`);
  }
  return rule;
}

// ---------------------------------------------------------------------------
// Calculation — integer-cents arithmetic only.
// ---------------------------------------------------------------------------
const pctRate = (percent: number): string => (percent / 100).toFixed(6);

interface PayeBandTrace {
  bandUpToMonthly: number | null;
  percent: number;
  bandAmount: string;
  tax: string;
}

export function calculatePaye(taxableCents: bigint, table: PayeTable): {
  payeCents: bigint; levyCents: bigint; bands: PayeBandTrace[];
} {
  let remaining = taxableCents;
  let previousBound = 0n;
  let paye = 0n;
  const bands: PayeBandTrace[] = [];
  for (const band of table.bands) {
    if (remaining <= 0n) break;
    const upper = band.upToMonthly === null ? null : toCents(band.upToMonthly);
    const width = upper === null ? remaining : upper - previousBound;
    const inBand = width < remaining ? width : remaining;
    if (inBand <= 0n) { previousBound = upper ?? previousBound; continue; }
    const tax = mulRate(inBand, pctRate(band.percent));
    paye += tax;
    bands.push({
      bandUpToMonthly: band.upToMonthly,
      percent: band.percent,
      bandAmount: fromCents(inBand),
      tax: fromCents(tax),
    });
    remaining -= inBand;
    if (upper !== null) previousBound = upper;
  }
  const levy = mulRate(paye, pctRate(table.taxLevyPercent));
  return { payeCents: paye, levyCents: levy, bands };
}

export interface PayslipFigures {
  basicSalary: string;
  allowances: string;
  grossPay: string;
  ssEmployee: string;
  ssEmployer: string;
  taxablePay: string;
  paye: string;
  taxLevy: string;
  netPay: string;
  calculationTrace: Record<string, unknown>;
}

export function computePayslip(opts: {
  basicSalary: string;
  allowances: string;
  currency: string;
  payeTable: PayeTable;
  ssRule: SocialSecurityRule;
  onDate: string;
}): PayslipFigures {
  const basic = toCents(opts.basicSalary);
  const allowances = toCents(opts.allowances);
  if (basic < 0n || allowances < 0n) throw badRequest("Payroll amounts must be non-negative");
  const gross = basic + allowances;

  const ceiling = opts.ssRule.monthlyCeilings.find((c) => c.currency === opts.currency);
  if (!ceiling) {
    throw badRequest(
      `The NSSA insurable-earnings ceiling for ${opts.currency} is not configured — ` +
      `payroll in this currency is unavailable until the gazetted value is verified`,
    );
  }
  const ceilingCents = toCents(ceiling.amount);
  const insurable = gross < ceilingCents ? gross : ceilingCents;
  const ssEmployee = mulRate(insurable, pctRate(opts.ssRule.employeePercent));
  const ssEmployer = mulRate(insurable, pctRate(opts.ssRule.employerPercent));

  const taxable = opts.ssRule.employeeContributionTaxDeductible ? gross - ssEmployee : gross;
  const { payeCents, levyCents, bands } = calculatePaye(taxable, opts.payeTable);
  const net = gross - ssEmployee - payeCents - levyCents;
  if (net < 0n) throw badRequest("Computed net pay is negative — review the employee's salary configuration");

  return {
    basicSalary: fromCents(basic),
    allowances: fromCents(allowances),
    grossPay: fromCents(gross),
    ssEmployee: fromCents(ssEmployee),
    ssEmployer: fromCents(ssEmployer),
    taxablePay: fromCents(taxable),
    paye: fromCents(payeCents),
    taxLevy: fromCents(levyCents),
    netPay: fromCents(net),
    calculationTrace: {
      configResolvedOn: opts.onDate,
      payeTable: {
        currency: opts.payeTable.currency,
        effectiveFrom: opts.payeTable.effectiveFrom,
        effectiveTo: opts.payeTable.effectiveTo,
        taxLevyPercent: opts.payeTable.taxLevyPercent,
      },
      socialSecurity: {
        effectiveFrom: opts.ssRule.effectiveFrom,
        effectiveTo: opts.ssRule.effectiveTo,
        employeePercent: opts.ssRule.employeePercent,
        employerPercent: opts.ssRule.employerPercent,
        monthlyCeiling: ceiling.amount,
        insurableEarnings: fromCents(insurable),
        employeeContributionTaxDeductible: opts.ssRule.employeeContributionTaxDeductible,
      },
      payeBands: bands,
    },
  };
}

// ---------------------------------------------------------------------------
// Payroll ledger accounts — mirror of ensureBankLedgerAccount: assign system
// keys to the standard chart rows (or create them) without touching any
// posted journal.
// ---------------------------------------------------------------------------
const PAYROLL_ACCOUNTS = [
  { key: "WAGES_EXPENSE", code: "6000", name: "Salaries & Wages", type: "EXPENSE" as const },
  { key: "PAYE_PAYABLE", code: "2200", name: "PAYE Payable", type: "LIABILITY" as const },
  { key: "NSSA_PAYABLE", code: "2210", name: "NSSA Payable", type: "LIABILITY" as const },
  { key: "NET_WAGES_PAYABLE", code: "2220", name: "Net Wages Payable", type: "LIABILITY" as const },
];

export async function ensurePayrollAccounts(tx: DB, tenantId: string): Promise<Record<string, string>> {
  const resolved: Record<string, string> = {};
  for (const spec of PAYROLL_ACCOUNTS) {
    const [byKey] = await tx.select({ id: schema.accounts.id }).from(schema.accounts).where(and(
      eq(schema.accounts.tenantId, tenantId),
      eq(schema.accounts.systemKey, spec.key),
      eq(schema.accounts.isActive, true),
    ));
    if (byKey) { resolved[spec.key] = byKey.id; continue; }

    const [byCode] = await tx.select({
      id: schema.accounts.id, type: schema.accounts.type, systemKey: schema.accounts.systemKey,
    }).from(schema.accounts).where(and(
      eq(schema.accounts.tenantId, tenantId),
      eq(schema.accounts.code, spec.code),
      eq(schema.accounts.isActive, true),
    ));
    if (byCode) {
      if (byCode.type !== spec.type || (byCode.systemKey && byCode.systemKey !== spec.key)) {
        throw badRequest(
          `Account ${spec.code} exists but cannot be used for payroll (${spec.name}) — ` +
          `contact support to map the ${spec.key} account`,
        );
      }
      await tx.update(schema.accounts)
        .set({ systemKey: spec.key, isSystem: true })
        .where(eq(schema.accounts.id, byCode.id));
      resolved[spec.key] = byCode.id;
      continue;
    }

    await tx.insert(schema.accounts).values({
      tenantId, code: spec.code, name: spec.name, type: spec.type,
      isSystem: true, systemKey: spec.key,
    }).onConflictDoNothing();
    const [created] = await tx.select({ id: schema.accounts.id }).from(schema.accounts).where(and(
      eq(schema.accounts.tenantId, tenantId),
      eq(schema.accounts.systemKey, spec.key),
    ));
    if (!created) throw badRequest(`Could not provision the ${spec.name} account for payroll`);
    resolved[spec.key] = created.id;
  }
  return resolved;
}

// ---------------------------------------------------------------------------
// Employee register (no ledger effect; fully audited)
// ---------------------------------------------------------------------------
async function tenantBaseCurrency(tenantId: string) {
  const [tenant] = await db.select({
    baseCurrency: schema.tenants.baseCurrency,
    countryCode: schema.tenants.countryCode,
  }).from(schema.tenants).where(eq(schema.tenants.id, tenantId));
  if (!tenant) throw notFound("Tenant not found");
  return tenant;
}

export async function listEmployees(tenantId: string) {
  return db.select().from(schema.employees)
    .where(eq(schema.employees.tenantId, tenantId))
    .orderBy(schema.employees.employeeNumber);
}

export async function createEmployee(
  tenantId: string, userId: string, input: z.infer<typeof employeeInputSchema>,
) {
  const tenant = await tenantBaseCurrency(tenantId);
  if (input.currency !== tenant.baseCurrency) {
    throw badRequest(
      `Payroll v1 supports the tenant base currency only (${tenant.baseCurrency}) — ` +
      `multi-currency payroll is a later mission`,
    );
  }
  return runWithPostCommitEvents((queue) => db.transaction(async (tx) => {
    const [existing] = await tx.select({ id: schema.employees.id }).from(schema.employees).where(and(
      eq(schema.employees.tenantId, tenantId),
      eq(schema.employees.employeeNumber, input.employeeNumber),
    ));
    if (existing) throw conflict(`Employee number ${input.employeeNumber} is already in use`);
    const [employee] = await tx.insert(schema.employees).values({
      tenantId,
      employeeNumber: input.employeeNumber,
      firstName: input.firstName,
      lastName: input.lastName,
      nationalId: input.nationalId ?? null,
      nssaNumber: input.nssaNumber ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      currency: input.currency,
      basicSalary: input.basicSalary,
      startDate: input.startDate ?? null,
      createdBy: userId,
    }).returning();
    await audit(tx, tenantId, userId, "payroll.employee.created", "employee", employee.id, {
      employeeNumber: employee.employeeNumber,
    });
    queue({
      id: `${DOMAIN_EVENTS.EMPLOYEE_CREATED}:${employee.id}`,
      type: DOMAIN_EVENTS.EMPLOYEE_CREATED,
      tenantId,
      actorUserId: userId,
      payload: { employeeId: employee.id },
    });
    return employee;
  }));
}

export async function updateEmployee(
  tenantId: string, userId: string, employeeId: string,
  input: z.infer<typeof employeeUpdateSchema>,
) {
  const tenant = await tenantBaseCurrency(tenantId);
  if (input.currency && input.currency !== tenant.baseCurrency) {
    throw badRequest(`Payroll v1 supports the tenant base currency only (${tenant.baseCurrency})`);
  }
  if (input.status === "ENDED" && !input.endDate) {
    throw badRequest("Ending employment requires an end date");
  }
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(schema.employees).where(and(
      eq(schema.employees.tenantId, tenantId), eq(schema.employees.id, employeeId),
    ));
    if (!current) throw notFound("Employee not found");
    if (input.employeeNumber && input.employeeNumber !== current.employeeNumber) {
      const [clash] = await tx.select({ id: schema.employees.id }).from(schema.employees).where(and(
        eq(schema.employees.tenantId, tenantId),
        eq(schema.employees.employeeNumber, input.employeeNumber),
      ));
      if (clash) throw conflict(`Employee number ${input.employeeNumber} is already in use`);
    }
    const [updated] = await tx.update(schema.employees).set({
      ...(input.employeeNumber !== undefined && { employeeNumber: input.employeeNumber }),
      ...(input.firstName !== undefined && { firstName: input.firstName }),
      ...(input.lastName !== undefined && { lastName: input.lastName }),
      ...(input.nationalId !== undefined && { nationalId: input.nationalId }),
      ...(input.nssaNumber !== undefined && { nssaNumber: input.nssaNumber }),
      ...(input.email !== undefined && { email: input.email }),
      ...(input.phone !== undefined && { phone: input.phone }),
      ...(input.currency !== undefined && { currency: input.currency }),
      ...(input.basicSalary !== undefined && { basicSalary: input.basicSalary }),
      ...(input.startDate !== undefined && { startDate: input.startDate }),
      ...(input.endDate !== undefined && { endDate: input.endDate }),
      ...(input.status !== undefined && { status: input.status }),
      updatedAt: new Date(),
    }).where(and(
      eq(schema.employees.tenantId, tenantId), eq(schema.employees.id, employeeId),
    )).returning();
    await audit(tx, tenantId, userId, "payroll.employee.updated", "employee", employeeId, {
      changedFields: Object.keys(input),
    });
    return updated;
  });
}

// ---------------------------------------------------------------------------
// Payroll run lifecycle: DRAFT -> POSTED -> (REVERSED)
// ---------------------------------------------------------------------------
const lastDayOfMonthUtc = (periodMonth: string): Date => {
  const [y, m] = periodMonth.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)); // day 0 of next month = last day of this
};

/** Verification banner served with every payroll response (accountant gate). */
export async function payrollConfigView(tenantId: string) {
  const tenant = await tenantBaseCurrency(tenantId);
  const config = payrollConfigFor(tenant.countryCode);
  return {
    baseCurrency: tenant.baseCurrency,
    verification: config.verification,
    payeTables: config.payeTables,
    socialSecurity: config.socialSecurity,
  };
}

export async function listPayrollRuns(tenantId: string) {
  return db.select().from(schema.payrollRuns)
    .where(eq(schema.payrollRuns.tenantId, tenantId))
    .orderBy(desc(schema.payrollRuns.periodMonth), desc(schema.payrollRuns.createdAt));
}

export async function getPayrollRun(tenantId: string, runId: string) {
  const [run] = await db.select().from(schema.payrollRuns).where(and(
    eq(schema.payrollRuns.tenantId, tenantId), eq(schema.payrollRuns.id, runId),
  ));
  if (!run) throw notFound("Payroll run not found");
  const slips = await db.select().from(schema.payslips)
    .where(and(eq(schema.payslips.tenantId, tenantId), eq(schema.payslips.payrollRunId, runId)))
    .orderBy(schema.payslips.employeeNumber);
  return { ...run, payslips: slips };
}

const runTotals = (slips: PayslipFigures[]) => {
  let gross = 0n, paye = 0n, levy = 0n, ssE = 0n, ssR = 0n, net = 0n;
  for (const s of slips) {
    gross += toCents(s.grossPay); paye += toCents(s.paye); levy += toCents(s.taxLevy);
    ssE += toCents(s.ssEmployee); ssR += toCents(s.ssEmployer); net += toCents(s.netPay);
  }
  return {
    grossTotal: fromCents(gross), payeTotal: fromCents(paye), taxLevyTotal: fromCents(levy),
    ssEmployeeTotal: fromCents(ssE), ssEmployerTotal: fromCents(ssR), netTotal: fromCents(net),
  };
};

export async function createPayrollRun(tenantId: string, userId: string, periodMonthInput: string) {
  periodMonthSchema.parse(periodMonthInput);
  const periodMonth = `${periodMonthInput}-01`;
  const tenant = await tenantBaseCurrency(tenantId);
  const config = payrollConfigFor(tenant.countryCode);
  const onDate = periodMonth;
  const payeTable = effectivePayeTable(config, tenant.baseCurrency, onDate);
  const ssRule = effectiveSocialSecurity(config, onDate);

  return db.transaction(async (tx) => {
    const [live] = await tx.select({ id: schema.payrollRuns.id, status: schema.payrollRuns.status })
      .from(schema.payrollRuns).where(and(
        eq(schema.payrollRuns.tenantId, tenantId),
        eq(schema.payrollRuns.periodMonth, periodMonth),
        eq(schema.payrollRuns.currency, tenant.baseCurrency),
      ));
    if (live && live.status !== "REVERSED") {
      throw conflict(`A ${live.status.toLowerCase()} payroll run already exists for ${periodMonthInput}`);
    }

    const staff = await tx.select().from(schema.employees).where(and(
      eq(schema.employees.tenantId, tenantId),
      eq(schema.employees.status, "ACTIVE"),
      eq(schema.employees.currency, tenant.baseCurrency),
    ));
    if (!staff.length) throw badRequest("No active employees in the tenant base currency — add employees first");

    const figures = staff.map((employee) => ({
      employee,
      slip: computePayslip({
        basicSalary: employee.basicSalary, allowances: "0",
        currency: tenant.baseCurrency, payeTable, ssRule, onDate,
      }),
    }));
    const totals = runTotals(figures.map((f) => f.slip));

    const [run] = await tx.insert(schema.payrollRuns).values({
      tenantId, periodMonth, currency: tenant.baseCurrency, status: "DRAFT",
      employeeCount: staff.length, ...totals,
      verificationStatus: config.verification.status,
      verificationNote: config.verification.note,
      createdBy: userId,
    }).returning();

    await tx.insert(schema.payslips).values(figures.map(({ employee, slip }) => ({
      tenantId, payrollRunId: run.id, employeeId: employee.id,
      employeeNumber: employee.employeeNumber,
      employeeName: `${employee.firstName} ${employee.lastName}`,
      currency: tenant.baseCurrency,
      basicSalary: slip.basicSalary, allowances: slip.allowances, grossPay: slip.grossPay,
      ssEmployee: slip.ssEmployee, ssEmployer: slip.ssEmployer, taxablePay: slip.taxablePay,
      paye: slip.paye, taxLevy: slip.taxLevy, netPay: slip.netPay,
      calculationTrace: slip.calculationTrace,
    })));

    await audit(tx, tenantId, userId, "payroll.run.created", "payroll_run", run.id, {
      periodMonth: periodMonthInput, employeeCount: staff.length, ...totals,
      verificationStatus: config.verification.status,
    });
    return run;
  });
}

/** Adjust one draft payslip's taxable allowances and recompute it. */
export async function updateDraftPayslip(
  tenantId: string, userId: string, runId: string, payslipId: string, allowances: string,
) {
  return db.transaction(async (tx) => {
    const [run] = await tx.select().from(schema.payrollRuns).where(and(
      eq(schema.payrollRuns.tenantId, tenantId), eq(schema.payrollRuns.id, runId),
    ));
    if (!run) throw notFound("Payroll run not found");
    if (run.status !== "DRAFT") throw conflict("Only draft payroll runs can be adjusted");

    const [slip] = await tx.select().from(schema.payslips).where(and(
      eq(schema.payslips.tenantId, tenantId),
      eq(schema.payslips.payrollRunId, runId),
      eq(schema.payslips.id, payslipId),
    ));
    if (!slip) throw notFound("Payslip not found");

    const tenant = await tenantBaseCurrency(tenantId);
    const config = payrollConfigFor(tenant.countryCode);
    const onDate = run.periodMonth as unknown as string;
    const recomputed = computePayslip({
      basicSalary: slip.basicSalary, allowances,
      currency: run.currency, payeTable: effectivePayeTable(config, run.currency, onDate),
      ssRule: effectiveSocialSecurity(config, onDate), onDate,
    });

    await tx.update(schema.payslips).set({
      allowances: recomputed.allowances, grossPay: recomputed.grossPay,
      ssEmployee: recomputed.ssEmployee, ssEmployer: recomputed.ssEmployer,
      taxablePay: recomputed.taxablePay, paye: recomputed.paye, taxLevy: recomputed.taxLevy,
      netPay: recomputed.netPay, calculationTrace: recomputed.calculationTrace,
      updatedAt: new Date(),
    }).where(eq(schema.payslips.id, payslipId));

    const slips = await tx.select().from(schema.payslips).where(and(
      eq(schema.payslips.tenantId, tenantId), eq(schema.payslips.payrollRunId, runId),
    ));
    const totals = runTotals(slips as unknown as PayslipFigures[]);
    await tx.update(schema.payrollRuns).set({ ...totals, updatedAt: new Date() })
      .where(eq(schema.payrollRuns.id, runId));

    await audit(tx, tenantId, userId, "payroll.run.updated", "payroll_run", runId, {
      payslipId, allowances,
    });
    return { ...totals, payslipId };
  });
}

export async function deleteDraftRun(tenantId: string, userId: string, runId: string) {
  return db.transaction(async (tx) => {
    const [run] = await tx.select().from(schema.payrollRuns).where(and(
      eq(schema.payrollRuns.tenantId, tenantId), eq(schema.payrollRuns.id, runId),
    ));
    if (!run) throw notFound("Payroll run not found");
    if (run.status !== "DRAFT") throw conflict("Only draft payroll runs can be deleted — posted runs are reversed, never removed");
    await tx.delete(schema.payslips).where(and(
      eq(schema.payslips.tenantId, tenantId), eq(schema.payslips.payrollRunId, runId),
    ));
    await tx.delete(schema.payrollRuns).where(eq(schema.payrollRuns.id, runId));
    await audit(tx, tenantId, userId, "payroll.run.deleted", "payroll_run", runId, {
      periodMonth: run.periodMonth,
    });
  });
}

export async function postPayrollRun(
  tenantId: string, userId: string, runId: string,
  /** PW-002: actor's permissions for tenant-configured approval policies. */
  actorPermissions: readonly string[] = [],
) {
  return db.transaction(async (tx) => {
    const [run] = await tx.select().from(schema.payrollRuns).where(and(
      eq(schema.payrollRuns.tenantId, tenantId), eq(schema.payrollRuns.id, runId),
    ));
    if (!run) throw notFound("Payroll run not found");
    if (run.status !== "DRAFT") throw conflict("Only draft payroll runs can be posted");

    // PW-002: tenant-configured policy (threshold / permission / second
    // person) on the run's gross amount. No policy = no change.
    await enforceApprovalPolicy({
      tx, tenantId, subjectType: "payroll_run",
      amountCents: toCents(run.grossTotal),
      actorUserId: userId,
      actorPermissions,
      subjectCreatedBy: run.createdBy,
    });

    const accounts = await ensurePayrollAccounts(tx, tenantId);
    const gross = toCents(run.grossTotal);
    const paye = toCents(run.payeTotal) + toCents(run.taxLevyTotal);
    const ss = toCents(run.ssEmployeeTotal) + toCents(run.ssEmployerTotal);
    const net = toCents(run.netTotal);
    const wagesDebit = gross + toCents(run.ssEmployerTotal);

    const periodMonth = run.periodMonth as unknown as string;
    const journalEntryId = await postJournal(tx, {
      tenantId,
      date: lastDayOfMonthUtc(periodMonth.slice(0, 7)),
      memo: `Payroll — ${periodMonth.slice(0, 7)}`,
      sourceType: "payroll_run",
      sourceId: run.id,
      createdBy: userId,
      lines: [
        { accountId: accounts.WAGES_EXPENSE, debit: fromCents(wagesDebit) },
        { accountId: accounts.PAYE_PAYABLE, credit: fromCents(paye) },
        { accountId: accounts.NSSA_PAYABLE, credit: fromCents(ss) },
        { accountId: accounts.NET_WAGES_PAYABLE, credit: fromCents(net) },
      ],
    });

    const [posted] = await tx.update(schema.payrollRuns).set({
      status: "POSTED", journalEntryId, postedBy: userId, postedAt: new Date(), updatedAt: new Date(),
    }).where(and(
      eq(schema.payrollRuns.id, runId), eq(schema.payrollRuns.status, "DRAFT"),
    )).returning();
    if (!posted) throw conflict("Payroll run was modified concurrently — reload and retry");

    await audit(tx, tenantId, userId, "payroll.run.posted", "payroll_run", runId, {
      journalEntryId, grossTotal: run.grossTotal, netTotal: run.netTotal,
      payeTotal: run.payeTotal, taxLevyTotal: run.taxLevyTotal,
      ssEmployeeTotal: run.ssEmployeeTotal, ssEmployerTotal: run.ssEmployerTotal,
      verificationStatus: run.verificationStatus,
    });
    return posted;
  });
}

/**
 * Reverse a posted run with a full offsetting journal dated today (postJournal
 * refuses if today's period is closed). The month becomes runnable again.
 */
export async function reversePayrollRun(tenantId: string, userId: string, runId: string, reason: string) {
  reverseReasonSchema.parse(reason);
  return db.transaction(async (tx) => {
    const [run] = await tx.select().from(schema.payrollRuns).where(and(
      eq(schema.payrollRuns.tenantId, tenantId), eq(schema.payrollRuns.id, runId),
    ));
    if (!run) throw notFound("Payroll run not found");
    if (run.status !== "POSTED") throw conflict("Only posted payroll runs can be reversed");

    const accounts = await ensurePayrollAccounts(tx, tenantId);
    const paye = toCents(run.payeTotal) + toCents(run.taxLevyTotal);
    const ss = toCents(run.ssEmployeeTotal) + toCents(run.ssEmployerTotal);
    const net = toCents(run.netTotal);
    const wages = toCents(run.grossTotal) + toCents(run.ssEmployerTotal);

    const periodLabel = (run.periodMonth as unknown as string).slice(0, 7);
    const reversalJournalEntryId = await postJournal(tx, {
      tenantId,
      date: new Date(),
      memo: `Reversal of payroll — ${periodLabel}: ${reason}`,
      sourceType: "payroll_run_reversal",
      sourceId: run.id,
      createdBy: userId,
      lines: [
        { accountId: accounts.WAGES_EXPENSE, credit: fromCents(wages) },
        { accountId: accounts.PAYE_PAYABLE, debit: fromCents(paye) },
        { accountId: accounts.NSSA_PAYABLE, debit: fromCents(ss) },
        { accountId: accounts.NET_WAGES_PAYABLE, debit: fromCents(net) },
      ],
    });

    const [reversed] = await tx.update(schema.payrollRuns).set({
      status: "REVERSED", reversalJournalEntryId,
      reversedBy: userId, reversedAt: new Date(), reversedReason: reason, updatedAt: new Date(),
    }).where(and(
      eq(schema.payrollRuns.id, runId), eq(schema.payrollRuns.status, "POSTED"),
    )).returning();
    if (!reversed) throw conflict("Payroll run was modified concurrently — reload and retry");

    await audit(tx, tenantId, userId, "payroll.run.reversed", "payroll_run", runId, {
      reversalJournalEntryId, reason,
    });
    return reversed;
  });
}
