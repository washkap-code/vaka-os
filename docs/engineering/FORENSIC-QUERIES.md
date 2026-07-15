# VAKA read-only forensic queries

**Status:** P9-005 operational baseline
**Schema checked:** 2026-07-15

These PostgreSQL queries support an authorised incident investigation. They are
evidence views, not production repair tools. Every SQL block in this document is
a single `SELECT` statement.

## Safety and interpretation rules

1. Use a database identity technically restricted to read-only access,
   preferably against an approved replica or snapshot when incident freshness
   permits.
2. Record incident ID, operator, environment, query/document version, exact UTC
   run time, parameter values, row count, evidence destination and export
   checksum outside the database.
3. Always bind `:tenant_id`. Historical queries also bind `:window_start` and
   `:window_end`; the interval is half-open: start is included; end is excluded.
4. Use UTC ISO-8601 values for time parameters. Do not silently substitute a
   local timezone.
5. Minimise selected fields. Standard session queries deliberately exclude
   `token_hash`, `refresh_token_hash` and `previous_refresh_token_hash`.
6. Keep each tenant's evidence separate. Cross-tenant scope requires explicit
   Incident Commander and data-protection authorisation.
7. Preserve raw results before redaction or transformation. Restrict exports as
   incident evidence.
8. Do not infer that an action did not occur merely because no audit row was
   found. Audit coverage is material but not complete for every historical or
   failed event.

Named placeholders use `:name` notation. Bind them through the approved query
client; do not interpolate untrusted text.

## Current evidence boundaries

- `audit_logs` contains tenant-scoped material events with `user_id`, action,
  entity and JSON metadata. It is immutable and must never be changed during an
  investigation.
- `user_sessions` records successful authenticated session creation and
  activity/revocation state. It does not prove every failed sign-in attempt;
  deployment/security telemetry must be preserved separately.
- `ip_hash` is a one-way correlation value, not a recoverable IP address.
- Tenant successful sign-ins use `security.session_created`. Platform workforce
  events use `platform_audit_logs` and are outside these tenant queries.
- Feature flips use `platform.feature.enabled` and
  `platform.feature.disabled`; the audit event is historical evidence and
  `tenant_feature_flags` shows current state.
- `audit_logs` alone is not the authoritative complete ledger. Financial
  posting queries therefore read `journal_entries` and append-only
  `journal_lines`, then link audit events whose metadata includes the journal
  entry ID.

## 1. All audited actions by one user in a UTC window

Use this for a tenant actor timeline. A `NULL` `user_id` represents a system or
unattributed event and is intentionally excluded.

```sql
SELECT
  al.id,
  al.tenant_id,
  al.user_id,
  al.action,
  al.entity_type,
  al.entity_id,
  al.metadata,
  al.created_at
FROM audit_logs AS al
WHERE al.tenant_id = CAST(:tenant_id AS uuid)
  AND al.user_id = CAST(:user_id AS uuid)
  AND al.created_at >= CAST(:window_start AS timestamptz)
  AND al.created_at < CAST(:window_end AS timestamptz)
ORDER BY al.created_at ASC, al.id ASC;
```

## 2. All tenant role, permission and access-lifecycle changes

This includes current event names for user creation/status and accountable
ownership, plus role/permission event and entity patterns for present/future
writers. Review metadata rather than assuming that every matching row changed a
permission.

```sql
SELECT
  al.id,
  al.tenant_id,
  al.user_id AS actor_user_id,
  al.action,
  al.entity_type,
  al.entity_id AS affected_entity_id,
  al.metadata,
  al.created_at
FROM audit_logs AS al
WHERE al.tenant_id = CAST(:tenant_id AS uuid)
  AND al.created_at >= CAST(:window_start AS timestamptz)
  AND al.created_at < CAST(:window_end AS timestamptz)
  AND (
    al.action IN (
      'security.user_created',
      'security.user_active',
      'security.user_disabled',
      'security.tenant_ownership_established'
    )
    OR al.action LIKE 'security.%role%'
    OR al.action LIKE 'security.%permission%'
    OR al.entity_type IN ('role', 'permission', 'tenant_ownership')
    OR al.metadata ? 'role'
    OR al.metadata ? 'permissions'
  )
ORDER BY al.created_at ASC, al.id ASC;
```

## 3. All successful sign-ins for a tenant

One `user_sessions` row represents a successful authenticated session. The
left join surfaces the expected tenant audit event without hiding a session if
its audit evidence is missing. This output contains a hashed network
correlation value and still requires restricted handling.

```sql
SELECT
  us.id AS session_id,
  us.tenant_id,
  us.user_id,
  us.client_type,
  us.app_version,
  us.device_description,
  us.ip_hash,
  us.assurance_level,
  us.created_at AS signed_in_at,
  us.last_seen_at,
  us.idle_expires_at,
  us.absolute_expires_at,
  us.revoked_at,
  us.revoked_by,
  us.revoked_reason,
  al.id AS session_created_audit_id,
  al.created_at AS session_created_audit_at
FROM user_sessions AS us
LEFT JOIN audit_logs AS al
  ON al.tenant_id = us.tenant_id
 AND al.action = 'security.session_created'
 AND al.entity_type = 'session'
 AND al.entity_id = us.id::text
WHERE us.tenant_id = CAST(:tenant_id AS uuid)
  AND us.created_at >= CAST(:window_start AS timestamptz)
  AND us.created_at < CAST(:window_end AS timestamptz)
ORDER BY us.created_at ASC, us.id ASC;
```

## 4. Session creation, refresh, replay and revocation events

Use this to reconstruct tenant session security actions around suspicious
activity. Pair it with the successful-sign-in query; audit rows alone do not
show current expiry/revocation state.

```sql
SELECT
  al.id,
  al.tenant_id,
  al.user_id AS actor_user_id,
  al.action,
  al.entity_id AS session_id,
  al.metadata,
  al.created_at
FROM audit_logs AS al
WHERE al.tenant_id = CAST(:tenant_id AS uuid)
  AND al.created_at >= CAST(:window_start AS timestamptz)
  AND al.created_at < CAST(:window_end AS timestamptz)
  AND al.action IN (
    'security.session_created',
    'security.session_refreshed',
    'security.session_refresh_replay',
    'security.session_revoked'
  )
ORDER BY al.created_at ASC, al.id ASC;
```

## 5. All feature-flag flips with current state

The audit row is the historical event. Current state may differ after later
flips; both values are shown. A missing current row means the catalogue default
is off, but the historical audit event remains evidence.

```sql
SELECT
  al.id AS audit_id,
  al.tenant_id,
  al.user_id AS actor_user_id,
  al.created_at AS changed_at,
  al.metadata ->> 'featureKey' AS feature_key,
  CASE al.action
    WHEN 'platform.feature.enabled' THEN TRUE
    WHEN 'platform.feature.disabled' THEN FALSE
  END AS state_set_by_event,
  al.metadata ->> 'note' AS event_note,
  tff.enabled AS current_enabled,
  tff.note AS current_note,
  tff.updated_by AS current_updated_by,
  tff.updated_at AS current_updated_at
FROM audit_logs AS al
LEFT JOIN tenant_feature_flags AS tff
  ON tff.tenant_id = al.tenant_id
 AND tff.feature_key = (al.metadata ->> 'featureKey')
WHERE al.tenant_id = CAST(:tenant_id AS uuid)
  AND al.created_at >= CAST(:window_start AS timestamptz)
  AND al.created_at < CAST(:window_end AS timestamptz)
  AND al.action IN (
    'platform.feature.enabled',
    'platform.feature.disabled'
  )
ORDER BY al.created_at ASC, al.id ASC;
```

## 6. Current tenant feature-flag state

Use this only to establish the present row state. It is not a replacement for
the historical flip query.

```sql
SELECT
  tff.id,
  tff.tenant_id,
  tff.feature_key,
  tff.enabled,
  tff.note,
  tff.updated_by,
  tff.created_at,
  tff.updated_at
FROM tenant_feature_flags AS tff
WHERE tff.tenant_id = CAST(:tenant_id AS uuid)
ORDER BY tff.feature_key ASC;
```

## 7. All financial postings by source with balance and linked audit evidence

This is the complete journal-entry view for the creation window, ordered by
source. `posting_date` is the accounting date; `created_at` is when the entry
was persisted. `linked_audit_events` may be empty because some business audit
events do not carry `journalEntryId`; the journal must not be excluded for that
reason.

```sql
SELECT
  je.id AS journal_entry_id,
  je.tenant_id,
  je.date AS posting_date,
  je.created_at,
  je.source_type,
  je.source_id,
  je.memo,
  je.created_by,
  COALESCE(SUM(jl.debit), 0) AS total_debit,
  COALESCE(SUM(jl.credit), 0) AS total_credit,
  COALESCE(SUM(jl.debit), 0) - COALESCE(SUM(jl.credit), 0) AS balance_difference,
  (
    SELECT jsonb_agg(
      jsonb_build_object(
        'auditId', al.id,
        'action', al.action,
        'actorUserId', al.user_id,
        'createdAt', al.created_at
      )
      ORDER BY al.created_at ASC, al.id ASC
    )
    FROM audit_logs AS al
    WHERE al.tenant_id = je.tenant_id
      AND al.metadata ->> 'journalEntryId' = je.id::text
  ) AS linked_audit_events
FROM journal_entries AS je
INNER JOIN journal_lines AS jl
  ON jl.journal_entry_id = je.id
WHERE je.tenant_id = CAST(:tenant_id AS uuid)
  AND je.created_at >= CAST(:window_start AS timestamptz)
  AND je.created_at < CAST(:window_end AS timestamptz)
GROUP BY
  je.id,
  je.tenant_id,
  je.date,
  je.created_at,
  je.source_type,
  je.source_id,
  je.memo,
  je.created_by
ORDER BY je.source_type ASC, je.created_at ASC, je.id ASC;
```

Any non-zero `balance_difference` is a finance-integrity escalation. Preserve
the result and source evidence; do not attempt an in-place correction.

## 8. Financial posting totals grouped by source

Use this roll-up to identify which source families posted in the incident
window and to prioritise the detailed query. Counts are journal entries, not
line counts.

```sql
SELECT
  je.source_type,
  COUNT(DISTINCT je.id) AS journal_entry_count,
  MIN(je.created_at) AS first_created_at,
  MAX(je.created_at) AS last_created_at,
  COALESCE(SUM(jl.debit), 0) AS total_debit,
  COALESCE(SUM(jl.credit), 0) AS total_credit,
  COALESCE(SUM(jl.debit), 0) - COALESCE(SUM(jl.credit), 0) AS balance_difference
FROM journal_entries AS je
INNER JOIN journal_lines AS jl
  ON jl.journal_entry_id = je.id
WHERE je.tenant_id = CAST(:tenant_id AS uuid)
  AND je.created_at >= CAST(:window_start AS timestamptz)
  AND je.created_at < CAST(:window_end AS timestamptz)
GROUP BY je.source_type
ORDER BY je.source_type ASC;
```

## Evidence handling after a query

- Review row count and tenant/time bounds before opening or sharing results.
- Stop and escalate if the output contains an unexpected tenant, credential
  field or materially broader personal/financial data than authorised.
- Export only when retention is necessary; record checksum and restricted
  location in the incident evidence register.
- Keep the unmodified original. Record every redaction or derived report and
  link it back to the original evidence ID.
- Treat mismatches between audit, session, feature and journal records as an
  investigation finding. Preserve both sides and state confidence/limitations.
