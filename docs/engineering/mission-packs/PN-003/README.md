# PN-003 — Directory enquiries → CRM leads

**Programme:** PN — Business Network · **Status:** DONE (2026-07-15)
**Flag:** `network.directory` · **Migration:** `0043_directory_enquiries.sql`
(adds `accept_enquiries` to business_profiles + `directory_enquiries`)

## Consent and privacy model

- A business receives enquiries ONLY if its owner opted in
  (`acceptEnquiries`) AND republished — the check reads the frozen
  published snapshot, so consent follows the same publish/freeze semantics
  as everything else in PN.
- Self-enquiry blocked (also a DB CHECK). Sender is identified by its
  canonical company name only, plus an optional reply email.
- **Rate limit:** 10 enquiries per sender tenant per rolling day (409).
- **Nothing enters the recipient's CRM automatically.** Enquiries land in a
  register (`crm.read`); converting one to a contact
  (tagged `directory-lead`) or dismissing it is an explicit `crm.write`
  action. Every send/receive/convert/dismiss is audited (received is
  audited in the recipient tenant with a system actor).

## Routes (dark behind `network.directory`)

`POST /network/directory/:id/enquire` (any member of sender tenant),
`GET /network/enquiries` (crm.read),
`POST /network/enquiries/:id/convert|dismiss` (crm.write).

## Verification (scratch Postgres, 2026-07-15)

business-profile 18/18 — consent-off 409, opt-in republish enables, self
blocked 400, explicit convert creates exactly one tagged contact (proven
absent before), double-handling 409, rate limit trips within 12 sends.
Regression critical + migration-hub + finance tenant-isolation 27/27;
typecheck clean.

## Follow-ups

PN-004 reviews/moderation; notification to the recipient on new enquiry
(wire to P1-004 when the notification inbox surfaces it); web UI.
