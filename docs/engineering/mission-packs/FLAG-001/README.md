# FLAG-001 + FLAG-002 — Tenant feature flags and build-dark gating

**Status:** Implemented
**Programme:** Part II enabler (`knowledge-system/13-roadmaps/MASTER-BUILD-PLAN.md` §15)
**Priority:** Critical — every Part II mission depends on this
**Depends on:** P1-001 kernel; platform-staff RBAC (P9-008/P6-013); step-up (P9-011)

## Outcome

Every future module can ship to production **default-OFF** per tenant.
Platform staff flip features per tenant through audited, step-up-protected
admin endpoints. Gated APIs fail closed with `FEATURE_DISABLED`; the web shell
hides gated navigation. Nothing dark is marketed as live.

## Design

- **Catalogue, not free text.** `FEATURE_CATALOGUE`
  (`server/src/platform/features/types.ts`) is the closed list of gateable
  feature keys, one per Part II programme surface (e.g. `network.directory`,
  `blackbook.directory`, `mail.hub`, `documents.workspace`,
  `workflow.centre`, `migration.hub`, `verify.centre`, `store.catalogue`,
  `intelligence.advisors`, `capital.centre`, `developer.api`). Unknown keys
  are rejected on write and treated as disabled on read (fail closed).
- **Kernel service.** `FeatureFlagService` registered as
  `FEATURE_FLAG_SERVICE` in the platform runtime, backed by a Postgres store
  (`tenant_feature_flags`, migration 0036). Reads are per-tenant; a missing
  row means OFF.
- **Gating middleware.** `requireFeature(key)` (after `authenticate`) returns
  `403 { error: "FEATURE_DISABLED" }` when the tenant's flag is off. The UI is
  never the security boundary.
- **`/me` exposes `features: string[]`** (enabled keys only) so the web shell
  and navigation gate consistently; `visibleWorkspaceNavigation` accepts an
  optional feature requirement per nav item.
- **Admin control.** `GET /platform/tenants/:id/features`
  (`platform.tenants.read`) lists the catalogue with enabled state;
  `PUT /platform/tenants/:id/features/:key` (`platform.settings.manage` +
  step-up) toggles with a required note. Every toggle writes an audit event
  (`platform.feature.enabled|disabled`) on the target tenant.
- **No entitlement/billing semantics yet** — PS-001 maps plans/modules onto
  these flags later.

## Data model (migration 0036, additive + idempotent)

`tenant_feature_flags`: tenant, feature_key, enabled (default false), note,
updated_by, timestamps; unique (tenant, feature_key).

## Verification

`server/tests/feature-flags.test.ts`: default-OFF for every catalogue key;
unknown key fails closed on read and is rejected on write; middleware returns
FEATURE_DISABLED then passes after enable; `/me` reflects enabled flags;
platform-admin list/toggle with audit evidence; tenant-user cannot toggle;
tenant isolation (enabling for tenant A leaves B off).
