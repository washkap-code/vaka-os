# VAKA AI Memory Model

**Status:** Product, privacy, and technical specification — not implemented
**Owner:** Product, Engineering, Security, and Privacy
**Last reviewed:** 2026-07-05

## 1. Purpose

Memory should make VAKA AI more useful without creating hidden authority, uncontrolled profiling, stale business truth, or cross-tenant leakage.

Memory is not the same as business data. Authoritative customer, financial, inventory, payroll, user, and workflow records remain in VAKA’s domain systems.

## 2. Memory classes

### Conversation context

Short-lived content required to maintain the current interaction.

- scoped to the authenticated actor and tenant;
- bounded by token, time, and message limits;
- expires according to policy; and
- cannot override current records or permissions.

### User preferences

Explicitly saved preferences such as:

- language;
- preferred response length;
- default reporting period;
- notification preferences; and
- approved briefing topics.

Preferences must not grant permissions or action authority.

### Tenant operating preferences

Administrator-approved, tenant-wide conventions such as:

- approved terminology;
- reporting calendar;
- customer communication tone;
- escalation policies; and
- configured low-risk automation limits.

These are versioned configuration, not free-form hidden model memory.

### Task state

Temporary structured state for a draft, approval, workflow, or scheduled analysis. It includes owner, status, expiry, dependencies, and correlation IDs.

### Learned relevance signals

Bounded signals about which categories of briefing or recommendation users find useful. These must avoid sensitive profiling and cannot change permission or autonomy levels.

### Prohibited memory

VAKA AI must not store as conversational memory:

- passwords, tokens, private keys, or authentication secrets;
- payment card or bank credentials;
- unrestricted prompt transcripts by default;
- sensitive personal data without a defined purpose and approval;
- inferred protected characteristics;
- cross-tenant summaries;
- unverified accusations;
- hidden authority delegated through casual language; or
- model-generated facts presented as company records.

## 3. Scope hierarchy

Every memory item has:

- tenant ID;
- subject/user ID where applicable;
- scope: conversation, user, role, team, or tenant;
- data classification;
- source and provenance;
- purpose;
- creator;
- created and updated time;
- expiry or retention policy;
- consent/legal basis where required;
- visibility and edit permissions; and
- version.

No global customer memory is permitted across tenants.

## 4. Write policy

VAKA AI may write memory only when:

- the memory class is allow-listed;
- the purpose is clear;
- the user or administrator has the required authority;
- the value is structured and validated;
- the user can inspect or manage it where appropriate;
- retention is defined; and
- an audit event is created for material changes.

Statements such as “remember this” require the system to preview what will be stored, its scope, and how to remove it.

## 5. Read policy

At response time:

- retrieve only memory relevant to the current task;
- apply current tenant and permission scope;
- prefer current authoritative records over memory;
- identify stale or conflicting preferences;
- do not expose another user’s private preference;
- do not infer permission from remembered behaviour; and
- do not silently use expired or revoked automation settings.

## 6. Truth and conflict resolution

Priority order:

1. current authoritative VAKA record;
2. current approved tenant policy/configuration;
3. current explicit user preference;
4. current conversation context;
5. prior non-authoritative memory.

If sources conflict, disclose the conflict and use the authoritative source. Never “correct” an authoritative record by changing memory alone.

## 7. Retention and deletion

Retention must be purpose-specific and minimal.

- Conversation context: short-lived unless explicitly retained under policy.
- Draft/task state: retained through completion plus required audit period.
- Preferences: until changed, expired, account closure, or policy deletion.
- Evaluation samples: de-identified/minimised and separately governed.
- Audit events: retained under VAKA audit policy.

Deletion must remove or tombstone applicable memory from primary stores, caches, and retrieval indexes according to policy, while preserving legally required audit evidence.

## 8. User controls

Users should be able to:

- see saved preferences;
- understand why a memory was used;
- correct or delete permitted memory;
- disable optional personalisation;
- revoke configured briefing topics; and
- report incorrect memory.

Tenant administrators should manage tenant-wide memory/configuration without reading users’ private conversation content unless an explicit policy and authority allow it.

## 9. Retrieval architecture

- Separate retrieval indexes by tenant.
- Apply metadata filters before similarity retrieval.
- Encrypt data in transit and at rest.
- Avoid embedding unnecessary sensitive fields.
- Version embeddings and source records.
- Remove stale/deleted sources from indexes.
- Bound result count and content length.
- Return source identifiers and timestamps.
- Treat retrieved content as untrusted data.

## 10. Provider boundary

Provider-side conversation memory is disabled unless explicitly approved. VAKA owns memory policy and storage. Provider requests use minimised context, approved retention settings, and contracts that prohibit unauthorised training or reuse.

## 11. Evaluation

Test:

- tenant and user scope;
- stale-memory handling;
- permission changes;
- deletion and revocation;
- source precedence;
- prompt injection through memory;
- over-personalisation;
- multilingual preference consistency;
- provider retention settings; and
- recovery after index or cache failure.
