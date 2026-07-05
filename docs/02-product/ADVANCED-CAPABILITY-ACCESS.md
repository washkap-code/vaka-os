# Advanced Capability Access Model

**Status:** Product permission direction; implementation pending  
**Owner:** Product, Security, Finance, and Engineering  
**Last reviewed:** 2026-07-05

## 1. Principle

Advanced mobile, messaging, document scanning, and payment capabilities are
granted by named permissions and approval policies—not merely by hiding
buttons or relying on broad job titles.

The existing seeded roles are a starting point. Tenants may create constrained
custom roles later, but no role may bypass server-side tenant, lifecycle,
permission, audit, or segregation-of-duties controls.

## 2. User types

- **Owner:** accountable tenant authority; approves high-risk configuration and
  exceptions.
- **Administrator:** manages users, ordinary workspace configuration, devices,
  and approved integrations within delegated limits.
- **Finance Manager/Approver:** approves financial workflows, allocations,
  refunds, write-offs, and reconciliation exceptions.
- **Accountant/Bookkeeper:** creates and issues invoices, reviews scanned
  documents, allocates confirmed payments, and reconciles.
- **Sales/Account Manager:** creates customers, quotations, and invoice drafts;
  may send issued invoices when granted.
- **Procurement Officer:** captures supplier documents, creates purchases, and
  submits them for approval.
- **Stock Controller/Warehouse User:** scans products, receives stock, counts,
  and submits controlled adjustments.
- **Cashier/POS User:** accepts approved payment methods and issues receipts
  within till/location limits.
- **Customer Support/WhatsApp Agent:** handles assigned conversations and sends
  approved non-financial templates.
- **Auditor/Read-only:** views permitted records and evidence without changing
  them.
- **Customer Portal User:** accesses only the customer account and documents
  explicitly linked to that identity.
- **Supplier Portal User:** accesses only the supplier workflows explicitly
  linked to that identity.
- **Platform Administrator:** VAKA operational role, outside ordinary tenant
  access, strongly protected and fully audited.
- **System Integration:** non-human principal limited to one provider,
  tenant/scope, webhook, or background job.

## 3. Capability matrix

Legend: **Y** default candidate, **A** explicit approval/delegation, **R**
read-only, **—** no default access.

| Capability | Owner | Admin | Finance approver | Accountant | Sales | Procurement | Stock | Cashier | Support | Auditor |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Use mobile app | Y | Y | Y | Y | Y | Y | Y | Y | Y | R |
| View executive dashboard | Y | A | Y | A | limited | limited | limited | limited | — | R |
| Create invoice draft | Y | A | Y | Y | Y | — | — | limited | — | R |
| Issue invoice | Y | A | Y | Y | A | — | — | — | — | R |
| Send issued invoice | Y | A | Y | Y | A | — | — | — | A | R |
| Download invoice PDF | Y | A | Y | Y | A | limited | — | limited | A | R |
| View detailed ageing | Y | A | Y | Y | limited | — | — | — | limited | R |
| Capture supplier invoice/receipt | Y | A | Y | Y | — | Y | A | A | — | R |
| Approve/post captured document | Y | — | Y | A | — | — | — | — | — | R |
| Configure company logo/templates | Y | Y | — | — | — | — | — | — | — | R |
| Connect/import bank account | Y | A + MFA | A | A | — | — | — | — | — | R |
| Prepare bank reconciliation | Y | — | Y | Y | — | — | — | limited | — | R |
| Approve reconciliation exception | Y + approval | — | Y + approval | — | — | — | — | — | — | R |
| Connect payment provider | Y | A + MFA | — | — | — | — | — | — | — | R |
| View payment confirmations | Y | A | Y | Y | limited | limited | — | Y | limited | R |
| Allocate/reconcile payment | Y | — | Y | Y | — | — | — | limited | — | R |
| Refund/write off/override | Y + approval | — | Y + approval | — | — | — | — | — | — | R |
| Configure WhatsApp channel | Y | A + MFA | — | — | — | — | — | — | — | R |
| Manage templates/consent policy | Y | A | A | limited | A | limited | — | — | A | R |
| Use shared WhatsApp inbox | Y | A | limited | limited | Y | limited | — | — | Y | R |
| Bulk outbound messaging | A | A | — | — | A | — | — | — | A | R |
| Stock scan/count | Y | A | — | — | limited | A | Y | limited | — | R |
| Approve stock adjustment | Y | A | — | — | — | — | A where separated | — | — | R |

The final defaults require pilot validation. “A” means a tenant owner or
authorised administrator explicitly grants a narrower permission; it does not
mean the UI alone unlocks the feature.

## 4. Required named permissions

Evolve broad existing permissions toward capabilities such as:

- `invoices.create`, `invoices.issue`, `invoices.send`,
  `invoices.download`;
- `receivables.read`, `receivables.reconcile`;
- `documents.capture`, `documents.review`, `documents.post`;
- `branding.manage`;
- `payments.read`, `payments.initiate`, `payments.allocate`,
  `payments.reconcile`, `payments.refund`, `payments.configure`;
- `bank_accounts.read`, `bank_connections.manage`,
  `bank_statements.import`, `bank_transactions.match`,
  `bank_reconciliation.prepare`, and `bank_reconciliation.approve`;
- `communications.read`, `communications.send`,
  `communications.templates.manage`, `communications.configure`,
  `communications.bulk_send`;
- `inventory.scan`, `inventory.count`, `inventory.adjust`,
  `inventory.adjust.approve`;
- `mobile.devices.manage`; and
- `integrations.manage`.

Permission migration must preserve current roles and use versioned,
reviewable changes.

## 5. Mandatory approval boundaries

- A provider webhook may confirm provider status but cannot grant itself
  permission or alter tenant configuration.
- Payment-provider connection, credential rotation, refunds, write-offs, bulk
  messages, and automation require step-up authentication.
- The same user should not both prepare and approve high-value refunds,
  write-offs, supplier payments, payroll release, or stock adjustments above
  configured thresholds.
- OCR-created drafts require human review before posting.
- AI-created message or invoice drafts require the same human authority as
  manually prepared work.
- Platform administrators do not gain routine access to tenant business data.

## 6. Mobile device policy

- Every session is attributable to user, tenant, device, and app version.
- Owners/admins may revoke devices, subject to safeguards preventing abuse.
- Lost-device revocation invalidates sessions without deleting authoritative
  server records.
- Sensitive offline data follows role, tenant, retention, and remote-session
  policy.
- Shared POS/warehouse devices use constrained device/session modes and never a
  shared owner credential.
