# Production drift patch + separation cutover prep (2026-07-14)

**Database:** Supabase `vaka-platform` (`kjabilwcdwpncthbskvy`) — shared with GENFIN
**Operator:** VAKA Architecture Office (Cowork), at owner request

## 1. Drift patch (applied)

Inspection found production **3 tables / 36 columns behind code** (code: 52 tables /
571 columns; production was 49 / 535). The 36 missing columns belonged entirely to
3 missing tables — every existing table was already column-aligned. This drift was
the root cause of the 2026-07-13 production 500s (e.g. `POST /api/v1/invoices`
Postgres `42703`), because features shipped whose tables were never hand-applied to
the shared database (which cannot take `drizzle-kit push`).

**Applied additively (`CREATE TABLE IF NOT EXISTS` + indexes + checks), GENFIN untouched:**

- `finance_document_delivery_requests` — unblocks invoice/statement/reminder delivery (P7-001)
- `low_stock_alert_states` — unblocks low-stock alerts (P5-004)
- `contact_communication_preference_events` — unblocks delivery consent (P3-004/P7-001)

**Verified:** production now exactly matches code — **52 tables, 571 columns**.

## 2. Root cause & permanent fix

The recurring drift-500 class of bug exists only because VAKA shares a database with
GENFIN, which forbids the normal `drizzle-kit push` on deploy. The permanent fix is
the dedicated-database migration (`DATABASE-SEPARATION-PLAN.md`). Until then, **every
schema-changing feature must have its migration hand-applied to production** or it
will 500. This manual step is the single biggest reliability risk.

## 3. Separation cutover — execution checklist (ready to run)

Owner/account actions are marked ⚠️ (require Supabase/Vercel dashboard access).

1. ⚠️ **Create** new Supabase project `vaka-os-prod` (region eu-west-2). Copy the
   session-pooler connection string.
2. **Provision schema** on the new empty DB (safe — no GENFIN there):
   `cd server && DATABASE_URL="<new-direct-url>" npm run db:push`
   then apply `drizzle/0007_financial_integrity_controls.sql` directly (idempotent).
3. **Seed:** `PLATFORM_ADMIN_PASSWORD=… DATABASE_URL="<new>" node --import tsx src/seed.ts`,
   then set the platform-admin email to the owner's and force a password change.
4. **Copy data** (tiny dataset): `pg_dump --data-only` the 52 VAKA tables **only**
   (never `genfin_*`) from `vaka-platform`, restore into `vaka-os-prod` in FK order;
   verify per-table row counts.
5. ⚠️ **Cutover:** set Vercel Production `DATABASE_URL` to the new pooler URL; keep
   `JWT_SECRET` and `CAPTURE_ENCRYPTION_KEY` unchanged; redeploy.
6. **Smoke test:** admin login → create tenant → issue invoice → record payment →
   dashboard → export; confirm append-only triggers present.
7. **Decommission:** after a healthy hold period, drop the 52 VAKA tables from
   `vaka-platform` (GENFIN untouched). Enable RLS default-deny on the new project.

Cowork can execute steps 2–4, 6–7 via the Supabase tools once the owner completes
the ⚠️ steps (project creation + Vercel env). Rollback: revert Vercel `DATABASE_URL`
to `vaka-platform`; VAKA tables there remain intact until step 7.

## 4. Interim guardrail (until separation)

Every Codex mission that adds a table/column must call out the exact DDL so it can be
hand-applied to production immediately after merge. Cowork verifies production
alignment after each schema-changing merge (52 tables / 571 columns baseline).
