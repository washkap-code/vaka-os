# Business Network directory core

This module owns tenant-managed public business profiles and the authenticated
platform directory. A profile references the canonical `Company` row
(`tenants`) through `company_id`; legal name, registration number and current
verification badge status are never copied into the profile snapshot.

## Deliberate cross-tenant read boundary

Directory discovery is the explicit exception to normal tenant-scoped reads.
`NetworkDirectorySearchProvider` is the only cross-tenant query path. It always
requires both `status = 'published'` and `visibility = 'public'`, and projects
only the frozen `published_snapshot` plus the Company's live legal name,
registration number and a boolean-derived verification status. It does not
select `tenant_id` or editable draft columns. Slug detail reads use the same
predicate and projection.

Draft edits, capabilities and contacts cannot appear cross-tenant until the
profile passes the `business-profile.publish.review` workflow. The temporary
`NETWORK_PROFILE_AUTO_APPROVE` flag defaults to `true`; disabling it leaves a
submission in `pending_review` for the future moderation queue.

There is no marketplace, review, referral, trust-score or advertising logic in
this module.
