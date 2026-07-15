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

/** Raised when a segregation-of-duties rule blocks the actor. Maps to 409 at the API boundary. */
export class ApprovalPolicyViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApprovalPolicyViolationError";
  }
}

export class ApprovalService {
  /**
   * Validate segregation-of-duties and produce the canonical outcome.
   * Throws ApprovalPolicyViolationError with the first violated rule's
   * domain message; performs no I/O.
   */
  decide(request: ApprovalDecisionRequest): ApprovalDecisionOutcome {
    for (const rule of request.segregation) {
      if (rule.excludedUserId && rule.excludedUserId === request.actorUserId) {
        throw new ApprovalPolicyViolationError(rule.message);
      }
    }
    const status = request.decision === "APPROVE" ? "APPROVED" : "REJECTED";
    return {
      status,
      decidedAt: new Date(),
      auditAction: `${request.subjectType}.${status === "APPROVED" ? "approved" : "rejected"}`,
    };
  }
}
