# VAKA OS — Dedicated Database Migration Plan

**Status:** Approved — ready to execute (owner requested 2026-07-12)
**Owner:** VAKA Architecture Office
**Type:** Infrastructure / operations (production data move)

## 1. Why

Today VAKA's production data lives in the Supabase project **`vaka-platform` (`kjabilwcdwpncthbskvy`)**, which is **shared with the GENFIN app** (30+ `genfin_*` tables holding real member/staff/payroll data). Consequences:

- **Migrations are unsafe.** The standard `drizzle-kit push` would try to drop every table not in VAKA's schema — i.e. all of GENFIN. Every schema change currently has to be hand-applied.
- **Blast radius.** A mistake in one app's database operations can affect the other.
- **Security posture.** RLS is disabled across the project; two unrelated products share one trust boundary and one anon key.
- **Independent scaling / backups / restore drills** are impossible while co-tenanted.

**Goal:** VAKA runs on its **own dedicated Postgres (new Supabase project)**, GENFIN keeps `vaka-platform`, and neither can affect the other.

## 2. Target state

- New Supabase project, e.g. **`vaka-os-prod`**, region `eu-west-2` (match current latency).
- VAKA schema provisioned the **normal, supported way** (`drizzle-kit push` against the empty new DB — now safe because nothing else lives there), then `0007` integrity controls, then `src/seed.ts`.
- Vercel `DATABASE_URL` points at the new project's **pooler** connection string.
- The 40 VAKA tables are **removed from `vaka-platform`** after cutover, closing the shared-boundary exposure for VAKA data.

## 3. Preconditions

- Confirm current VAKA production data volume (currently minimal: 1 tenant, 1 admin, plans, roles, default warehouse; ~0 financial rows). Small data = simple move.
- Have the current production secrets available to reuse where continuity matters:
  - `JWT_SECRET` — **reuse the same value** so nothing about tokens changes (users re-authenticate anyway after cutover; keeping it avoids incidental breakage).
  - `CAPTURE_ENCRYPTION_KEY` — **must be reused** if any encrypted capture payloads exist, or captured evidence becomes undecryptable.
  - `PLATFORM_ADMIN_PASSWORD` — needed for the seed step.

## 4. Migration steps

1. **Create** the new Supabase project `vaka-os-prod` (eu-west-2). Record its connection string (session pooler for serverless/Vercel).
2. **Provision schema** against the new empty DB:
   ```
   cd server
   export DATABASE_URL="<new-project-direct-url>"
   npm run db:push                 # safe: empty DB, no genfin
   node --import tsx scripts/apply-finance-integrity-controls.ts   # requires a name containing 'test' guard — run 0007 SQL directly against prod instead (see note)
   ```
   Note: `apply-finance-integrity-controls.ts` is guarded to test databases. For production, apply `drizzle/0007_financial_integrity_controls.sql` directly (it is idempotent), or add a production-safe controls script.
3. **Seed reference data** on the new DB: `PLATFORM_ADMIN_PASSWORD=… node --import tsx src/seed.ts` (plans + platform admin). Verify the tenantless platform administrator is `washington@africaprocure.com`; `waskap@me.com` remains tenant-owned and must not be repurposed as a platform identity.
4. **Migrate tenant data** from `vaka-platform` → `vaka-os-prod`:
   - Because volume is tiny, prefer an explicit, ordered `pg_dump --data-only --table=public.<vaka_table>` for the 40 VAKA tables **only** (never `genfin_*`), restored into the new DB in FK-dependency order.
   - Alternatively, for a near-empty dataset, re-create the single tenant via the app and skip a bulk copy.
   - Verify row counts per table match post-import.
5. **Point the app at the new DB:** update `DATABASE_URL` in Vercel (Production) to the new pooler URL. Keep `JWT_SECRET`/`CAPTURE_ENCRYPTION_KEY` unchanged. Redeploy.
6. **Smoke test** on the deployed app: platform-admin login, create a tenant, issue an invoice, record a payment, view dashboard, export. Confirm append-only triggers active (`information_schema.triggers`).
7. **Decommission VAKA in the shared DB:** once the new DB is confirmed healthy for a hold period, drop the 40 VAKA tables from `vaka-platform` (leaving `genfin_*` intact). This removes VAKA's exposure in the shared, RLS-disabled project.

## 5. RLS / security posture on the new DB

VAKA connects via a **direct Postgres role over `DATABASE_URL`**, not the Supabase anon key or client SDKs, and enforces tenant isolation server-side. Recommended hardening on the dedicated project:
- Enable RLS on all tables with a **default deny**, and rely on the service/owner role (which bypasses RLS) for the app connection — so an accidentally-leaked anon key exposes nothing.
- Restrict the anon/`authenticated` roles from the `public` schema entirely if no PostgREST access is needed.
- Rotate the project API keys; store all secrets in Vercel only.

## 6. Rollback

- The old `vaka-platform` VAKA tables remain intact until step 7. To roll back, revert `DATABASE_URL` in Vercel to the old project and redeploy. No data is destroyed before the verified hold period.

## 7. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Dropping GENFIN tables via a schema push on the shared DB | Never push against `vaka-platform`; provision only the new empty DB |
| Encrypted capture becomes unreadable | Reuse `CAPTURE_ENCRYPTION_KEY` |
| Sessions invalidated at cutover | Expected; users re-login. Reusing `JWT_SECRET` avoids other token issues |
| Data copied out of FK order | Restore in dependency order; verify per-table counts |
| Downtime during cutover | Tiny dataset → cutover is a config change + redeploy (minutes) |

## 8. Definition of done

- Vercel Production `DATABASE_URL` = `vaka-os-prod`.
- App fully functional (login → invoice → payment → dashboard → export) on the new DB.
- Finance integrity triggers present on the new DB.
- VAKA tables removed from `vaka-platform`; GENFIN unaffected.
- This document updated with the executed connection details (redacted) and the cutover date.
