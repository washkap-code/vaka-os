export type DefinitionState = "accepted" | "captured";
export type ImplementationState = "not-implemented" | "partial" | "implemented";
export type VerificationState = "not-run" | "blocked-or-failed" | "passed";
export type AvailabilityState = "planned" | "internal" | "preview" | "pilot" | "GA";
export type OperationsEvidenceState = "not-recorded" | "recorded" | "requires-review";

export type PlatformCapabilityStatus = {
  id: string;
  group: "Frozen product" | "Platform Kernel service";
  name: string;
  definition: DefinitionState;
  implementation: ImplementationState;
  verification: VerificationState;
  verificationScope: string;
  availability: AvailabilityState;
  currentEvidence: string;
  nextGate: string;
};

export type OperationsEvidenceGate = {
  id: string;
  category: "Backup" | "Restore" | "Disaster recovery" | "Operations";
  name: string;
  state: OperationsEvidenceState;
  evidence: string;
  owner: string;
  nextGate: string;
};

export type BackupManifestField = {
  key: string;
  label: string;
  required: boolean;
  classification: "public-evidence" | "internal-evidence" | "sensitive-reference";
  rule: string;
};

export type BackupManifestContract = {
  status: "defined-not-implemented";
  version: "2026-07-12.ops-012";
  purpose: string;
  forbiddenContent: string[];
  fields: BackupManifestField[];
  acceptanceRules: string[];
};

const product = (
  id: string,
  name: string,
  implementation: ImplementationState,
  availability: AvailabilityState,
  currentEvidence: string,
  nextGate: string,
  verification: VerificationState = "not-run",
  verificationScope = "No product-level release verification recorded.",
): PlatformCapabilityStatus => ({
  id,
  group: "Frozen product",
  name,
  definition: "accepted",
  implementation,
  verification,
  verificationScope,
  availability,
  currentEvidence,
  nextGate,
});

const kernel = (
  id: string,
  name: string,
  implementation: ImplementationState,
  currentEvidence: string,
  nextGate: string,
  verification: VerificationState = "not-run",
  verificationScope = "No service-level verification recorded.",
): PlatformCapabilityStatus => ({
  id,
  group: "Platform Kernel service",
  name,
  definition: "accepted",
  implementation,
  verification,
  verificationScope,
  availability: implementation === "not-implemented" ? "planned" : "internal",
  currentEvidence,
  nextGate,
});

export const CONTROL_CENTER_CATALOGUE: readonly PlatformCapabilityStatus[] = [
  product(
    "product.vaka-os",
    "VAKA OS",
    "partial",
    "internal",
    "Tenant ERP web foundation, platform administration and governed product blueprint exist.",
    "Complete the Zimbabwe launch-critical mission set and every release gate.",
  ),
  product(
    "product.vaka-platform",
    "VAKA Platform",
    "partial",
    "internal",
    "Typed Platform Kernel contracts, composition root and selected adapters exist.",
    "Migrate approved call sites and complete shared services with integration evidence.",
  ),
  product(
    "product.vaka-erp",
    "VAKA ERP",
    "partial",
    "internal",
    "CRM, sales, accounting, inventory, billing and import foundations exist; the full ERP catalogue does not.",
    "Close the finance, procurement, inventory, workforce, projects and operations acceptance matrices.",
  ),
  product(
    "product.vaka-intelligence",
    "VAKA Intelligence",
    "partial",
    "internal",
    "A bounded read-model and evaluation foundation exist; there is no general live model/action layer.",
    "Approve AI context/tool boundaries, provider controls, evaluations and failure operations.",
  ),
  product("product.vaka-network", "VAKA Network", "not-implemented", "planned", "Target architecture and mission catalogue only.", "Approve and execute Network foundation missions."),
  product("product.vaka-verify", "VAKA Verify", "not-implemented", "planned", "Target architecture and mission catalogue only.", "Complete identity, consent, source-quality and professional review design before implementation."),
  product("product.vaka-capital", "VAKA Capital", "not-implemented", "planned", "Target architecture and mission catalogue only.", "Approve regulated-introduction boundaries and market-specific professional review."),
  product("product.vaka-mail", "VAKA Mail", "not-implemented", "planned", "Communication and delivery specifications exist; a mailbox product is not implemented.", "Complete notification providers, consent, deliverability and mailbox mission packs."),
  product("product.vaka-black-book", "VAKA Black Book", "not-implemented", "planned", "Target architecture and mission catalogue only.", "Approve source governance, correction, trust and safety missions."),
  product("product.vaka-studio", "VAKA Studio", "not-implemented", "planned", "Frozen product boundary and target catalogue only.", "Complete metadata, workflow, rules, policy and extension safety foundations."),
  product(
    "product.platform-kernel",
    "Platform Kernel",
    "partial",
    "internal",
    "Dependency injection, typed service contracts, identity/audit adapters and localisation composition exist.",
    "Complete service adapters, call-site migrations and architecture enforcement.",
    "passed",
    "Focused kernel and adapter tests passed; the full database-backed suite remains an independent gate.",
  ),
  kernel(
    "kernel.identity",
    "Identity",
    "partial",
    "Tenant authentication, RBAC and server sessions exist behind a typed identity adapter; MFA, SSO and refresh rotation remain open.",
    "Complete identity hardening, exhaustive route coverage and security assurance.",
    "passed",
    "Focused identity adapter and tenant-context tests passed.",
  ),
  kernel(
    "kernel.metadata",
    "Metadata",
    "partial",
    "Typed registry contract and in-process foundation exist; it does not yet drive all product behaviour.",
    "Seed canonical objects and prove authorised runtime consumption.",
    "passed",
    "Focused Platform Kernel metadata tests passed.",
  ),
  kernel(
    "kernel.workflow",
    "Workflow",
    "partial",
    "Typed workflow foundation exists; a configurable enterprise workflow runtime and designer do not.",
    "Implement persistence, authorisation, escalation, observability and safe configuration.",
    "passed",
    "Focused Platform Kernel workflow tests passed.",
  ),
  kernel("kernel.rules", "Rules", "not-implemented", "No governed shared rules engine is wired into product call sites.", "Approve expression safety, versioning, testing and domain-ownership contracts."),
  kernel("kernel.policy", "Policy", "not-implemented", "No governed shared policy engine is wired into product call sites.", "Approve policy decision contracts, fail-closed behaviour, evidence and administration."),
  kernel(
    "kernel.event-bus",
    "Event Bus",
    "partial",
    "Typed in-process event foundation exists; durable outbox, replay and dead-letter operations are not complete.",
    "Implement post-commit delivery without weakening atomic finance or stock invariants.",
    "passed",
    "Focused in-process event contract tests passed.",
  ),
  kernel(
    "kernel.documents",
    "Documents",
    "partial",
    "Invoice snapshots/PDFs, secure share links and capture evidence exist; a unified governed document service does not.",
    "Unify storage, malware controls, versioning, retention, search and recovery.",
    "passed",
    "Focused Platform Kernel document tests and bounded feature tests passed; service-wide verification is open.",
  ),
  kernel(
    "kernel.search",
    "Search",
    "partial",
    "Typed search contract exists; no complete tenant-scoped enterprise index is available.",
    "Implement authorised indexing, deletion, reconciliation, performance and operations.",
    "passed",
    "Focused Platform Kernel search contract tests passed.",
  ),
  kernel(
    "kernel.ai-context",
    "AI Context",
    "partial",
    "A permission-aware business-summary read model and evaluation foundation exist; general context/tool governance does not.",
    "Implement provider boundary, minimisation, provenance, evaluations and safe failure.",
    "passed",
    "Focused business-summary contract/evaluation tests passed; live AI is not asserted.",
  ),
  kernel(
    "kernel.notifications",
    "Notifications",
    "partial",
    "Typed notification contract and product-specific notices exist; provider delivery and operational assurance are not complete.",
    "Implement consent-aware providers, retries, idempotency, delivery evidence and failover.",
    "passed",
    "Focused Platform Kernel notification tests passed.",
  ),
  kernel(
    "kernel.security",
    "Security",
    "partial",
    "Tenant/RBAC controls and selected transport/session protections exist; complete assurance, MFA, scanning and penetration evidence do not.",
    "Close the security programme and obtain required independent assurance.",
  ),
  kernel(
    "kernel.engineering-process",
    "Engineering Process",
    "partial",
    "Mission Packs, ADRs, coding standards and quality-gate definitions exist; several automated gates and release proofs remain open.",
    "Automate and evidence every required CI, security, release and operational gate.",
  ),
];

export const OPERATIONS_EVIDENCE_GATES: readonly OperationsEvidenceGate[] = [
  {
    id: "ops.backup-policy",
    category: "Backup",
    name: "Backup policy and retention",
    state: "not-recorded",
    evidence: "No approved backup policy, retention matrix or storage segregation evidence is recorded in this repository.",
    owner: "Platform Operations",
    nextGate: "Approve backup policy, retention schedule, encryption requirements and tenant export obligations.",
  },
  {
    id: "ops.backup-execution",
    category: "Backup",
    name: "Automated backup execution",
    state: "not-recorded",
    evidence: "No scheduled backup job, backup manifest or success/failure event stream is wired into the control centre.",
    owner: "Platform Engineering",
    nextGate: "Implement observable backup jobs and record signed backup manifests.",
  },
  {
    id: "ops.restore-test",
    category: "Restore",
    name: "Restore test evidence",
    state: "not-recorded",
    evidence: "No successful restore drill, sampled tenant recovery or checksum reconciliation is recorded.",
    owner: "Platform Operations",
    nextGate: "Run a controlled restore test and attach recovery time, integrity and approval evidence.",
  },
  {
    id: "ops.rpo-rto",
    category: "Disaster recovery",
    name: "RPO/RTO acceptance",
    state: "requires-review",
    evidence: "Recovery point and recovery time objectives are programme requirements, not yet accepted production evidence.",
    owner: "Executive Sponsor",
    nextGate: "Approve market-appropriate RPO/RTO targets and prove them through restore drills.",
  },
  {
    id: "ops.dr-runbook",
    category: "Disaster recovery",
    name: "Disaster recovery runbook",
    state: "not-recorded",
    evidence: "No operator-ready DR runbook, escalation tree or rollback/communications script is linked to a release gate.",
    owner: "Platform Operations",
    nextGate: "Publish a tested runbook with roles, decision rights, customer communications and rollback paths.",
  },
  {
    id: "ops.launch-signoff",
    category: "Operations",
    name: "Operational launch sign-off",
    state: "requires-review",
    evidence: "OPS-010 gives visibility, but backup, restore, DR and incident gates remain open before launch readiness.",
    owner: "Programme Office",
    nextGate: "Collect evidence for every operations gate and record an accountable launch decision.",
  },
];

export const BACKUP_MANIFEST_CONTRACT: BackupManifestContract = {
  status: "defined-not-implemented",
  version: "2026-07-12.ops-012",
  purpose: "Defines the evidence a future backup job must emit before VAKA can claim backup execution proof.",
  forbiddenContent: [
    "database passwords",
    "access tokens",
    "private keys",
    "full storage URLs with credentials",
    "tenant business payloads",
  ],
  fields: [
    {
      key: "manifestId",
      label: "Manifest ID",
      required: true,
      classification: "public-evidence",
      rule: "Stable unique identifier for one backup attempt.",
    },
    {
      key: "environment",
      label: "Environment",
      required: true,
      classification: "internal-evidence",
      rule: "Controlled environment label such as staging or production; never a secret endpoint.",
    },
    {
      key: "startedAt",
      label: "Started at",
      required: true,
      classification: "public-evidence",
      rule: "UTC timestamp when backup execution started.",
    },
    {
      key: "completedAt",
      label: "Completed at",
      required: true,
      classification: "public-evidence",
      rule: "UTC timestamp when backup execution ended; must be after startedAt.",
    },
    {
      key: "status",
      label: "Status",
      required: true,
      classification: "public-evidence",
      rule: "One of succeeded, failed or partial. Partial is not launch-ready evidence.",
    },
    {
      key: "databaseSnapshotRef",
      label: "Database snapshot reference",
      required: true,
      classification: "sensitive-reference",
      rule: "Opaque non-secret reference to the database snapshot or backup set.",
    },
    {
      key: "objectSnapshotRef",
      label: "Object snapshot reference",
      required: false,
      classification: "sensitive-reference",
      rule: "Opaque non-secret reference to document/object evidence where applicable.",
    },
    {
      key: "checksum",
      label: "Checksum",
      required: true,
      classification: "internal-evidence",
      rule: "Algorithm and digest used for integrity verification; must not include payload contents.",
    },
    {
      key: "encryptionRef",
      label: "Encryption reference",
      required: true,
      classification: "sensitive-reference",
      rule: "Opaque reference to the approved encryption key or policy; never the key material.",
    },
    {
      key: "retentionExpiresAt",
      label: "Retention expires at",
      required: true,
      classification: "internal-evidence",
      rule: "UTC timestamp aligned to the approved retention policy.",
    },
    {
      key: "operator",
      label: "Operator",
      required: true,
      classification: "internal-evidence",
      rule: "Service identity or authorised operator that initiated the backup.",
    },
    {
      key: "failureReason",
      label: "Failure reason",
      required: false,
      classification: "internal-evidence",
      rule: "Required when status is failed or partial; must be safe for platform-admin review.",
    },
  ],
  acceptanceRules: [
    "A manifest proves only that a backup job reported evidence; restore testing remains separate.",
    "Successful backup evidence requires status succeeded, complete required fields and no forbidden content.",
    "Backup manifests must be immutable after recording; corrections require a superseding manifest.",
    "Launch readiness requires backup manifests plus restore drill evidence and accountable sign-off.",
  ],
};

export type ControlCenterSignals = {
  databaseObservedAt: string;
  activeSessions: number;
  auditEvents24h: number;
  pastDueTenants: number;
  suspendedTenants: number;
};

export function buildControlCenterSnapshot(signals: ControlCenterSignals) {
  const evidenceSummary = OPERATIONS_EVIDENCE_GATES.reduce((acc, gate) => {
    acc[gate.state] += 1;
    return acc;
  }, {
    "not-recorded": 0,
    recorded: 0,
    "requires-review": 0,
  } as Record<OperationsEvidenceState, number>);

  return {
    generatedAt: new Date().toISOString(),
    architecture: {
      status: "ACTIVE" as const,
      effectiveOn: "2026-07-11",
      blueprintEdition: "1.0",
      changeControl: "Frozen boundaries require an accepted Architecture Decision Record.",
    },
    runtime: {
      api: { status: "operational" as const, scope: "This authenticated API request completed." },
      database: { status: "operational" as const, observedAt: signals.databaseObservedAt },
    },
    signals: {
      activeSessions: signals.activeSessions,
      auditEvents24h: signals.auditEvents24h,
      pastDueTenants: signals.pastDueTenants,
      suspendedTenants: signals.suspendedTenants,
    },
    catalogue: CONTROL_CENTER_CATALOGUE,
    operationsEvidence: {
      summary: evidenceSummary,
      gates: OPERATIONS_EVIDENCE_GATES,
    },
    backupManifest: BACKUP_MANIFEST_CONTRACT,
    limitations: [
      "Operational counts are signals, not proof that backup, recovery, security, performance or launch gates have passed.",
      "Entries marked planned or not implemented are unavailable and must not be sold or represented as live.",
      "The control centre does not expose secrets, impersonate tenant users or provide unrestricted business-record access.",
      "Legal, tax, accounting, privacy, security and country readiness still require their recorded qualified reviews.",
    ],
  };
}
