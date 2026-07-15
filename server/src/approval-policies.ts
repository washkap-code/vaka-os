// ============================================================================
// PW-002 — Tenant approval-policy configuration and domain evaluation glue.
//
// Owners/Admins configure one optional policy per subject type (purchase
// orders, payroll runs): an amount threshold in the tenant base currency, an
// extra required permission, and/or a second-person rule. Domains load the
// policy inside their own transaction and evaluate it through the kernel
// ApprovalService. No policy = behaviour unchanged.
// ============================================================================
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import {
  audit, badRequest, conflict, db, PERMISSIONS, schema, toCents, type DB,
} from "./lib.js";
import { APPROVAL_SERVICE, platformKernel } from "./platform-runtime.js";
import {
  ApprovalPolicyViolationError, type ApprovalPolicyRule,
} from "./platform/workflow/approvals.js";

export const APPROVAL_POLICY_SUBJECTS = [
  { subjectType: "purchase_order", label: "purchase order" },
  { subjectType: "payroll_run", label: "payroll run" },
] as const;
export type ApprovalPolicySubject = (typeof APPROVAL_POLICY_SUBJECTS)[number]["subjectType"];

export const approvalPolicySubjectSchema = z.enum(["purchase_order", "payroll_run"]);

export const approvalPolicyInputSchema = z.object({
  thresholdAmount: z.string().regex(/^\d{1,10}(\.\d{1,2})?$/, "Threshold must be a non-negative amount"),
  requiredPermission: z.string().nullable().optional().transform((v) => v ?? null),
  requireDistinctActor: z.boolean(),
}).superRefine((value, ctx) => {
  if (value.requiredPermission && !(PERMISSIONS as readonly string[]).includes(value.requiredPermission)) {
    ctx.addIssue({ code: "custom", message: `Unknown permission: ${value.requiredPermission}` });
  }
  if (!value.requiredPermission && !value.requireDistinctActor) {
    ctx.addIssue({ code: "custom", message: "A policy must require a permission, a second person, or both" });
  }
});

const subjectLabel = (subjectType: ApprovalPolicySubject): string =>
  APPROVAL_POLICY_SUBJECTS.find((s) => s.subjectType === subjectType)!.label;

// ---------------------------------------------------------------------------
// Configuration (settings.manage; audited)
// ---------------------------------------------------------------------------
export async function listApprovalPolicies(tenantId: string) {
  const rows = await db.select().from(schema.approvalPolicies)
    .where(eq(schema.approvalPolicies.tenantId, tenantId));
  return APPROVAL_POLICY_SUBJECTS.map(({ subjectType, label }) => {
    const row = rows.find((r) => r.subjectType === subjectType);
    return {
      subjectType, label,
      configured: !!row,
      thresholdAmount: row?.thresholdAmount ?? null,
      requiredPermission: row?.requiredPermission ?? null,
      requireDistinctActor: row?.requireDistinctActor ?? false,
      updatedAt: row?.updatedAt ?? null,
    };
  });
}

export async function setApprovalPolicy(
  tenantId: string, userId: string, subjectType: ApprovalPolicySubject,
  input: z.infer<typeof approvalPolicyInputSchema>,
) {
  await db.insert(schema.approvalPolicies).values({
    tenantId, subjectType,
    thresholdAmount: input.thresholdAmount,
    requiredPermission: input.requiredPermission,
    requireDistinctActor: input.requireDistinctActor,
    updatedBy: userId,
  }).onConflictDoUpdate({
    target: [schema.approvalPolicies.tenantId, schema.approvalPolicies.subjectType],
    set: {
      thresholdAmount: input.thresholdAmount,
      requiredPermission: input.requiredPermission,
      requireDistinctActor: input.requireDistinctActor,
      updatedBy: userId,
      updatedAt: sql`now()`,
    },
  });
  await audit(db, tenantId, userId, "approval_policy.updated", "approval_policy", undefined, {
    subjectType, ...input,
  });
  return listApprovalPolicies(tenantId);
}

export async function removeApprovalPolicy(
  tenantId: string, userId: string, subjectType: ApprovalPolicySubject,
) {
  const removed = await db.delete(schema.approvalPolicies).where(and(
    eq(schema.approvalPolicies.tenantId, tenantId),
    eq(schema.approvalPolicies.subjectType, subjectType),
  )).returning({ id: schema.approvalPolicies.id });
  if (!removed.length) throw badRequest("No approval policy is configured for this subject");
  await audit(db, tenantId, userId, "approval_policy.removed", "approval_policy", undefined, { subjectType });
  return listApprovalPolicies(tenantId);
}

// ---------------------------------------------------------------------------
// Domain evaluation glue — load inside the caller's transaction, evaluate in
// the kernel, translate violations to the domain's 409 conflict.
// ---------------------------------------------------------------------------
export async function loadApprovalPolicyRule(
  tx: DB, tenantId: string, subjectType: ApprovalPolicySubject,
): Promise<ApprovalPolicyRule | null> {
  const [row] = await tx.select().from(schema.approvalPolicies).where(and(
    eq(schema.approvalPolicies.tenantId, tenantId),
    eq(schema.approvalPolicies.subjectType, subjectType),
  ));
  if (!row) return null;
  return {
    thresholdCents: toCents(row.thresholdAmount),
    requiredPermission: row.requiredPermission,
    requireDistinctActor: row.requireDistinctActor,
  };
}

export async function enforceApprovalPolicy(opts: {
  tx: DB;
  tenantId: string;
  subjectType: ApprovalPolicySubject;
  amountCents: bigint;
  actorUserId: string;
  actorPermissions: readonly string[];
  subjectCreatedBy: string | null;
}): Promise<void> {
  const policy = await loadApprovalPolicyRule(opts.tx, opts.tenantId, opts.subjectType);
  try {
    platformKernel().container.get(APPROVAL_SERVICE).evaluatePolicy({
      subjectLabel: subjectLabel(opts.subjectType),
      policy,
      amountCents: opts.amountCents,
      actorUserId: opts.actorUserId,
      actorPermissions: opts.actorPermissions,
      subjectCreatedBy: opts.subjectCreatedBy,
    });
  } catch (error) {
    if (error instanceof ApprovalPolicyViolationError) throw conflict(error.message);
    throw error;
  }
}
