# Backup and Disaster-Recovery Runbook

**Status:** controlled evidence foundation implemented; production backup
scheduler/provider and a witnessed restore remain open launch gates.

This document distinguishes implemented VAKA capability from target operating
policy. A recorded manifest proves only that an authorised job or operator
reported backup evidence. A recorded restore drill proves only the bounded
operator assertions and calculations captured for that drill. Neither is a
substitute for provider telemetry, independent review or an actual recovery.

## 1. Current implementation evidence

VAKA currently provides:

- a versioned, privacy-minimised backup manifest contract;
- append-only backup manifest recording and platform audit evidence;
- an injected backup-job adapter boundary with no bound scheduler or provider;
- append-only restore-drill evidence linked to a successful backup manifest;
- server-calculated achieved RPO and RTO minutes;
- required checksum, schema, tenant-isolation, audit-continuity, sampled-ledger
  and applicable object-recovery assertions;
- a separate, one-time Principal Administrator review with recorder/reviewer
  segregation; and
- control-centre visibility that changes the restore gate to recorded only when
  accepted drill evidence exists.

VAKA does **not** currently claim:

- scheduled production backups are running;
- WAL/PITR or cross-region object replication is configured;
- an approved cloud/storage provider or key path is bound;
- alerting, restore orchestration, failover or DNS automation is active;
- a production backup has been restored successfully; or
- production RPO/RTO has been independently proven.

## 2. Draft recovery objectives requiring approval

The earlier programme target was RPO no more than 15 minutes and RTO no more
than four hours. These are draft launch objectives, not verified production
facts. The accountable executive, operations/security owners and approved
infrastructure provider must confirm objectives by service tier and market.

Every drill records its explicit target RPO and RTO. Product logic does not
hard-code one target for every market, legal entity, subscription or provider.

## 3. Target protected scope

Subject to approved provider design, retention, privacy and security review:

1. PostgreSQL full/base backups and continuous recovery data suitable for PITR.
2. Uploaded assets and generated documents in object storage.
3. Version-controlled infrastructure and migration definitions (without
   secrets).
4. Independently escrowed recovery keys and production configuration through an
   approved secret-management process, never source control or evidence fields.

Backups must be encrypted, access-controlled, monitored, retained under an
approved schedule and stored in an appropriate separate failure domain.

## 4. Controlled restore-drill procedure

Only approved operators may execute provider/database restore tooling outside
VAKA. Never paste commands containing credentials, signed URLs, dump contents
or tenant data into VAKA, tickets or chat.

1. Open a change/incident record and identify the authorised operator,
   environment, isolated target and approved drill window.
2. Select a successful immutable backup manifest and verify its provider-side
   checksum, encryption/access state and retention availability.
3. Restore into a non-production, network-isolated target with separate
   credentials. Never overwrite the source database or connect restored jobs,
   emails, webhooks or payment providers.
4. Record start, completion, intended recovery point and the point actually
   recovered through.
5. Run privacy-minimised verification:
   - schema/migration readiness;
   - tenant-isolation negative probes;
   - audit continuity/timestamp checks;
   - balanced sampled journals without exporting journal contents;
   - checksum verification; and
   - object recovery checks when objects are in scope.
6. Reconcile any asynchronous/provider effects before allowing a failover
   decision. A drill target must remain isolated and disposable.
7. Record the completed outcome in Super Admin → Operations → Restore drill
   evidence. Use opaque references and a bounded summary only.
8. A different Principal Administrator reviews the evidence. Acceptance is
   blocked unless outcome, RPO, RTO and every applicable integrity check pass.
9. Preserve failed/partial evidence, create remediation work and repeat with a
   new drill ID. Never edit or delete the original record.

## 5. Verification and acceptance

An accepted in-product record is necessary operational evidence, not final
assurance. Launch acceptance additionally requires:

- provider telemetry and immutable backup availability;
- independent observation or signed operational evidence;
- qualified accounting review of the ledger verification method;
- security review of isolation, access and secret handling;
- documented incident, communications, rollback and decision rights;
- remediation of all material drill findings; and
- executive acceptance of RPO/RTO and residual risk.

## 6. Failure scenarios and response

| Scenario | Controlled response |
|---|---|
| Primary database unavailable | Invoke the approved incident runbook; select failover/restore only with accountable approval and current recovery evidence. |
| Region/provider unavailable | Use the approved separate-failure-domain copy and provider procedure; record actual RPO/RTO and customer communications. |
| Ransomware or corruption | Isolate affected systems, preserve evidence, choose a verified recovery point before corruption and rotate exposed credentials. |
| Restore validation fails | Mark the drill partial/failed, reject launch evidence, retain the record and remediate before repeating. |
| Key operator unavailable | Use the approved on-call/escalation roster and independently escrowed runbook/keys; never share personal credentials. |

## 7. Evidence and privacy rules

- No tenant payload, customer record, journal content, password, key, token,
  connection string, signed URL or dump output enters a manifest or drill record.
- Backup and restore evidence is append-only. Corrections use a new record.
- Platform permissions, active workforce identity and audit apply to every
  record/review action.
- Tenant users cannot access platform recovery evidence.
- Retention and deletion of operational evidence require privacy, security and
  regulatory review; failed evidence must not be removed to improve a gate.

## 8. Current open gates

1. Approve infrastructure provider, scheduler, storage, secret and alert paths
   (OPS-015).
2. Approve service-tier RPO/RTO and backup retention.
3. Execute and independently witness staging, then production-safe restore
   drills using the approved provider runbook.
4. Prove alerting, escalation, reconciliation, communications and rollback.
5. Record accountable operational launch sign-off.
