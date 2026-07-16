# VAKA OS — Pilot Rollback Criteria and Procedure

**Document ID:** OPS-RC-001
**Version:** 1.0 — 16 July 2026
**Applies to:** The controlled pilot (1–2 tenants). Review before any expansion.
**Decision authority:** Dr. Washington Kapapiro (Owner, VAKA OS).
**Named support owner:** Mr. Anthony Kakurira. If Dr. Kapapiro is unreachable for 2 hours during a Severity 1 event, Mr. Kakurira has standing authority to execute a rollback without further approval.

---

## 1. Principle

The pilot runs with a bias toward rollback. The cost of rolling back is embarrassment; the cost of not rolling back can be a tenant's corrupted books or leaked data. When in doubt, roll back. No rollback executed in good faith under this document is ever treated as a mistake.

## 2. What "Rollback" Means Here

Three distinct levers, from smallest to largest:

- **R1 — Feature rollback:** disable a feature flag or revert a single deployment to the previous application version. Database unchanged. Minutes.
- **R2 — Version + data rollback:** revert application version AND restore the database to the last known-good backup. Data entered after that backup is lost and must be re-entered by tenants (they are warned of this possibility in the pilot agreement). Under 4 hours (see restore-drill RTO).
- **R3 — Pilot termination:** suspend the service, export each tenant's complete data per the offboarding procedure, and hand it over. This is the honest exit if trust in the system's integrity cannot be re-established.

## 3. Automatic Triggers — roll back, then investigate

No debate, no "let's watch it for a day." Detection of any of these executes the stated response immediately:

| # | Trigger | Response |
|---|---|---|
| T1 | Any confirmed cross-tenant data exposure — one tenant sees, or could have retrieved, another tenant's data | R2 minimum. Service suspended immediately while scope is assessed. Affected tenants informed within 24h. Assess POTRAZ data-breach notification duty with the lawyer. |
| T2 | Financial integrity violation — an unbalanced journal, an immutable record altered, invoice totals not matching lines, or ledger invariant check failing in production | R2 to last backup with verified-balanced books. Do not let tenants keep transacting on books you can't trust. |
| T3 | Data loss or corruption confirmed (records vanished, documents unretrievable, backup failing AND primary degraded) | R2, and if backups themselves are implicated, R3 assessment begins. |
| T4 | Security compromise — unauthorized admin access, credential leak, active exploitation | Suspend service (maintenance mode) immediately; R2 after forensics establish a clean restore point. Rotate all secrets before resuming. |
| T5 | A deployment leaves `/readyz` failing or core flows (login, invoice creation) broken for more than 30 minutes with no identified fix | R1 to previous version. |

## 4. Judgment Triggers — decision within 24 hours

The decision-maker must explicitly decide (and record) roll back / fix forward. Silence is not a decision.

| # | Trigger | Default lean |
|---|---|---|
| J1 | Repeated Severity 2 defects: 3+ distinct data-affecting bugs in any 7-day window | R1 the offending area; freeze deployments until root-cause review. |
| J2 | Availability below 99% over any rolling 7 days (≈100 min downtime/week) | Fix forward once; second consecutive breach → deployment freeze + review. |
| J3 | Tenant loses confidence and requests exit | R3 for that tenant: full export within 5 business days regardless of cause. |
| J4 | Email delivery failure rate >10% for 48h (invoices/statements not reaching customers) | R1 email pathway to manual send; fix forward. |
| J5 | Backup job fails 2 consecutive nights | Deployment freeze until backups green — running without backups is running without brakes. Not a rollback, but blocks all changes. |

## 5. Rollback Procedure (R2 — the serious one)

1. **Declare.** Decision-maker states in writing (message to support owner + incident log): trigger, chosen response, restore point.
2. **Freeze.** Maintenance mode on. Banner/notice to tenants: "VAKA is temporarily offline for maintenance; your data is safe" (or the breach-specific wording if T1/T4 — coordinate wording with lawyer for breach cases).
3. **Snapshot the broken state.** Take a backup of the current (bad) database BEFORE restoring — evidence for diagnosis, and insurance in case the rollback decision was wrong.
4. **Restore.** Follow the restore procedure from the Restore Drill Runbook (OPS-RB-001), Steps 2–6, targeting the production instance this time. The drill exists precisely so this step is boring.
5. **Verify.** Migration version, sanity signature, financial spot-check, `/readyz`, test login per tenant.
6. **Communicate.** Tell each tenant: what happened (plainly), what data window was lost (from restore point to freeze), what they need to re-enter, and what changes before the service resumes normal operation. Template in Section 7.
7. **Resume.** Lift maintenance mode. Heightened monitoring for 72 hours.
8. **Post-incident review** within 5 business days: root cause, why detection took as long as it did, which gate should have caught it, and the Codex mission(s) raised. Review is written down, not just discussed.

## 6. Deployment Freeze Rules

A freeze (from T-triggers, J1, J2, J5) means: no production deployments except the fix for the freezing issue. Freezes are lifted only by the decision-maker, in writing, after the exit condition (stated at freeze time) is met.

## 7. Tenant Communication Template (R2)

> Subject: VAKA service notice — action needed
>
> On [date] we detected [plain-language description]. To protect the accuracy of your records we restored the system to its state as of [restore point, local time]. Anything you entered between [restore point] and [freeze time] will need to be re-entered — from our records this appears to be approximately [N invoices / N payments / etc.].
>
> Your data outside this window is intact and verified. We have [summary of corrective action]. We're available on [support channel] to help you re-enter anything affected.
>
> Anthony Kakurira, VAKA Support

## 8. Standing Requirements That Make This Document Real

- Last verified backup age is checked before every deployment (deploy script prints it; >26h old blocks deploy).
- Previous application version is always retained and re-deployable in under 15 minutes (R1 lever).
- The restore drill (OPS-RB-001) is current — an R2 executed against an unproven backup pipeline is a gamble, not a procedure.
- This document is reviewed after every incident and before onboarding any tenant beyond the first two.
