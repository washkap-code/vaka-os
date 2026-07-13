# VAKA Security Principles

**Status:** Security standard
**Owner:** Engineering, Security, and Data Protection
**Last reviewed:** 2026-07-13

## 1. Security and privacy by design

Security, privacy, tenant isolation, auditability, reliability, and recovery are product requirements.

Apply them during discovery, design, implementation, testing, deployment, and operations.

## 2. Zero implicit trust

- Authenticate every protected request.
- Derive tenant and user context server-side.
- Authorise every operation.
- Validate every input.
- Treat clients, files, integrations, events, and AI content as untrusted.
- Use least privilege for users, services, database roles, and providers.

## 3. Tenant isolation

- Scope all tenant data paths.
- Validate related-resource ownership.
- Isolate caches, storage, search, events, logs, analytics, and AI.
- Test horizontal and indirect access.
- Consider PostgreSQL row-level security.
- Restrict and audit platform-admin access.
- Never expose tenant existence unnecessarily.

Tenant data leakage is a critical incident.

## 4. Identity and sessions

- Strong password hashing.
- Fail startup without production secrets.
- Short-lived sessions/tokens with secure renewal/revocation.
- Prefer secure, HttpOnly, SameSite cookies where architecture supports them.
- MFA for platform administration and sensitive roles.
- Email verification, password reset, invitations, and session management.
- Explicit tenant ownership and owner-only company-wide session/activity
  visibility; ordinary administrators do not inherit it automatically.
- Rate limiting and credential-stuffing controls.
- Audit login, failure, reset, MFA, and privileged session events.

Current implementation evidence (P9-008) includes non-enumerating,
single-use 30-minute password-reset links; session revocation after recovery;
optional authenticator TOTP with encrypted secrets and hash-only one-time
recovery codes; AAL2 enforcement for enrolled accounts; and user-controlled
session review/revocation. Email delivery still depends on an approved,
configured HTTPS provider. SSO, refresh-token rotation and risk-based step-up
remain future work.

## 5. Role-based access

- Server-side RBAC.
- Least-privileged seeded roles.
- Separate permissions for reading, writing, posting, approving, reversing, exporting, and administering.
- Segregation of duties for payroll, payments, permissions, and high-risk adjustments.
- Permission changes are audited.
- UI hiding never replaces authorisation.

Platform workforce access uses fixed, server-resolved platform roles rather
than the compatibility `is_platform_admin` marker alone. VAKA staff roles do
not create tenant membership or impersonation. Only the Principal
Administrator can create, alter, disable or reset another platform staff
identity; each such action is separately audited.

## 6. Data protection

- Classify data.
- Minimise collection.
- Encrypt in transit and at rest.
- Manage keys/secrets outside code.
- Redact logs and non-production datasets.
- Define retention and deletion.
- Restrict privileged access.
- Review cross-border processing.
- Support data export and lawful rights.
- Apply stricter controls to payroll/HR and authentication data.

## 7. Application security

- Parameterised database access.
- Output encoding and XSS prevention.
- CSRF protection appropriate to session design.
- Strict CORS allow-list.
- Content Security Policy.
- Secure headers.
- Request and file-size limits.
- File type/content validation and malware scanning.
- SSRF controls for remote URLs.
- Dependency and supply-chain scanning.
- Safe error handling.

## 8. Financial, stock, and payroll integrity

- Exact arithmetic.
- Atomic transactions.
- Append-only ledgers.
- Reversal instead of deletion.
- Idempotency.
- Approval for high-risk actions.
- Immutable issued numbers.
- Effective-dated rules.
- Audit reason and actor.
- Reconciliation and exception reporting.

## 9. Audit logging

Audit:

- permissions;
- authentication/security events;
- financial posting/reversal;
- payments;
- stock adjustment;
- payroll;
- exports;
- tenant lifecycle;
- settings;
- AI actions;
- privileged support/admin access; and
- integration credentials/configuration.

Protect logs from alteration and unnecessary sensitive content.

Company-wide activity views show material actions and security evidence rather
than keystrokes, message bodies, or indiscriminate page-view tracking. Owner
access, exports, and session revocations are themselves audited.

## 10. AI security

- Approved providers only.
- No secrets or unnecessary personal data in prompts.
- Tenant/permission-scoped tools.
- Prompt-injection controls.
- Bounded outputs and tools.
- Human confirmation for consequential action.
- Model/prompt/tool version audit.
- Rate/cost limits.
- Evaluation for leakage, unsafe actions, hallucination, and refusal.
- Core product remains available without AI.

## 11. Mobile and offline security

- Secure device storage.
- No sensitive tokens in ordinary local storage.
- Device/session revocation.
- Minimal offline data.
- Encryption where supported.
- Idempotent queued commands.
- Conflict detection.
- Remote logout and data expiry.
- Jailbreak/root risk policy.
- No authoritative rules exclusively on the client.

## 12. Integrations

- Per-provider least-privileged credentials.
- Secret rotation.
- Signed webhooks.
- Replay protection.
- Idempotent processing.
- Allow-listed destinations where practical.
- Timeouts and bounded retries.
- Provider outage handling.
- Data-processing review.

## 13. Backups and recovery

- Encrypted automated backups.
- Point-in-time recovery where possible.
- Separate failure domain.
- Strict access and audit.
- Defined RPO/RTO.
- Regular restoration tests.
- Incident and reconciliation procedures.
- Secure expiration/disposal.

## 14. Secure development lifecycle

- Threat model high-risk features.
- Security acceptance criteria.
- Peer review.
- automated tests/scans;
- dependency updates;
- secret scanning;
- staging verification;
- controlled deployment;
- vulnerability reporting and remediation targets; and
- penetration testing before major production milestones.

## 15. Incident response

Define:

- severity;
- ownership/on-call;
- containment;
- evidence preservation;
- tenant impact analysis;
- notification/legal review;
- recovery;
- reconciliation;
- post-incident review; and
- corrective actions.

## 16. Current priority risks

The codebase audit identifies immediate priorities:

- remove known JWT fallback secret behavior;
- restrict CORS;
- replace/harden browser token storage;
- add authentication abuse controls;
- close related-record tenant validation gaps;
- establish migration discipline;
- expand audit coverage; and
- add observability.

Address these incrementally before expanding sensitive modules.
