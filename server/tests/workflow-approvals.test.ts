// ============================================================================
// PW-001 TESTS — kernel ApprovalService semantics + procurement parity.
// The service owns outcome mapping, SoD enforcement and audit action naming;
// the existing procurement-lifecycle suite proves end-to-end parity.
// ============================================================================
import { describe, it, expect } from "vitest";
import { ApprovalPolicyViolationError, ApprovalService } from "../src/platform/workflow/approvals.js";
import { APPROVAL_SERVICE, buildPlatformKernel } from "../src/platform-runtime.js";

const service = new ApprovalService();

describe("ApprovalService.decide", () => {
  it("maps APPROVE and REJECT to canonical outcomes with a decision timestamp", () => {
    const before = Date.now();
    const approved = service.decide({
      subjectType: "purchase_requisition", decision: "APPROVE",
      actorUserId: "approver-1", segregation: [],
    });
    expect(approved.status).toBe("APPROVED");
    expect(approved.auditAction).toBe("purchase_requisition.approved");
    expect(approved.decidedAt.getTime()).toBeGreaterThanOrEqual(before);

    const rejected = service.decide({
      subjectType: "purchase_requisition", decision: "REJECT",
      actorUserId: "approver-1", segregation: [],
    });
    expect(rejected.status).toBe("REJECTED");
    expect(rejected.auditAction).toBe("purchase_requisition.rejected");
  });

  it("enforces segregation of duties with the domain's exact message", () => {
    expect(() => service.decide({
      subjectType: "purchase_order", decision: "APPROVE", actorUserId: "creator-1",
      segregation: [{
        excludedUserId: "creator-1",
        message: "A purchase-order creator cannot approve their own purchase order",
      }],
    })).toThrow(ApprovalPolicyViolationError);
    expect(() => service.decide({
      subjectType: "purchase_order", decision: "APPROVE", actorUserId: "creator-1",
      segregation: [{ excludedUserId: "creator-1", message: "exact message preserved" }],
    })).toThrow("exact message preserved");
  });

  it("reports the FIRST violated rule when several apply", () => {
    expect(() => service.decide({
      subjectType: "purchase_order", decision: "APPROVE", actorUserId: "user-1",
      segregation: [
        { excludedUserId: "someone-else", message: "not this one" },
        { excludedUserId: "user-1", message: "first violation" },
        { excludedUserId: "user-1", message: "second violation" },
      ],
    })).toThrow("first violation");
  });

  it("skips null/undefined exclusions (legacy rows without lineage)", () => {
    const outcome = service.decide({
      subjectType: "purchase_order", decision: "APPROVE", actorUserId: "user-1",
      segregation: [
        { excludedUserId: null, message: "never thrown" },
        { excludedUserId: undefined, message: "never thrown" },
      ],
    });
    expect(outcome.status).toBe("APPROVED");
  });

  it("is registered in the platform kernel", () => {
    const kernel = buildPlatformKernel();
    const resolved = kernel.container.get(APPROVAL_SERVICE);
    expect(resolved).toBeInstanceOf(ApprovalService);
    expect(resolved.decide({
      subjectType: "expense_claim", decision: "APPROVE", actorUserId: "u1", segregation: [],
    }).auditAction).toBe("expense_claim.approved");
  });
});
