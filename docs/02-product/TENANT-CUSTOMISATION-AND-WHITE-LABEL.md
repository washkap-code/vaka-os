# VAKA Tenant Customisation and White-Label Experience

**Status:** Approved product direction; settings foundation implemented
**Owner:** Product, Brand, Security, Engineering, and Commercial
**Last reviewed:** 2026-07-05

## Outcome

Each company should experience VAKA as its own trusted operating workspace while
VAKA remains clearly responsible for the secure underlying platform.

## Personal profile

Every user may manage:

- display/full name;
- profile image when managed uploads are available;
- language, time zone, dates and number formats;
- notification preferences;
- password, MFA and own sessions; and
- accessibility preferences.

Email/identity changes require verification and security controls.

## Company identity

Authorised company owners/administrators may manage:

- company/trading name;
- managed logo and optional document logo;
- primary and accent colours with contrast validation;
- registration, tax and VAT identifiers;
- physical, postal, email, telephone and website details;
- branches and document addresses;
- invoice/payment instructions and approved footer;
- custom domain and branded sign-in where package-eligible; and
- approved “Powered by VAKA” treatment.

The live settings foundation supports personal name, company name, colour, logo
URL and core registration/address details. Managed logo upload, custom domains
and branded pre-login resolution remain implementation work.

## Managed logo upload

The completed upload must:

- accept only approved raster formats initially;
- validate MIME signature, dimensions and file size;
- scan unsafe content;
- store files in tenant-scoped object storage, not database text fields;
- create immutable versions and an active reference;
- use signed uploads and controlled public delivery;
- support crop/preview and accessible alternative treatment;
- audit upload, replace and removal; and
- remove old assets according to retention policy.

SVG should remain disabled until sanitisation is demonstrably safe.

## Branded workspace and login

After authentication, company logo, name and approved colours should appear in
navigation and key workspace surfaces.

Pre-login customisation requires a trustworthy tenant resolver based on company
subdomain or verified custom domain. It must never accept arbitrary client
branding parameters that enable phishing. The sign-in experience should show
company identity, VAKA trust/support links, security messaging and language
selection.

Unknown or invalid domains fall back to the standard VAKA sign-in page.

## Documents and communications

Invoices, quotations, statements, receipts, purchase orders, reports, emails
and portals should use a versioned company identity snapshot. Issued documents
must not change retrospectively when branding or company details change.

Templates should include applicable company name, logo, address, registration,
tax/VAT identifiers, contact details, invoice/payment details and document
footer. Required legal/tax fields override decorative customisation.

## Roles and entitlements

- Users may update their own profile.
- `settings.manage` controls company identity.
- Managed branding, custom domains and advanced template options may be
  package-entitled.
- Entitlements never replace server-side permissions.
- Platform staff do not customise a tenant routinely without an approved,
  audited support process.

## Accessibility and safety

- Reject or correct colour combinations that fail contrast requirements.
- Preserve semantic success, warning, error and security colours.
- Never allow custom HTML, scripts, remote tracking pixels or unsafe CSS.
- Proxy or tightly allow-list externally hosted logos during the transition to
  managed uploads.
- Prevent branding from obscuring VAKA security, consent or legal notices.

## Implementation order

1. Personal and company Settings UI.
2. Colour preview and workspace logo/name application.
3. Tenant-scoped managed logo storage and upload.
4. Invoice/document identity snapshots and branded PDFs.
5. Email/portal branding.
6. Verified company subdomains and branded sign-in.
7. Verified custom domains and advanced white-label controls.
8. Language, notification and accessibility preferences.

## Acceptance criteria

- Users can update their own name without changing permissions.
- Authorised users can update company identity and invoice details.
- Unauthorised users cannot change company branding.
- Logo assets are tenant-isolated, validated and auditable.
- Company colours remain accessible.
- Issued documents preserve their original identity snapshot.
- Custom-domain login cannot be used to impersonate another tenant.
- All labels and errors are localisation-ready.

