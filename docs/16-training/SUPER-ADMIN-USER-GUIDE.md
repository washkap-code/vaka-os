# VAKA OS Super Admin User Guide

Edition 1.0 · Effective 2026-07-11 · Audience: authorised VAKA platform administrators

This guide explains the Platform Administration console that is available when an authorised VAKA staff account signs in without a tenant workspace. It describes the current console and its controls. It is not evidence that every VAKA product, platform service, country pack, integration or launch gate is implemented.

## 1. Your responsibility

Super Admin access is a high-trust operational role. Use it to monitor the platform, review aggregate commercial and operating signals, support tenant lifecycle decisions, inspect material audit evidence, and execute only approved platform operations.

- Protect the administrator account and use a unique password.
- Work from an approved device and network.
- Open only the minimum tenant evidence needed for a defined support or assurance purpose.
- Never copy secrets, passwords, tokens, unnecessary personal data or routine tenant business records into tickets, chat or AI tools.
- Record and escalate incidents, suspected tenant leakage, unexpected financial effects and security concerns immediately.
- Never use a platform role to manufacture a tenant identity or bypass tenant permissions.

## 2. Authority and change control

The VAKA Architecture Freeze is Active from 2026-07-11. Frozen product names, Platform Kernel boundaries and Knowledge System delivery controls change only through an accepted Architecture Decision Record.

If instructions conflict, stop and use the authority chain recorded in ADR-001: leadership instruction, Constitution and accepted ADRs, authoritative domain architecture, approved PRD/Mission Pack, coding and operating standards, then supporting guidance. A user guide cannot override product invariants.

The delivery chain is ChatGPT to Knowledge System to Mission Packs to Codex to GitHub to Testing to Release. Code in a branch or on the main branch is not automatically released or generally available.

## 3. Signing in and out

1. Open the VAKA OS sign-in screen.
2. Enter the authorised platform-administrator email and password without a tenant subdomain.
3. Complete a required temporary-password change before continuing.
4. Confirm that the page title is Platform administration and that no tenant workspace is shown.
5. Sign out from the lower-left navigation when work is complete.

If a tenant workspace appears, sign out and report the identity/context mismatch. Do not perform platform operations from a tenant-scoped session.

## 4. Console navigation

The console has four working areas.

- Overview shows aggregate tenant, user, billing, growth and audit-event signals.
- Tenants lists client workspaces and allows authorised review of their recent material audit events.
- Operations shows runtime observations, the Architecture Freeze and the status of every frozen product and Platform Kernel service.
- User Guide provides this searchable guide and a Markdown download.

Every status is evidence-sensitive. Definition, implementation, verification and availability are separate. Partial implementation is not completion; focused tests are not a production release; planned means unavailable.

## 5. Start-of-day control cycle

1. Open Operations and confirm that the API request and database observation completed.
2. Review active sessions, audit events in the last 24 hours, past-due tenants and suspended tenants.
3. Open Overview and compare tenant lifecycle totals, subscription billing and unusual activity with the previous operating period.
4. Review new or changing past-due and suspended tenants before customer contact.
5. Check active incidents, failed deployments, backup/restore evidence and security alerts in the approved operational systems.
6. Record anomalies with time, affected scope, observed evidence, owner and next action.

The runtime cards are signals only. They do not prove availability, backup recoverability, security, performance, compliance or release readiness.

## 6. Overview metrics

Overview contains privacy-minimised aggregates rather than routine tenant records.

- Total tenants is the number of tenant workspaces known to the platform.
- Trial, Active, Past due and Suspended reflect stored tenant lifecycle state.
- Registered users counts tenant users; Signed-in users counts unrevoked server sessions that have not exceeded idle or absolute expiry.
- Issued business invoices and Outstanding business invoices are cross-platform counts and must not be treated as revenue.
- Plan mix groups subscriptions by package.
- Tenant growth groups creation by month for the recent reporting window.
- Subscription billing groups subscription invoices by status and currency; currencies are never combined into one amount.
- Top activity shows material audit-event counts for the last 30 days, not every user click.

Investigate abrupt changes. Do not infer cause from a count alone; verify the event, time window, deployment history and affected tenant before acting.

## 7. Running the monthly billing cycle

Run monthly billing now is a consequential platform action. The console asks for confirmation before sending the request.

Before confirming:

- Verify that the billing date and approved operating window are correct.
- Confirm that the current release and database are healthy.
- Check that no billing incident, migration or maintenance freeze is active.
- Confirm that plan, subscription and currency configuration has passed the applicable review.
- Ensure an operator is available to review the result and exceptions.

After the run:

- Read the returned summary and retain the approved evidence.
- Refresh Overview and inspect subscription-billing status by currency.
- Investigate exceptions before attempting another run.
- Do not repeatedly rerun billing to correct a result. Determine idempotency and root cause first.
- Never alter tenant business invoices or posted finance history to correct subscription billing.

If the request fails or the result is uncertain, stop, record the exact time and message, and escalate to Engineering and Finance Operations. Do not assume that a timed-out request made no changes.

## 8. Reviewing tenants

The Tenants area shows company name, subdomain, lifecycle status, subscription plan, user count, trial end and creation date.

Use Review audit only when there is a defined support, security, billing or assurance need. The review pane shows recent material actions, entity type, entity identifier and time. Treat entity identifiers as tenant-confidential even when no business payload is displayed.

- Confirm the tenant ID and company before reviewing evidence.
- Use action and timestamp to narrow the investigation.
- Do not infer user intent from an audit action alone.
- Do not disclose one tenant's events to another tenant.
- Close the review when finished.

The current console does not provide impersonation, unrestricted tenant record search, automatic lifecycle mutation or deletion. Those are deliberate safety boundaries, not missing shortcuts.

## 9. Operations control centre

The Operations area reports an authenticated API observation and a database timestamp. A green observation means that this request completed; it is not an uptime guarantee or substitute for monitoring.

The capability register contains every frozen product and Platform Kernel service. Read its columns independently.

- Definition accepted means the boundary is governed; it does not mean code exists.
- Implementation not implemented, partial or implemented describes the accepted scope in code/configuration.
- Verification not run, blocked or failed, or passed describes recorded evidence and must be read with Verification scope.
- Availability planned, internal, preview, pilot or GA is a product/release decision.
- Current evidence states what exists now.
- Next gate states what must happen before status can advance.

Never change a status to satisfy a date or sales request. Status advances only with traceable evidence and the accountable approval.

## 10. Architecture Freeze administration

When a proposed change affects a frozen product, service boundary, data authority, Knowledge System component or delivery chain:

1. Record the problem and evidence without implementing the architectural change.
2. Identify affected products, tenants, data, permissions, integrations, migrations and rollback paths.
3. Draft an ADR with options, consequences, compatibility and migration evidence.
4. Obtain the required accountable approvals.
5. Update the Freeze Register, relevant architecture, mission dependencies and acceptance criteria.
6. Implement only through an approved Mission Pack.

Emergency pressure does not silently amend the architecture. A hotfix may preserve service while a controlled ADR handles any lasting change.

## 11. Tenant lifecycle and non-payment

VAKA preserves suspend-then-escrow behaviour. Non-payment must never delete client data.

- Trial, Active, Past due and Suspended states remain server-authoritative.
- A suspended tenant retains the allowed read, billing and export access defined by policy.
- Financial and stock history remains immutable.
- Lifecycle changes require an approved reason, permission and audit evidence.
- Customer communication must state what is restricted, what remains available and how to resolve the issue.

The current Super Admin interface does not expose manual suspend, restore or delete buttons. Use only approved server workflows and do not manipulate the database directly.

## 12. Audit and privacy

Audit is evidence for material and sensitive activity, not a surveillance feed.

- Preserve tenant ID, actor, action, entity, timestamp and minimum necessary metadata.
- Do not place passwords, tokens, full documents or unnecessary personal data in audit metadata.
- Posted journals and stock movements remain append-only; corrections use approved reversal or offsetting paths.
- Export or disclose audit data only for an authorised purpose and through an approved secure channel.
- Treat a missing expected audit event as a product/control defect.

Platform-wide counts may help find anomalies, but an investigation must preserve chain of custody and tenant boundaries.

## 13. Incident response

For suspected security, privacy, tenant-isolation, financial-integrity, data-loss or availability incidents:

1. Record detection time, reporter, affected environment and observable symptoms.
2. Classify severity using the approved incident process.
3. Preserve logs and evidence; do not edit source records.
4. Contain through approved reversible controls without deleting client data.
5. Notify the incident owner and required Security, Privacy, Finance or Operations roles.
6. Communicate confirmed facts, uncertainty and next update time.
7. Recover through tested procedures and verify tenant, finance, stock and audit integrity.
8. Complete a blameless review, corrective missions and evidence updates.

Never paste secrets or broad tenant exports into an incident chat. Never let AI make an unconfirmed containment or financial decision.

## 14. Change, deployment and rollback

Every material change starts with an approved requirement and Mission Pack, uses a focused branch/review, updates tests and documentation, and records completion evidence.

Before deployment, verify applicable typecheck, build, unit, integration, tenant isolation, permission, finance, inventory, localisation, mobile, accessibility, security, performance and recovery gates. Record skipped or blocked checks exactly.

After deployment, verify health, error rates, key customer journeys, audit evidence and data invariants. Roll back or contain when acceptance fails. A rollback must preserve immutable financial, stock, numbering and audit history.

## 15. Backup and disaster recovery

Do not report backup or disaster-recovery readiness from a configured job alone. Required evidence includes successful backup, protected storage, retention, restore into an isolated environment, integrity checks, measured recovery time and recovery point, accountable sign-off and remediation of failures.

The Super Admin runtime card does not perform a restore test. Review the approved backup/DR evidence and scheduled drill results separately.

The Operations evidence table lists the minimum launch gates that must be proved before backup/DR readiness can be claimed:

- Backup policy and retention: approved retention, encryption, segregation and tenant-export rules.
- Automated backup execution: observable jobs, failure reporting and signed backup manifests.
- Restore test evidence: isolated restore, integrity checks, measured recovery time and accountable sign-off.
- RPO/RTO acceptance: approved recovery targets that have been proved through drills.
- Disaster recovery runbook: roles, escalation, rollback, communications and decision rights.
- Operational launch sign-off: accountable approval only after the required evidence is present.

A missing or review-required evidence gate is a blocker, not a cosmetic warning.

## 16. Finance, tax and currency controls

Book Eight, VAKA Finance & Accounting Intelligence Architecture, is authoritative for accounting, ledger, tax, currency, reporting and finance AI.

- No posted financial transaction is edited in place.
- Corrections use reversal, credit/debit note, correcting journal or controlled adjustment.
- Every posted journal balances exactly.
- Operational modules do not write ledger tables directly.
- AI never posts directly or supplies a deterministic accounting value.
- Tax and currency rules are effective-dated configuration, not hard-coded assumptions.
- Currency amounts are not combined without an approved exchange-rate basis and snapshot.

Country-pack configuration and documents are not professional tax approval. Zimbabwe market release still requires recorded qualified review.

## 17. AI authority boundary

VAKA AI must use only the current user's authorised tenant data, distinguish facts from calculations/inferences/recommendations, state uncertainty, require confirmation for consequential actions and fail safely when context, tools or models are unavailable.

Platform administrators must never send secrets, unnecessary personal data, cross-tenant content or uncontrolled exports to an AI provider. Planned AI capability in the register is not a live assistant.

## 18. Country, language and localisation readiness

Zimbabwe is the first launch market, not a hard-coded platform limit. Country rules belong in approved country packs and provider adapters.

English, Shona and Ndebele are required target languages. The current repository does not yet contain a complete three-language runtime framework. New copy is centralised for translation, and no operator should claim full language readiness until native review, layout testing, document testing and release evidence pass.

## 19. Commercial and launch readiness

A commercial package is ready only when entitlements, pricing, billing, lifecycle, support, contracts, data protection, migration, training and operational evidence agree. A capability must not be sold as live because it appears in the blueprint.

A launch gate closes only with named evidence, accountable sign-off, known-risk disposition and rollback/containment readiness. Legal, tax, accounting, privacy, security and localisation review may require qualified external professionals in each market.

## 20. Troubleshooting

### The console will not load

- Confirm network access and that the API service is reachable.
- Sign out and sign in again; do not reuse or share a token.
- Record the browser time, visible message and affected tab.
- Check approved service monitoring and deployment history.
- Escalate if the database observation or several platform endpoints fail.

### Counts look wrong

- Confirm the reporting window, timezone, lifecycle definition and currency grouping.
- Compare the count with an authorised source query or audit event sample.
- Check recent deployments, migrations and delayed jobs.
- Do not correct aggregates by editing source business data.

### Billing result is uncertain

- Do not immediately rerun the cycle.
- Record the request time and response/error.
- Check subscription invoices and billing audit evidence.
- Escalate to Engineering and Finance Operations for idempotency/root-cause review.

### A capability status appears overstated

- Preserve the current display as evidence.
- Compare it with the capability register, Mission Pack, completion report, test evidence and release decision.
- Correct the governing status source through an approved documentation/change mission.

## 21. Known current limitations

The initial control centre is a governed foundation, not the final enterprise operations suite.

- No complete MFA, SSO or refresh-token rotation.
- No platform-admin impersonation or unrestricted business-record search.
- No full three-language runtime.
- No native encrypted offline application or complete offline sync.
- No general production AI model/action layer.
- No complete provider-backed email, SMS or WhatsApp operations layer.
- No automatic backup/restore drill in this console.
- No complete workflow, rules, policy, search, metadata or document-administration suite.
- No product-level proof that every Microsoft/SAP benchmark dimension is met.
- Some full database-backed tests require a correctly provisioned isolated test database before their evidence can pass.

These gaps are tracked in the blueprint and mission catalogue. Do not conceal them; use them to sequence the next controlled missions.

## 22. End-of-day checklist

- Review unresolved past-due, suspended, security and billing exceptions.
- Confirm every consequential action has its expected audit evidence.
- Update incident, risk, dependency and decision records.
- Preserve deployment, test and professional-review evidence.
- Assign an owner and next action to every open critical item.
- Sign out of the Super Admin session.

## 23. Escalation and prohibited shortcuts

Stop and escalate when authority is unclear, tenant boundaries may have failed, money/stock history may be inconsistent, a release gate lacks evidence, professional approval is required, or an action needs new permissions.

Never work around a control by editing production tables, sharing credentials, changing a planned status to live, deleting audit/financial/stock history, disabling tenant isolation, bypassing confirmation, or treating AI output as approval.

## 24. Glossary

- Architecture Freeze: governed product and service boundaries that require an accepted ADR to change.
- Mission Pack: the approved, bounded execution envelope for a reviewable change.
- Tenant: an isolated client workspace and its owned data.
- Platform administrator: an authorised VAKA operator without a tenant context.
- Definition status: authority and maturity of the specification.
- Implementation status: whether the accepted scope exists in code/configuration.
- Verification status: the evidence state for the defined acceptance criteria.
- Availability status: planned, internal, preview, pilot, GA, disabled or retired.
- Reversal: an append-only correcting transaction that preserves posted history.
- Professional review: qualified legal, tax, accounting, privacy, security or localisation approval recorded for the applicable market and scope.
