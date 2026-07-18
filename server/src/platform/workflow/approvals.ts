// ============================================================================
// APPROVAL SERVICE (Mission PW-001) — one approval engine for the platform.
//
// Owns the decision semantics every module previously duplicated:
//   - APPROVE/REJECT outcome mapping and the decision timestamp
//   - segregation-of-duties enforcement (a requester/creator never decides
//     their own subject) with domain-exact messages
//   - canonical audit action naming (`<subject_type>.approved|rejected`)
//
// It deliberately does NOT own persistence: each domain keeps writing its own
// tables inside its own transaction, so extraction changes no behaviour.
// PW-002 adds configurable policies (thresholds, role routing) on top.
// ============================================================================

export type ApprovalDecision = "APPROVE" | "REJECT";

export interface SegregationRule {
  /** User who must not decide this subject (null/undefined rules are skipped). */
  excludedUserId: string | null | undefined;
  /** Domain-exact conflict message shown when the rule is violated. */
  message: string;
}

export interface ApprovalDecisionRequest {
  /** Canonical subject type, e.g. "purchase_requisition", "purchase_order". */
  subjectType: string;
  decision: ApprovalDecision;
  actorUserId: string;
  segregation: readonly SegregationRule[];
}

export interface ApprovalDecisionOutcome {
  status: "APPROVED" | "REJECTED";
  decidedAt: Date;
  /** Canonical audit action, e.g. "purchase_requisition.approved". */
  auditAction: string;
}

export interface ApprovalRevocationRequest {
  /** Canonical subject type, e.g. "verification_badge". */
  subjectType: string;
  actorUserId: string;
  segregation: readonly SegregationRule[];
}

export interface ApprovalRevocationOutcome {
  status: "REVOKED";
  decidedAt: Date;
  auditAction: string;
}

/** Raised when a segregation-of-duties rule blocks the actor. Maps to 409 at the API boundary. */
export class ApprovalPolicyViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApprovalPolicyViolationError";
  }
}

// ---------------------------------------------------------------------------
// PW-002 — configurable approval policies. A policy is tenant configuration
// (loaded by the domain inside its own transaction) evaluated here with pure
// logic. No policy configured (null) means no additional rule — behaviour is
// unchanged until a tenant opts in.
// ---------------------------------------------------------------------------

export interface ApprovalPolicyRule {
  /** Rule applies to amounts at or above this many integer cents (0n = always). */
  thresholdCents: bigint;
  /** Extra permission the actor must hold when the rule applies. */
  requiredPermission: string | null;
  /** When the rule applies, the actor must differ from the subject's creator/preparer. */
  requireDistinctActor: boolean;
}

export interface PolicyEvaluationRequest {
  /** Human label used in violation messages, e.g. "purchase order", "payroll run". */
  subjectLabel: string;
  policy: ApprovalPolicyRule | null;
  amountCents: bigint;
  actorUserId: string;
  actorPermissions: readonly string[];
  /** Creator/preparer of the subject (null when unknown — distinct-actor rule then cannot pass silently and throws). */
  subjectCreatedBy: string | null;
}

export class ApprovalService {
  private enforceSegregation(actorUserId: string, rules: readonly SegregationRule[]): void {
    for (const rule of rules) {
      if (rule.excludedUserId && rule.excludedUserId === actorUserId) {
        throw new ApprovalPolicyViolationError(rule.message);
      }
    }
  }

  /**
   * Validate segregation-of-duties and produce the canonical outcome.
   * Throws ApprovalPolicyViolationError with the first violated rule's
   * domain message; performs no I/O.
   */
  decide(request: ApprovalDecisionRequest): ApprovalDecisionOutcome {
    this.enforceSegregation(request.actorUserId, request.segregation);
    const status = request.decision === "APPROVE" ? "APPROVED" : "REJECTED";
    return {
      status,
      decidedAt: new Date(),
      auditAction: `${request.subjectType}.${status === "APPROVED" ? "approved" : "rejected"}`,
    };
  }

  /**
   * Record the deterministic outcome for a revocation while preserving the
   * same segregation engine used by APPROVE/REJECT. Persistence and the
   * mandatory reason remain domain-owned and append-only.
   */
  revoke(request: ApprovalRevocationRequest): ApprovalRevocationOutcome {
    this.enforceSegregation(request.actorUserId, request.segregation);
    return {
      status: "REVOKED",
      decidedAt: new Date(),
      auditAction: `${request.subjectType}.revoked`,
    };
  }

  /**
   * PW-002: evaluate a tenant-configured policy. Fail closed: when the rule
   * applies, every requirement must be satisfiable — an unknown creator with
   * a distinct-actor rule is a violation, never a silent pass.
   */
  evaluatePolicy(request: PolicyEvaluationRequest): void {
    const { policy } = request;
    if (!policy) return;
    if (request.amountCents < policy.thresholdCents) return;
    if (policy.requiredPermission && !request.actorPermissions.includes(policy.requiredPermission)) {
      throw new ApprovalPolicyViolationError(
        `Approval policy: this ${request.subjectLabel} requires the '${policy.requiredPermission}' permission at this amount`,
      );
    }
    if (policy.requireDistinctActor) {
      if (!request.subjectCreatedBy) {
        throw new ApprovalPolicyViolationError(
          `Approval policy: this ${request.subjectLabel} requires a second person, but its preparer cannot be established`,
        );
      }
      if (request.subjectCreatedBy === request.actorUserId) {
        throw new ApprovalPolicyViolationError(
          `Approval policy: a second person must approve this ${request.subjectLabel} at this amount`,
        );
      }
    }
  }
}
