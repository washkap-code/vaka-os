# P9-011 — Completion report (v2, regenerated off current main)

**Branch:** `codex/p9-011-privileged-step-up-v2` (fresh off `main` @ 4ba2b39, which includes P9-010 v2)
**Status:** Implementation complete; all local gates green. **No migration — no production DDL required.**

## Files changed

| File | Change |
| --- | --- |
| `server/src/auth-step-up.ts` | New: proof issuance (password + MFA/recovery via the existing atomic factor boundary), HS256 session-bound validation, 428 semantics, redacted audit |
| `server/src/auth-security.ts` | New exported `verifyMfaCodeWithinTransaction` (row-locked, one-time recovery consumption; reuses the existing private `verifyFactorCode`) |
| `server/src/routes.ts` | `POST /auth/step-up`; proof required on: owner team create/status change, owner immediate contact deletion, owner APPROVE of deletion requests, platform staff create/change/temporary-password |
| `server/src/security.ts` | `X-Vaka-Step-Up` added to the CORS allow-headers |
| `server/src/app.ts` | Rate limiter on `/api/v1/auth/step-up` |
| `server/tests/privileged-step-up.test.ts` | New suite (8 tests) |
| `server/tests/user-session-activity.test.ts`, `record-management.test.ts`, `suppliers.test.ts` | Updated to present proofs on the newly protected routes (in-scope contract change; assertions preserved) |
| `web/src/shell/step-up-model.ts` + `step-up-dialog.tsx` | In-memory proof holder + reusable accessible reauthentication dialog (LegacyModal focus trap, labelled fields, password show/hide, optional authenticator/recovery input, `role="alert"` error, returns to the initiating action) |
| `web/src/api.ts` | Thrown errors now carry `code`/`status` (needed to detect 428) |
| `web/src/App.tsx` | Minimal wiring at the five initiating actions (contacts remove/decide, team create/status, platform staff create/save/temporary-password) — no wholesale rewrite |
| `web/src/locales/app.en.ts` | `stepUp` copy in the English catalogue |
| `web/scripts/step-up-model.test.mjs` + `web/package.json` | Web model test (5 tests) + script |

## Scoping notes

- **Restore-drill-review route omitted:** OPS-016 (restore-drill evidence) is not on `main`, so the "Principal acceptance/rejection of restore-drill evidence" protection is deferred. **Follow-up:** protect that route with `requireStepUp` when OPS-016 lands.
- No finance/billing route was altered (finance audit phase exclusion respected).
- No new migration; highest migration remains `0031_refresh_token_rotation.sql`.
- Ordinary staff deletion *requests* and owner *REJECT* decisions deliberately require no proof.
- Proof semantics: HS256 (explicit algorithm), purpose `privileged-step-up`, bound to user + `user_sessions.id` + tenant context + assurance, unique `jti`, 10-minute expiry, held only in browser memory, never persisted or logged. Permission checks run first and a proof grants no permission.

## Test evidence (scratch embedded Postgres)

- `tests/privileged-step-up.test.ts`: **8/8** — password-only issuance + redacted completion audit; wrong-password bounded failure audit; team-management 428/positive + proof-grants-no-permission; missing/malformed/wrong-purpose/expired/cross-user/cross-session/cross-tenant/wrong-signature proofs all 428; owner-immediate deletion + APPROVE protected while staff request + REJECT exempt; MFA explicit prompt, TOTP and one-time recovery issuance with reuse-failure audit; session revocation blocks the protected path; platform staff routes with `platform_admin.step_up_*` evidence.
- Full DB-backed server suite: **all 47 test files green** (one `platform-admin-analytics` failure was a scratch-DB rerun artifact — the test permanently rotates the seeded admin password on first run; green after credential reset, unrelated to this mission).
- Server typecheck clean; `git diff --check` clean.
- Web: `test:step-up` **5/5**, `test:session-renewal` 7/7, typecheck clean, production build OK, design-token / accessibility / shell / homepage gates OK.

## Production steps

None beyond code deploy (no DDL). Audit uses the existing `audit_logs` / `platform_audit_logs` tables.
