# Data Retention & Account Lifecycle Policy — SKELETON FOR COUNSEL REVIEW
Published policy shown to clients; mirrors what the software actually enforces.

| Account state | Access | Data |
|---|---|---|
| Trial / Active | Full | Live |
| Past due (day 1 to ~day 75 overdue) | Full + reminders | Live |
| Suspended (≈2.5 months overdue) | **Read-only + billing + full export** | **Retained in escrow — never deleted for non-payment** |
| Reactivated (arrears + fee settled) | Full restored | Intact |
| Closed (only after [12+] months' non-response, [90] days' notice, export offered) | Export only, then none | Deleted after certified export window; audit trail of deletion retained |

Notes for counsel: personal data of the client's own employees/customers has
statutory protection independent of the client's payment status — deletion
process must account for this. Backup copies age out of the [35]-day immutable
backup window after live deletion.
