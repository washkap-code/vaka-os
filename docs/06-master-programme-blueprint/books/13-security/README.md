# Book Thirteen - Security, Privacy and Assurance

**Version:** 1.0  
**Definition:** Accepted target control system  
**Certification:** None claimed by this book

## 1. Security outcomes

VAKA protects confidentiality, integrity, availability, privacy, tenant isolation and accountable action across identities, applications, APIs, databases, files, caches, search, events, jobs, integrations, AI, backups and operations. Controls follow least privilege, defense in depth, secure defaults, explicit trust boundaries and safe failure.

## 2. Secure development lifecycle

Every capability passes security/privacy requirements, data-flow and threat modelling, secure design, implementation controls, code/dependency/secret/static analysis, verification/abuse testing, release review, staged deployment, monitoring, incident response and lessons learned. Training and vulnerability response continue throughout the lifecycle.

## 3. Tenant and identity security

- derive user, tenant, platform role, session and permission from verified server context;
- scope every direct/indirect read and write, including files, exports, cache, search, events, jobs, AI and logs;
- fail safely without revealing another tenant’s record existence;
- protect authentication from enumeration, brute force, credential stuffing, fixation and token theft;
- rotate/revoke sessions and credentials; add MFA/step-up for high risk;
- audit identity, permission, impersonation/support and platform-admin activity;
- never let platform-admin status implicitly create tenant scope;
- use explicit, revocable relationship grants for portals and professionals.

## 4. Application and API security

Boundary validation, typed contracts, safe errors, authorization per operation, idempotency, concurrency control, secure headers/CORS, CSRF controls appropriate to auth mode, rate/abuse limits, payload/file limits, SSRF/path/traversal/injection defenses, output encoding, content security policy, webhook signatures and secure deprecation are mandatory as applicable.

## 5. Data protection and privacy

Inventory and classify personal, financial, authentication, employee, document, communication, AI and commercially sensitive data. Minimize purpose and collection; encrypt in transit and at rest; isolate secrets; redact logs/errors/prompts; control retention/legal holds/deletion/export; manage processor/provider and cross-border risks; support rights and incidents; and document lawful/contractual bases with qualified review.

## 6. Infrastructure and supply chain

Environment isolation, least-privileged service/database accounts, secret management/rotation, hardened images/runtimes, versioned infrastructure, dependency pinning/scanning, SBOM, artifact provenance/signing where adopted, protected branches, CI permissions, backup isolation, patching, vulnerability SLAs, network controls and capacity/DoS protections are required by risk.

## 7. AI security

Treat retrieved content and messages as untrusted data. Prevent instruction escalation, cross-tenant retrieval, secret/personal-data disclosure, unsafe tool calls, model-output trust, provider logging surprises and cost abuse. Policy and deterministic validation live outside the model. Tool authority is narrower than user authority and bound to the exact confirmed preview.

## 8. Threat and abuse programme

Maintain threat models for identity, tenancy, finance, stock, files/OCR, portals, integrations/webhooks, communications, Network/Verify/Capital, AI and Super Admin. Record assets, actors, trust boundaries, data flows, threats, mitigations, owners, residual risk, validation and review triggers. Include insider/support misuse, fraud, social engineering, denial, supply-chain compromise and business-logic abuse.

## 9. Detection, response and recovery

Security logs are structured, correlated, protected and minimized. Alerts route to an owned response. Incident procedures cover triage, containment, evidence, tenant/customer/regulator communication, eradication, recovery, reconciliation, post-incident review and remediation missions. Backups are proven only through restore tests.

## 10. Assurance gates

Required evidence can include code/security review, SAST/dependency/secret scanning, DAST, penetration test, tenant-isolation fuzzing, access review, provider assessment, restore/DR drill, privacy assessment, professional counsel, and production observation. Critical/high findings block release unless formally accepted by the authorized owner with time-limited remediation; tenant leakage and permission bypass are no-go.

“Secure”, “compliant” and “certified” are prohibited marketing/status claims without a named scope, standard, assessor, version, evidence and validity period.
