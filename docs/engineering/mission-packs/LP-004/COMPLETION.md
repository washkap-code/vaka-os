# LP-004 — Email Delivery Integration

**Status:** Complete
**Branch:** `feature/email-delivery`
**Completed:** 2026-07-16
**Migration:** None; migration number 0046 remains free

## 1. Files created

- `server/src/email-templates.ts`
- `server/src/email-transport.ts`
- `server/src/transactional-email.ts`
- `server/tests/email-transport.test.ts`
- `docs/engineering/EMAIL-DELIVERY-OPERATIONS.md`
- `docs/engineering/mission-packs/LP-004/COMPLETION.md`

## 2. Files modified

- `server/.env.example`
- `server/package.json`
- `server/package-lock.json`
- `server/src/auth-security.ts`
- `server/src/config.ts`
- `server/src/finance-document-delivery.ts`
- `server/src/index.ts`
- `server/src/notifications.ts`
- `server/src/platform-runtime.ts`
- `server/src/platform/notifications/README.md`
- `server/src/platform/notifications/adapters/email-gateway.ts`
- `server/src/platform/notifications/tests/adapters.test.ts`
- `server/src/platform/notifications/types.ts`
- `server/src/routes.ts`
- `server/tests/auth-security-platform-workforce.test.ts`
- `server/tests/config.test.ts`
- `server/tests/finance-document-delivery.test.ts`
- `server/tests/notifications.test.ts`
- `server/tests/platform-admin-analytics.test.ts`
- `server/tests/tenant-isolation-endpoint-manifest.ts`
- `docs/02-product/INVOICE-DELIVERY-SPEC.md`

## 3. Behaviour changes

- All transactional email now passes through the platform
  `NotificationService` and one provider-neutral SMTP transport built with
  Nodemailer. No vendor SDK or direct/ad-hoc provider request remains.
- Production validates email configuration before opening the HTTP listener
  and refuses to boot when SMTP is disabled, incomplete, weakly authenticated,
  or configured without transport encryption.
- Development and staging use a rendered JSON console transport by default;
  they contact SMTP only when explicitly enabled. Tests use a process-local
  in-memory transport with message inspection, clearing and assertion helpers.
- Delivery is attempted at most three times with bounded exponential backoff.
  The final failure is recorded, rethrown to the calling flow, and exposed to
  operators.
- `email.queued`, `email.retried`, `email.sent` and `email.failed` are emitted
  as structured JSON with message ID, recipient, template, correlation ID and
  attempt. Info-level events contain no body or template variables.
- Platform operators with `platform.operations.read` can query failures since
  00:00 UTC at
  `GET /api/v1/platform/operations/email-failures/today`.
- No queue, campaign or bulk-email feature was added. No schema or migration
  changed, so 0046 was not reserved.

### Email-sending call sites migrated

1. `POST /api/v1/auth/password-reset/request` — password-reset delivery moved
   from its direct HTTP-provider transport to `NotificationService`.
2. `POST /api/v1/security/users` — tenant-user invitation now uses the single
   transport; temporary passwords are redacted from persisted variables.
3. `POST /api/v1/invoices/:id/send` — issued-invoice delivery continues through
   `NotificationService` and now reaches the configured transport with an
   explicit correlation ID.
4. `POST /api/v1/contacts/:id/statements/send` — customer-statement delivery
   uses the same path.
5. `POST /api/v1/invoices/:id/payment-reminders/send` — payment reminders use
   the same path.

Low-stock and procurement notification call sites remain `IN_APP`; they are
not email bypasses.

### SMTP environment variables added

- `SMTP_ENABLED`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_AUTH_USER`
- `SMTP_AUTH_PASSWORD`
- `SMTP_FROM_ADDRESS`
- `SMTP_FROM_NAME`
- `SMTP_REPLY_TO`
- `SMTP_TLS` (`implicit`, `starttls`, or non-production-only `none`)

No credential value was committed or found exposed during this mission.

## 4. Tests executed

- Focused configuration, transport, retry and notification-service tests:
  4 files / 21 tests passed.
- Password-reset integration with the in-memory transport: passed.
- Tenant-user invitation integration with the in-memory transport: passed.
- Invoice delivery integration with the in-memory transport: passed.
- Operator failure endpoint authorization and result test: passed.
- Dedicated tenant-isolation regression suite: 13/13 tests passed.
- Full server suite against a freshly migrated and seeded PostgreSQL database:
  95 files / 438 tests passed. The restore-drill evidence file ran last because
  it intentionally rotates the shared seeded principal password.
- Server typecheck: passed.
- Web typecheck: passed.
- Web production build: passed; Vite retained its existing large-chunk warning.
- Server high/critical dependency audit: passed; four existing moderate
  development-tool findings remain.
- `git diff --check`: passed.

## 5. Verification status

- Fresh disposable PostgreSQL replay applied every migration from 0000 through
  0045 transactionally with zero errors, zero manual steps and zero structural
  drift.
- The runtime schema check passed with gated features disabled.
- All required test, isolation, typecheck and build gates are green.
- Repository search found no remaining legacy `EMAIL_PROVIDER_*` configuration,
  direct email-provider fetch, or `createHttpEmailTransport` call.
- No production, shared database, external SMTP server or DNS record was
  accessed or changed.

## 6. Risks and human decisions

1. In-process retry is intentionally not durable across a process crash. A
   durable queue remains outside pilot scope.
2. SMTP acceptance is not proof of inbox delivery. Bounce, complaint and
   provider webhook processing are not part of LP-004.
3. The chosen SMTP provider, sending domain and reply-to mailbox remain an
   operator decision. Production must not be enabled until the operator has
   stored all SMTP secrets and verified aligned SPF, DKIM and DMARC records as
   documented in `docs/engineering/EMAIL-DELIVERY-OPERATIONS.md`.
4. The console transport intentionally includes full rendered messages at
   debug level in non-production. Access to development and staging logs must
   remain restricted because those messages can contain personal data.
5. Platform-user password resets cannot use the tenant-owned notifications
   table. Their durable send status remains on `password_reset_requests`, and
   the operator failure endpoint combines that status with tenant notification
   failures.
6. User creation remains committed when invitation delivery ultimately fails,
   preserving existing API behaviour and returning the temporary password to
   the tenant owner. Operators must use the failure surface to detect and
   resolve that case.
7. The dependency audit reports four moderate issues in the existing
   Drizzle/esbuild development toolchain. There are no high or critical
   findings; the available forced fix is a breaking downgrade and was not
   applied.

## 7. Recommended next mission

Proceed to **LP-005 — Health Endpoints, Structured Logging and Monitoring
Hooks**. It can incorporate the new structured email events and failure
endpoint into the pilot's wider operational monitoring without changing the
LP-004 transport contract.
