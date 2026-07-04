# Deployment Architecture — Primary in Zimbabwe, Backups Abroad

**Requirement:** the platform runs on Zimbabwean servers; backups are held in a
foreign jurisdiction so a local disaster, seizure, or infrastructure failure can
never destroy client data.

## Topology

```
                    ┌──────────────────────────────────────────┐
                    │ PRIMARY — Zimbabwe (Harare data centre)   │
                    │  · App servers (Docker, 2× min)           │
                    │  · PostgreSQL 16 primary + local replica  │
                    │  · Nginx/HAProxy TLS termination          │
                    │  · UPS + generator-backed facility        │
                    └───────────────┬──────────────────────────┘
                                    │ nightly encrypted dumps +
                                    │ continuous WAL archiving (encrypted)
                                    ▼
                    ┌──────────────────────────────────────────┐
                    │ OFFSITE — foreign region                  │
                    │  e.g. AWS af-south-1 (Cape Town) S3       │
                    │  · AES-256 client-side encrypted archives │
                    │  · Object-lock (immutability) 35 days     │
                    │  · Warm-standby restore scripts tested    │
                    └──────────────────────────────────────────┘
```

## Zimbabwean hosting candidates (evaluate all three, commercial terms vary)

| Provider | Notes |
|---|---|
| **TelOne Data Centre (Harare)** | State-owned carrier facility; colocation + cloud offerings; verify current tier rating, SLA, and generator/fuel arrangements on site. |
| **Liquid Intelligent Technologies / Africa Data Centres** | Regional operator with Harare presence and strong fibre; typically the most enterprise-ready option; confirm current Harare capacity. |
| **Dandemutande / Utande** | Local ISP with hosting services; good secondary/DR-in-country candidate. |

**Selection checklist (do this in person):** generator + fuel contract and runtime,
UPS capacity, dual fibre routes, physical access controls, fire suppression,
written SLA with uptime credits, and the right to install your own locked rack.

**Realism note:** load-shedding and connectivity incidents are the single biggest
operational risk of in-country primary hosting. Mitigate with: N+1 app servers,
local Postgres streaming replica in a second rack/facility, aggressive health
checks, and a documented decision threshold for failing over to a restore in the
foreign region if the primary site is down beyond your RTO.

## Cross-border backup — legal position

Zimbabwe's Cyber and Data Protection Act [Chapter 12:07] permits transferring
personal data outside Zimbabwe **provided** the destination offers an adequate
level of protection and **POTRAZ is notified in advance** of the cross-border
arrangement. Action items:

1. Register/license with POTRAZ as data controller/processor **before** launch.
2. Notify POTRAZ of the backup arrangement (destination country, provider,
   encryption, purpose = disaster recovery only).
3. Encrypt client-side **before** upload (backups are unreadable to the foreign
   provider — this materially strengthens the adequacy position).
4. Record the arrangement in the DPA you sign with each client (template in
   `legal-templates/`).
5. Have Zimbabwean counsel confirm the notification wording — regulator guidance
   evolves.

## Backup implementation (scripts to install on the primary)

```bash
# /etc/cron.d/jonomi-backup — nightly 01:30 CAT
30 1 * * * postgres /opt/jonomi/backup.sh

# /opt/jonomi/backup.sh (age or GPG client-side encryption before upload)
#!/usr/bin/env bash
set -euo pipefail
STAMP=$(date +%Y%m%d-%H%M)
pg_dump -Fc jonomi_platform > /var/backups/jbp-$STAMP.dump
age -r "$BACKUP_PUBLIC_KEY" -o /var/backups/jbp-$STAMP.dump.age /var/backups/jbp-$STAMP.dump
aws s3 cp /var/backups/jbp-$STAMP.dump.age s3://jonomi-dr-backups/nightly/ \
  --region af-south-1 --storage-class STANDARD_IA
rm /var/backups/jbp-$STAMP.dump          # never leave plaintext at rest
find /var/backups -name '*.age' -mtime +7 -delete
```

Plus continuous WAL archiving (`archive_command` → encrypted → S3) for
point-in-time recovery between nightly dumps.

**Non-negotiables:** private encryption key stored offline (never on the server);
S3 bucket with Object Lock + versioning + separate restricted IAM credentials;
**quarterly restore drill** — a backup you have never restored is not a backup.

## Production hardening checklist

- TLS everywhere (wildcard cert for `*.<vaka-domain-tbd>` tenant subdomains)
- `JWT_SECRET` = 64 random bytes; rotate on any suspicion of compromise
- Postgres: `ssl=on`, `scram-sha-256`, no public exposure — app subnet only
- CORS locked to your domains (dev config in `app.ts` is permissive)
- Rate limiting on `/auth/*` (e.g. nginx `limit_req` 10/min/IP)
- Docker images pinned by digest; unattended security updates on hosts
- Cron: monthly billing run (`POST /platform/billing/run`, 1st of month 06:00 CAT)
- Log aggregation with 90-day retention; alerts on 5xx rate, replica lag, disk
- Wire dunning delivery to a Zimbabwean SMS/WhatsApp gateway for reminder events
