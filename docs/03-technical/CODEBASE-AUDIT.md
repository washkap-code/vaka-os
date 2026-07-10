# VAKA OS Codebase Audit

## Implementation addendum — 2026-07-10

Since the original audit, VAKA has added immutable invoice document snapshots,
secure expiring invoice links, branded PDF logo embedding, and a first
server-side session foundation. New sessions store only a token hash, record
last-seen/idle/absolute expiry data, and can be revoked by the tenant Owner
through the Users & Activity view. Refresh-token rotation, MFA, explicit owner
identity, and complete activity coverage remain open hardening work.

**Audit date:** 2026-07-04
**Scope:** Repository-level static review
**Status:** Baseline audit; not a penetration test, compliance opinion, or production-readiness certification

## 1. Executive summary

VAKA OS is an early but coherent full-stack business application. It already has a stronger transactional core than many products at this stage: tenant-scoped domain records, role permissions, audit logs, append-only accounting and stock ledgers, double-entry validation, per-transaction currency snapshots, atomic cross-module workflows, and tests for several financially dangerous failure modes.

The application is not yet ready to support the full promise of **The Operating System for African Business**. The current implementation is a compact Zimbabwe-focused CRM, accounting, inventory, billing, and reporting system. Localisation, VAKA AI, comprehensive mobile support, operational hardening, user administration, production-grade authentication, migration discipline, and several roadmap modules remain incomplete.

The recommended approach is incremental hardening, not a rewrite. Preserve the tested ledger and transaction behavior while creating clearer boundaries, closing security gaps, and adding platform capabilities in a deliberate order.

## 2. Audit method and limitations

This audit reviewed:

- root, server, web, API, deployment, and documentation structure;
- package manifests and TypeScript configuration;
- the PostgreSQL/Drizzle schema;
- authentication, authorisation, lifecycle, billing, accounting, inventory, invoicing, reporting, and API code;
- the React frontend and CSS;
- the critical-path test suite; and
- Docker, Vercel, cron, and environment configuration.

No functionality was changed. Tests were not executed because the task was a static audit and the integration suite requires a configured PostgreSQL database and writes test data. Dependency vulnerabilities, runtime configuration, production infrastructure, database policies, network controls, and deployed behavior were not independently tested.

## 3. Current technology stack

| Area | Current choice | Notes |
|---|---|---|
| Language | TypeScript | Strict mode is enabled in server and web configurations. |
| Runtime | Node.js 22 | Used by the API and declared in the server Docker image. |
| Frontend | React 19 + Vite 8 | Single-page application built into `web/dist`. |
| Backend | Express 5 | REST-style JSON API under `/api/v1`. |
| Validation | Zod 4 | Route request bodies are generally validated inline. |
| Database | PostgreSQL 16 | Local service is defined in Docker Compose. |
| ORM/query layer | Drizzle ORM + `pg` | Uses schema definitions, query builder calls, and parameterised SQL templates. |
| Authentication | JWT + bcrypt | One-hour bearer access token; bcrypt cost 12. |
| Testing | Vitest + Supertest | Integration-oriented critical-path tests against PostgreSQL. |
| Styling | Plain global CSS | CSS custom properties provide tenant brand colours. |
| Local orchestration | Docker Compose | PostgreSQL and API services are defined. |
| Production target | Vercel + external PostgreSQL | SPA rewrite, serverless Express entry, London region, and monthly cron are configured. |

The root package uses npm workspaces for `server` and `web`, but its script surface is minimal: only a frontend build is exposed at root.

## 4. Folder structure

```text
/
├── api/
│   ├── index.ts                 # Vercel serverless Express entry
│   └── cron/billing.ts          # authenticated monthly billing cron
├── docs/                        # foundation, product, technical and operational docs
├── server/
│   ├── src/
│   │   ├── db/schema.ts         # Drizzle schema: 28 tables
│   │   ├── accounting.ts        # journal engine and default chart of accounts
│   │   ├── app.ts               # Express bootstrap, headers, CORS, errors
│   │   ├── auth.ts              # signup, login, JWT, tenant/lifecycle/RBAC gates
│   │   ├── billing.ts           # subscriptions, dunning states, suspension
│   │   ├── inventory.ts         # stock ledger, adjustments, PO receipt
│   │   ├── invoicing.ts         # invoice issue/payment/void workflows
│   │   ├── lib.ts               # database, errors, money, RBAC, audit, numbering
│   │   ├── reports.ts           # ledger-derived financial and dashboard reports
│   │   ├── routes.ts            # all API routes in one file
│   │   ├── seed.ts              # plans and platform admin
│   │   └── index.ts             # local server entry
│   ├── tests/critical.test.ts    # critical integration scenarios
│   ├── Dockerfile
│   └── drizzle.config.ts
├── web/
│   ├── src/
│   │   ├── App.tsx              # nearly all UI and screens
│   │   ├── api.ts               # bearer-token API client and currency formatter
│   │   ├── main.tsx
│   │   └── styles.css            # global theme and layout
│   └── vite.config.ts
├── docker-compose.yml
├── vercel.json
└── package.json
```

The structure is understandable at its current size, but `server/src/routes.ts` and `web/src/App.tsx` are already concentration points that will become difficult to maintain.

## 5. Frontend framework and application structure

The frontend is a React 19 single-page application built by Vite. It does not use a router, state-management library, component library, form library, query cache, schema-generated API client, or internationalisation framework.

`App.tsx` is approximately 736 lines and contains:

- the public landing page;
- login and signup;
- the tenant shell and navigation;
- platform administration;
- dashboard;
- contacts;
- deal pipeline;
- invoices;
- products and stock;
- purchase orders;
- financial reports; and
- subscription billing.

Data loading uses local React state, effects, and a small custom `useLoad` helper. Types are sparse; many API results and event values use `any`. Several consequential actions use browser `prompt()` and `alert()`.

Strengths:

- The UI reflects tenant brand colours using CSS variables.
- Permission-derived navigation and readonly states exist.
- Main business areas are represented in a working interface.
- The public landing page has a small-screen media query.

Concerns:

- One large component file creates coupling and makes testing, ownership, and incremental delivery harder.
- No route-level navigation, lazy loading, or error boundary is present.
- No automated frontend tests are present.
- API state has no caching, cancellation, optimistic update policy, or consistent loading/error abstraction.
- Extensive `any` usage weakens the benefit of strict TypeScript.
- Desktop tables, fixed sidebar layout, multi-column forms, and kanban layout lack comprehensive mobile treatments.
- Native prompts and alerts are poor foundations for accessible, validated business workflows.

## 6. Backend and API structure

The backend is an Express 5 application exposing JSON endpoints under `/api/v1`. All routes currently live in `server/src/routes.ts`, while substantial business rules are separated into accounting, inventory, invoicing, billing, and reporting services.

Public endpoints provide signup and login. All later routes pass through:

1. JWT authentication;
2. tenant lifecycle enforcement; and
3. route-specific RBAC permission checks where configured.

The API covers:

- tenant identity and branding settings;
- contacts, deals, and activities;
- products, warehouses, stock adjustments, and stock movements;
- purchase orders and receiving;
- accounts and exchange rates;
- invoices, payments, voids, and expenses;
- journal and financial reports;
- data exports;
- subscription status, invoices, and plans; and
- platform tenant, billing, and audit operations.

Strengths:

- Zod validation is common at request boundaries.
- Important cross-module operations are placed in database transactions.
- Errors are normalised and unexpected internals are not returned to clients.
- Business services are more isolated than the route file suggests.
- Most object reads and updates include tenant scope.

Concerns:

- The route file is becoming a monolith.
- There is no API version lifecycle policy, generated contract, or OpenAPI description.
- List APIs generally lack cursor pagination, filtering, and consistent response envelopes.
- Some routes create related records using supplied IDs without first proving that every referenced record belongs to the same tenant. Database foreign keys validate existence, not tenant ownership.
- Audit coverage is inconsistent: some creates and updates are audited, while deals, activities, warehouses, and other changes are not consistently recorded.
- HTTP request IDs, structured logging, metrics, tracing, and health dependency checks are absent.
- No explicit idempotency mechanism protects retried financial or billing commands.

## 7. Database usage

The application uses PostgreSQL through Drizzle ORM and the `pg` pool. The schema defines 28 tables across:

- platform core: tenants, users, roles, audit logs, and document sequences;
- CRM: contacts, deals, and activities;
- accounting: accounts, rates, invoices, payments, journal, expenses, and bank data;
- inventory: products, warehouses, stock levels, stock movements, and purchase orders; and
- platform billing: plans, subscriptions, subscription invoices, and dunning events.

Important positive patterns:

- Most business tables carry `tenant_id`.
- Accounting reports are derived from journal records.
- `journal_lines` and `stock_movements` are designed as append-only records.
- Per-tenant document numbering uses an atomic upsert.
- Stock level changes use row locking.
- Financial and stock workflows use transactions.
- PostgreSQL `NUMERIC` stores money, quantity, and exchange rates.

Concerns:

- No committed migration history was found. `db:push` changes schema directly, which is not sufficient production migration governance.
- Tenant isolation is implemented primarily in application queries. PostgreSQL row-level security is not present as a defence-in-depth layer.
- Several child tables do not carry `tenant_id`; safety depends on parent traversal and service correctness.
- Cross-table tenant consistency is not enforced by composite foreign keys or equivalent database constraints.
- The money helpers parse values through JavaScript `Number`; this can lose precision for large or highly precise inputs before conversion to `bigint`.
- Reports convert PostgreSQL numeric values to JavaScript numbers, which is convenient but unsuitable for high-value exact financial totals.
- Append-only behavior is a code convention, not visibly protected by database permissions or triggers.
- The connection pool is fixed at 20 connections per process, which can exhaust database limits in a horizontally scaled serverless deployment.
- Some schema entities, notably bank transactions, exist without completed user workflows.

## 8. Authentication and authorisation

Authentication uses email/password credentials, bcrypt password hashing with cost 12, and signed JWT access tokens that expire after one hour. The JWT contains user, tenant, and platform-admin identifiers. Each authenticated request reloads the user, role, and tenant from PostgreSQL, allowing disabled users and changed permissions to take effect without waiting for token expiry.

Authorisation uses named permissions and six seeded tenant roles. A tenant lifecycle gate restricts suspended tenants to readonly, billing, and export access. Platform administrators are represented by a nullable tenant and a dedicated flag.

Strengths:

- Passwords are hashed rather than encrypted or stored directly.
- Permissions are enforced on the server.
- User and tenant state are rechecked per request.
- Cross-tenant contact tests exist.
- Suspended clients retain controlled access and export capability.

Gaps and concerns:

- The server falls back to `"dev-secret"` when `JWT_SECRET` is missing. A production process could start with a known signing secret.
- The browser stores the bearer token in `localStorage`, making token theft possible if an XSS vulnerability is introduced.
- There are no refresh tokens, server-side sessions, token revocation records, device/session management, or secure logout invalidation.
- Login and signup have no rate limiting, progressive delay, account lockout, bot protection, or abuse monitoring.
- MFA, password reset, email verification, invitation, user management, and role management flows are absent.
- Login without a subdomain searches by email globally even though email uniqueness is tenant-scoped. This can be ambiguous and increases platform-admin authentication risk.
- JWT issuer, audience, algorithm allow-list, and token version controls are not explicit.
- Authentication and authorisation events are not comprehensively audited.

## 9. Styling approach

Styling is a single global CSS file using:

- CSS custom properties for tenant brand and semantic colours;
- CSS Grid and Flexbox for layout;
- shared classes for cards, panels, forms, tables, buttons, pills, modals, and landing content; and
- one media query focused primarily on the landing page.

This is lightweight and easy to understand, but it is not yet a documented design system. Class names are global, component states are not systematically modelled, and accessibility tokens are not established. White-label colours can produce inaccessible contrast because no contrast validation is evident.

The authenticated shell uses a fixed 220-pixel sidebar and many fixed multi-column/table layouts. That approach is not sufficient for the required mobile-responsive product.

## 10. Existing modules

### Implemented or substantially represented

- Multi-tenant signup and tenant lifecycle
- Authentication and seeded role-based permissions
- Tenant white-label branding
- CRM contacts
- Deal pipeline
- Activities/tasks data model and create API
- Products and warehouses
- Stock ledger, stock levels, opening balances, and adjustments
- Purchase orders and receiving
- Double-entry accounting journal
- Chart of accounts
- Exchange-rate snapshots and USD/ZWG transaction support
- Invoicing, VAT, payments, voiding, COGS, and stock synchronisation
- Expenses
- Dashboard, trial balance, profit and loss, balance sheet, aged receivables
- Subscription plans, trials, invoicing, dunning states, suspension, and reactivation
- Tenant data export
- Platform tenant and audit views
- Monthly billing cron
- Critical-path integration tests

### Partially represented

- Banking: schema exists, but bank import, reconciliation, and mature bank workflows do not.
- User/role administration: schema and permissions exist, but tenant-facing management APIs and UI are absent.
- Activities: creation and contact-detail retrieval exist, but complete task/calendar workflows are absent.
- Dunning: events are stored, but message delivery adapters are absent.
- White-labeling: colours and logo fields exist, but complete custom-domain and brand governance are not implemented.
- Mobile: some responsive public-page CSS exists, but the authenticated application is not fully responsive.
- Localisation: Zimbabwean currency and regulatory fields exist, but language infrastructure does not.

## 11. Missing modules and platform capabilities

Based on the existing roadmap, source, and VAKA foundation documents, notable missing areas include:

- English, Shona, and Ndebele localisation infrastructure and translated content
- VAKA AI orchestration, retrieval, permissions, evaluations, audit, and user experience
- Tenant user invitations, administration, role editing, MFA, reset, and session management
- Bank statement import and reconciliation
- Payment-gateway integration for platform and customer payments
- Invoice PDF generation and delivery
- Email, SMS, and WhatsApp notification delivery
- ZIMRA fiscalisation integration
- HR and payroll, subject to professional review
- Native or progressive mobile application capabilities
- Resource centre/help content
- Complete customer/vendor statements and accounts payable workflows
- Quotations/estimates, sales orders, credit notes, and recurring invoices
- Inventory transfers, counts, richer costing, and replenishment workflows
- Procurement approvals and supplier payment workflows
- Workflow automation, notifications, integrations, and webhooks
- Product analytics, observability, support tooling, and incident operations

These should not all be started at once. Security, data integrity, platform architecture, localisation, and user administration should precede broad module expansion.

## 12. Code quality concerns

### High priority

- `App.tsx` and `routes.ts` are large concentration points.
- Extensive `any` usage weakens type safety across database results, middleware, API data, and frontend state.
- No linting, formatting, type-check, or full verification scripts are defined at root.
- No committed migration history is present.
- Frontend tests and focused unit tests are absent.
- Integration tests share and mutate a real database without visible isolation/cleanup strategy.

### Medium priority

- Validation schemas are embedded in routes instead of shared with API contracts and clients.
- Database rows are often converted to ad hoc objects without stable response types.
- Business constants and policy values are embedded in modules.
- Audit event naming and coverage lack a central contract.
- Native browser prompts/alerts bypass consistent validation and accessible UI patterns.
- Some comments claim stronger universal guarantees than the route-by-route implementation demonstrates.
- The Dockerfile installs development tooling into a production image and runs TypeScript through `tsx` rather than producing a minimal compiled artifact.

### Positive quality signals

- Domain intent is well commented.
- Important financial operations are relatively small and readable.
- Critical invariants are encoded in services, not only described.
- Tests target rollback, tenant isolation, billing state, multi-currency, and ledger balance rather than superficial rendering.

## 13. Security concerns

| Priority | Concern | Why it matters |
|---|---|---|
| Critical | Known JWT fallback secret | A misconfigured production deployment could issue and accept forgeable tokens. Startup should fail without a strong secret. |
| High | Permissive reflected CORS | Any origin is reflected. Production origins and tenant domains need an explicit allow-list and correct cache headers. |
| High | Tokens in `localStorage` | A future XSS flaw could expose bearer tokens. A hardened cookie/session design or carefully justified token architecture is needed. |
| High | No auth rate limiting or abuse protection | Login and signup are exposed to brute force, credential stuffing, and automated tenant creation. |
| High | Related-record tenant consistency is not universally enforced | A supplied foreign ID may exist in another tenant. Every relation must be validated and database constraints strengthened. |
| High | No security middleware baseline beyond a few headers | CSP, permissions policy, request limits by endpoint, dependency policy, and other production controls need explicit design. |
| Medium | Platform-admin authentication shares the general login flow | Administrative access deserves a distinct, strongly protected path with MFA and detailed auditing. |
| Medium | Incomplete audit coverage | Some business and administrative changes cannot be reliably reconstructed from audit logs. |
| Medium | White-label URL acceptance | Remotely hosted logos can introduce privacy, tracking, content, and availability concerns without asset controls. |
| Medium | No explicit secrets validation | Database, cron, admin seed, and JWT configuration need startup validation and rotation procedures. |
| Medium | Sensitive metadata governance is undefined | Audit records, exports, logs, and future AI prompts need minimisation and retention rules. |

This review did not attempt exploitation. A dedicated threat model, dependency audit, and penetration test are still required.

## 14. Scalability concerns

- The monthly billing job loads every subscription, processes tenants sequentially, and has no visible distributed lock or idempotency key. Concurrent or retried jobs may duplicate work.
- Serverless instances can each open a pool of 20 PostgreSQL connections. Connection management needs a serverless-compatible strategy or managed pooling.
- Many list endpoints return unpaginated sets or fixed recent limits without cursors.
- Financial reports compute live from raw journal rows. This is correct for integrity but will require indexing, query analysis, and eventually controlled summaries as data grows.
- The frontend ships as one application bundle without route-level splitting.
- The API and UI concentration files increase team coordination cost as contributors grow.
- There is no cache policy, queue, event/outbox pattern, background worker architecture, or retry/dead-letter design.
- No observability baseline exists for latency, errors, database saturation, billing jobs, tenant activity, or financial workflow failures.
- External provider abstractions are not established for messages, payments, files, AI models, or fiscalisation.
- Country-specific concepts remain embedded in shared code, which will make market expansion expensive unless localisation boundaries are introduced early.

## 15. Localisation readiness

### Ready or useful foundations

- Unicode-capable TypeScript/PostgreSQL stack
- Tenant-level base currency
- USD and ZWG enum and exchange-rate snapshots
- Zimbabwe-specific tax and registration fields
- Central CSS that can be adapted for variable text length

### Not ready

- No internationalisation library, locale routing, translation catalogue, or content extraction
- No tenant or user locale/time-zone preference
- English strings are embedded throughout React, API errors, audit metadata, and seeded account names
- Currency formatting is hard-coded to `en-US` and `$`/`ZWG`
- Dates and numbers do not consistently use user locale/time zone
- Database enums and business terminology assume Zimbabwe-specific choices
- No translation QA or professional review workflow for English, Shona, and Ndebele
- No tests for translated text expansion, fallback, pluralisation, or locale formats

Assessment: **localisation awareness exists in documentation and currency behavior, but the application is not localisation-ready in implementation.**

## 16. AI readiness

### Useful foundations

- Tenant IDs and server-side permission checks provide a basis for scoped AI tools.
- Audit logs provide a pattern for recording material AI-assisted actions.
- Domain services expose deterministic accounting, invoicing, inventory, billing, and report operations that AI could call through controlled tools.
- Structured PostgreSQL data can support grounded summaries and recommendations.

### Missing foundations

- No AI provider, model gateway, orchestration layer, prompt/version management, or tool protocol
- No AI-specific authorisation, data minimisation, consent, retention, or provider policy
- No prompt-injection or untrusted-content boundary
- No evaluation suite for factuality, financial correctness, tenant leakage, localisation, actions, latency, or cost
- No human-confirmation design for consequential actions
- No model/action audit schema
- No streaming, retry, timeout, quota, budget, or graceful-degradation behavior
- No approved English, Shona, or Ndebele AI evaluation data

Assessment: **the domain model is a promising substrate, but VAKA is not currently AI-enabled or operationally AI-ready.** AI should be introduced through permission-aware tools around deterministic services, not through direct database access or autonomous financial writes.

## 17. Mobile responsiveness

### Current evidence

- The public landing page includes one breakpoint at 640 pixels.
- Cards and public pricing grids use responsive `auto-fit` layouts.
- The authentication box uses a viewport-relative maximum width.
- Forms use flexible rows in a few places.

### Material gaps

- The authenticated shell has a fixed 220-pixel sidebar with no mobile navigation state.
- The main content area uses desktop-oriented padding and has no small-screen override.
- Two- and three-column form grids do not collapse at mobile widths.
- CRM kanban uses four fixed columns.
- Business data is presented in wide tables without a documented responsive strategy.
- Modal sizing is constrained, but interactions inside modals are not comprehensively adapted for small screens.
- Several actions use browser `prompt()` and `alert()`, which do not provide a consistent or accessible mobile workflow.
- No automated viewport, touch, orientation, reduced-motion, keyboard, or mobile accessibility tests were found.
- No offline, reconnect, low-bandwidth, or installable progressive-web-app behavior was found.

Assessment: **the public page has basic responsiveness, but the authenticated VAKA application is not ready to be described as mobile-responsive.** Core workflows need deliberate small-screen design and device testing rather than isolated CSS patches.

## 18. Capability readiness

| Capability | Readiness | Evidence and gap |
|---|---|---|
| English | Partial | English is the current hard-coded interface language. It works as source copy but is not managed through a localisation system. |
| Shona | Not ready | No translation catalogue, language selector, locale preference, reviewed terminology, or Shona test coverage exists. |
| Ndebele | Not ready | No translation catalogue, language selector, locale preference, reviewed terminology, or Ndebele test coverage exists. |
| VAKA AI | Not ready | The domain services are useful foundations, but there is no provider, orchestration, permission policy, audit model, evaluation suite, or AI user experience. |
| Multi-tenant companies | Substantially implemented; hardening required | Tenant IDs, RBAC, tenant-scoped queries, lifecycle gates, and isolation tests exist. Related-record constraints, broader isolation tests, and database defence-in-depth remain necessary. |
| CRM | Early functional | Contacts, deals, stages, activities, pipeline UI, and contact detail aggregation exist. Search, pagination, workflow depth, communication history, automation, and richer task management are missing. |
| Accounting | Strong early core | Double-entry journal, accounts, invoices, payments, expenses, VAT, multi-currency snapshots, and core reports exist. Reconciliation, credit notes, period controls, approvals, statements, tax workflows, and professional validation remain. |
| Inventory | Strong early core | Products, warehouses, stock ledger, levels, adjustments, opening balances, POs, receiving, COGS, and oversell prevention exist. Transfers, counts, richer costing, serial/batch tracking, replenishment, and broader tests remain. |
| Payroll | Not ready | PAYE/NSSA accounts appear in the chart template, but no employee, pay-run, deduction, filing, approval, or payroll security workflow exists. Professional Zimbabwean review is mandatory before implementation. |
| White-label branding | Partial | Tenant colours, logo URL, subdomain, custom-domain field, and runtime CSS variables exist. Accessible contrast enforcement, managed assets, complete custom domains, email/document branding, and brand governance are absent. |
| Zimbabwe-first localisation | Partial | USD/ZWG, Zimbabwean tax/registration fields, ZIMRA-oriented numbering, and a Zimbabwe chart template exist. Language support, fiscalisation, local payments, reviewed compliance, and configuration boundaries remain incomplete. |
| Africa-wide expansion | Architectural intention only | Tenant configuration and currency patterns help, but currencies, tax, chart of accounts, language, document, payment, and country rules remain embedded or limited. A market-adapter architecture and country-by-country research are needed. |

Overall, VAKA is most ready in its multi-tenant transactional core, accounting, and inventory. It is partially ready in CRM, white-label branding, and Zimbabwe-specific operation. It is not yet ready for multilingual delivery, payroll, VAKA AI, or defensible Africa-wide expansion.

## 19. Recommended next 10 development tasks

These tasks are ordered to reduce existential risk before expanding surface area.

1. **Create a production security baseline.** Fail startup when required secrets are absent; restrict CORS; add rate limiting and abuse controls; define secure headers/CSP; validate environment configuration; and document secret rotation.

2. **Complete a tenant-isolation and authorisation hardening pass.** Inventory every endpoint and relationship, validate tenant ownership for all referenced records, strengthen database constraints, consider PostgreSQL row-level security, and expand cross-tenant tests.

3. **Establish database migration and recovery discipline.** Commit versioned migrations, define safe deploy/rollback procedures, test backup restoration, and add production-compatible connection pooling.

4. **Strengthen authentication and tenant administration.** Design secure sessions or a hardened token lifecycle; add invitations, email verification, password reset, session revocation, role/user management, admin MFA, and comprehensive auth audit events.

5. **Create an engineering quality gate.** Add root scripts for formatting, linting, type-checking, tests, builds, and migration checks; introduce CI; isolate test databases; and add focused unit/API/frontend coverage.

6. **Modularise without rewriting.** Split routes by domain, split the React monolith into typed feature modules, establish shared API contracts, add routing/error boundaries, and preserve existing behavior with regression tests.

7. **Implement the localisation foundation.** Add locale preferences and translation infrastructure; externalise copy; define locale-aware currency/date/number handling; and create reviewed English, Shona, and Ndebele terminology and QA workflows.

8. **Make core workflows mobile-responsive and accessible.** Redesign navigation, tables, forms, kanban, and dialogs for small screens and touch; replace prompts/alerts; test keyboard and screen-reader behavior; and create responsive acceptance tests.

9. **Add observability and reliable background processing.** Introduce structured logs, request IDs, metrics, traces, alerting, job locking/idempotency, queues or an outbox where appropriate, and operational dashboards for billing and financial workflows.

10. **Build the VAKA AI foundation with one bounded use case.** Define provider and privacy policy, permission-aware tool contracts, audit records, evaluations, budgets, confirmation gates, and safe failure behavior; then pilot a read-only executive business summary before enabling actions.

## 20. Overall assessment

VAKA OS has a credible transactional nucleus and clear product intent. Its append-only ledgers, tenant scoping, transaction boundaries, lifecycle policy, and critical-path tests are valuable assets worth preserving.

The next stage should not maximise feature count. It should turn the current compact application into a secure, operable, typed, localisable, mobile-ready platform. Once those foundations are reliable, new modules and VAKA AI can expand without weakening the trust on which the product depends.
