# P2-009 — Zimbabwe payroll (PAYE + NSSA, effective-dated) — technical preview

**Status:** Implemented as a technical preview (accountant gate active)
**Programme:** 2 — Finance & country localisation
**Priority:** P1 launch workstream (largest remaining build per SESSION-HANDOFF)
**Mission id note:** `P2-007/` is the *invoice detail* mission pack; payroll uses
the new id **P2-009** to avoid repeating the P2-008 id collision.
**Depends on:** P2-001 country packs; P2-005 period close; the `postJournal`
funnel; RBAC catalogue in `lib.ts`.

## Outcome

A permitted tenant user can maintain an employee register, prepare a monthly
payroll run in the tenant base currency, review computed payslips (gross →
NSSA → taxable → PAYE → AIDS levy → net), and post the run as one balanced
journal through the governed `postJournal` funnel. Posted runs are immutable;
the only correction path is a full offsetting reversal dated in an open period.
Every statutory figure comes from effective-dated country-pack configuration —
nothing is hard-coded in the engine.

**Accountant gate:** the entire module is a technical preview. Every API
response and screen carries the verification status from the country pack
(`TECHNICAL_PREVIEW`). It must not be presented as compliant payroll until a
qualified Zimbabwean accountant has reviewed the tables, the NSSA-deductibility
assumption and the posting scheme, and the pack status is flipped to
`APPROVED`.

## User, problem and measurable result

**User:** Owner, Admin or Accountant with the new `payroll.*` permissions.

**Problem:** Zimbabwean SMEs run payroll on spreadsheets; PAYE bands, the AIDS
levy and quarterly-gazetted NSSA ceilings change, and manual GL capture breaks
the ledger's integrity guarantees.

**Result:** payroll figures are computed from governed effective-dated
configuration, snapshotted immutably per payslip with a calculation trace, and
posted atomically through the same journal engine as every other financial
effect — respecting period close, tenant isolation and reversal-only
corrections.

## Statutory configuration (requires professional verification)

Captured in `server/src/countries/zw.ts` as effective-dated data, sourced
2026-07-15 from public summaries of the 2026 tables. **Unverified until
accountant sign-off:**

- **PAYE monthly bands (USD), effective 2026-01-01:** 0% to 100; 20% on the
  next 200; 25% on the next 2,700; 40% above 3,000.
- **PAYE monthly bands (ZWG), effective 2026-01-01:** 0% to 2,800; 20% to
  8,400; 25% to 84,000; 40% above.
- **AIDS levy:** 3% of the PAYE amount.
- **NSSA POBS, effective window in pack:** 4.5% employee + 4.5% employer on
  insurable earnings capped at US$700/month (ceiling is gazetted quarterly —
  hence effective-dated with per-currency ceilings; ZWG ceiling intentionally
  not configured until verified).
- **Assumption flagged for review:** the employee NSSA contribution is treated
  as deductible before PAYE (taxable = gross − employee NSSA).

## Data model (migration 0035, additive + idempotent)

- `employees` — tenant-scoped register: employee number (unique per tenant),
  names, national id, NSSA number, contact, `currency`, monthly `basic_salary`,
  `status` ACTIVE|ENDED, start/end dates. No ledger effect.
- `payroll_runs` — one per (tenant, month, currency) while live: `period_month`
  (month-truncated, same check as accounting_periods), `status`
  DRAFT|POSTED|REVERSED, totals snapshot, `journal_entry_id`,
  `reversal_journal_entry_id`, actor/timestamps, pack verification note
  snapshot. Partial unique index excludes REVERSED so a corrected month can be
  re-run.
- `payslips` — per run × employee, snapshotting every figure (basic,
  allowances, gross, NSSA employee/employer, taxable, PAYE, AIDS levy, net) and
  a JSON `calculation_trace` (band-by-band math + effective config windows).
  Unique (run, employee).
- Role backfill (0004 precedent): `payroll.read|manage|post` appended to
  Owner, Admin and Accountant.

## Posting scheme (one balanced journal per run)

| Line | Account (system key) | Amount |
| --- | --- | --- |
| Dr | `WAGES_EXPENSE` (6000) | gross + employer NSSA |
| Cr | `PAYE_PAYABLE` (2200) | PAYE + AIDS levy |
| Cr | `NSSA_PAYABLE` (2210) | employee + employer NSSA |
| Cr | `NET_WAGES_PAYABLE` (2220, new) | net pay |

`ensurePayrollAccounts()` assigns the system keys to existing tenants' 2200 /
2210 / 6000 rows and creates 2220 on demand (mirrors
`ensureBankLedgerAccount`); `ZW_DEFAULT_COA` carries them for new tenants.
Settlement of `NET_WAGES_PAYABLE` (and remittance of PAYE/NSSA) is a manual
journal in v1.

## Finance readiness answers

1. **Accounting event:** monthly payroll run posted. 2. **Journal:** the
balanced entry above, source `payroll_run`. 3. **Legal entity:** the tenant.
4. **Currency:** tenant base currency only in v1 (mixed-currency payroll
refused with a clear error). 5. **Tax:** PAYE + AIDS levy + NSSA from
effective-dated pack config, snapshotted per payslip. 6. **Audit:**
`payroll.run.created|updated|posted|reversed`, `payroll.employee.*`.
7. **Reversible:** yes — offsetting journal in an open period, run marked
REVERSED. 8. **Explainable:** per-payslip calculation trace. 9. **AI:** no AI
authority; read-only summaries only. 10. **Permission:** `payroll.read`
(view), `payroll.manage` (register + draft runs), `payroll.post`
(post/reverse — segregable from manage in custom roles).

## Explicit v1 non-scope

Hourly/weekly pay, non-statutory deductions (advances, garnishees, pensions,
medical aid), ZWG NSSA ceiling, terminal benefits, leave, ZIMRA P2 return
export, net-pay bank file, multi-currency runs, self-service payslips.

## Verification

`server/tests/payroll.test.ts`: PAYE band-edge unit tests (100 / 300 / 3,000
boundaries, ZWG table, AIDS levy rounding), NSSA ceiling, run lifecycle
(draft → post → immutable → reverse), journal balance and account routing,
period-close refusal, tenant isolation, permission gates, base-currency
enforcement, and pack fail-closed behaviour when no effective table covers the
period.
