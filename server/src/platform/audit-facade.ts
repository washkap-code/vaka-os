// ============================================================================
// AUDIT FACADE (Mission P1-003) — the adoption seam for the Platform Kernel.
//
// Modules that want to record audit through the kernel call `recordAudit()`
// instead of importing the legacy `audit()` helper. Row shape is guaranteed
// identical to the legacy path (proven by P1-002 parity tests); this facade
// simply resolves AUDIT_SERVICE from the process-wide kernel.
//
// Existing modules are migrated one at a time in later missions. Nothing here
// changes current behaviour.
// ============================================================================
import { AUDIT_SERVICE, platformKernel } from "../platform-runtime.js";
import type { AuditEvent } from "./audit/types.js";

/** Record an audit event through the Platform Kernel's AuditService. */
export async function recordAudit(event: AuditEvent): Promise<void> {
  await platformKernel().container.get(AUDIT_SERVICE).record(event);
}
