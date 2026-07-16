# LP-FIX-001 — Completion report

**Mission:** Step-up verification outcome narrowing

**Branch:** `fix/step-up-verification-outcome`

**Date:** 2026-07-16

**Status:** Complete locally; Vercel production-build confirmation pending branch deployment.

## 1. Files created

| File | Purpose |
| --- | --- |
| `docs/engineering/mission-packs/LP-FIX-001/COMPLETION.md` | Scope, verification and handoff evidence |

## 2. Files modified

| File | Change |
| --- | --- |
| `server/src/auth-step-up.ts` | Uses the explicit `outcome.ok === false` discriminant before reading `outcome.failure` |
| `server/package.json` | Pins TypeScript exactly to `6.0.3` |
| `server/package-lock.json` | Records the exact server compiler requirement |
| `web/package.json` | Pins TypeScript exactly to `6.0.3` |
| `web/package-lock.json` | Records the exact web compiler requirement |
| `docs/engineering/SESSION-HANDOFF.md` | Final session state, verification and next steps |

No migration, runtime dependency, schema, route, permission, audit or database
change was made. Migration `0046` remains free.

## 3. Behaviour changes

There is no runtime behaviour change. `VerificationOutcome` already guarantees
that `ok` is a literal boolean. Comparing the false branch explicitly has the
same result as the former negation for every possible outcome, while giving
TypeScript an unambiguous discriminant before `failure` is accessed.

Both existing paths remain intact:

- `ok: true` issues the same proof with the same method and ten-minute expiry;
- `ok: false` records the same bounded `password` or `mfa_code` audit detail
  and returns the same generic unauthorised response.

The TypeScript workspace ranges changed from `^6.0.3` to exact `6.0.3`.
GitHub CI installs each committed workspace lock with `npm ci`, and Vercel's
root workspace install now resolves the same exact compiler instead of a
range. No extra CI dependency or permissive compiler setting was introduced.

## 4. Tests executed

All database verification used a fresh disposable local PostgreSQL database.

| Check | Result |
| --- | --- |
| Clean pre-fix server typecheck with TypeScript 6.0.3 | Passed locally; Vercel-only error was not locally reproducible |
| Clean pre-fix web typecheck with TypeScript 6.0.3 | Passed |
| Fresh migration replay `0000`–`0045` | Passed transactionally; zero structural drift |
| Focused privileged step-up suite | Passed: 8/8 |
| Full server suite at the unchanged 15-second test timeout | Passed: 95 files, 444/444 tests |
| Server typecheck after fix | Passed with TypeScript 6.0.3 |
| Web typecheck after fix | Passed with TypeScript 6.0.3 |
| Root workspace typecheck after Vercel-style `npm install` | Passed; server and web both resolved 6.0.3 |
| Web production build | Passed; existing chunk-size advisory only |
| `git diff --check` | Passed |

The focused suite covers password success, wrong-password failure, MFA/TOTP
success, recovery-code failure, proof binding, permission independence,
session revocation and audit redaction. No test was deleted, skipped, changed
or weakened.

## 5. Verification status

Local acceptance is green. The source no longer relies on the shorthand
negation that Vercel rejected, and both local workspace installation and the
root installation used by Vercel resolve TypeScript exactly to `6.0.3`.

## 6. Risks and human decisions

- The reported TS2339 could not be reproduced locally with a clean TypeScript
  6.0.3 installation. The explicit discriminant removes the disputed control-
  flow inference regardless, but the branch preview/production build must be
  observed to confirm Vercel is using the new commit and no stale build cache.
- Exact compiler pins intentionally stop automatic TypeScript patch/minor
  adoption. Future upgrades should be deliberate, applied to both workspaces,
  and verified through both typechecks and the production build.
- LP-005 and LP-006 remain separate local pilot branches according to the
  current main handoff. This micro-fix must not absorb or overwrite them.

## 7. Recommended next mission

Push this branch, confirm Vercel and all GitHub gates are green, and merge the
micro-fix. Then ship LP-005 and LP-006 in order before starting LP-007 from the
resulting current main.
