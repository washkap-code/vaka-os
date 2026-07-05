# VAKA User Guide

**Applies to:** Current early-access web application
**Last reviewed:** 2026-07-05

## Sign in

Open [https://www.vakaos.com/](https://www.vakaos.com/) and choose **Sign in**.

Company users enter their email, password and company subdomain when required.
Platform administrators use the same sign-in page; an approved platform-admin
account is recognised server-side and opens the platform console. There is no
separate public super-admin URL today.

Never share passwords or place credentials in email, chat or documentation.

## Create a company

Choose **Open workspace** or **Create your company**, then provide the company
name, subdomain, base currency, owner details, password, plan and optional
referral code.

VAKA creates the workspace with initial roles, chart of accounts, warehouse and
trial subscription. A referral records who introduced the company; it does not
grant that person access.

## Dashboard

The current dashboard shows month-to-date income, expenses and net profit plus
receivables ageing separated by USD and ZWG. It includes current, 1–30, 31–60,
61–90 and 90+ day buckets and overdue invoices requiring attention.

## Contacts and CRM

Use **Contacts** to create customers and suppliers. Use **Sales Pipeline** to
track opportunities. Self-service contact import is planned but not yet live.

## Invoices

Use **Invoices** to create drafts, select customers, add service/stock lines,
choose USD or ZWG, set tax/dates, issue invoices, record payments and void
according to permissions.

Branded PDF download, email/WhatsApp delivery and customer payment links remain
planned capabilities.

## Products, stock and purchasing

Use **Products & Stock** for products/services, prices, tax and stock settings.
Use **Purchase Orders** to order and receive supplier stock. Authorised stock
and purchasing actions update accounting through server-controlled workflows.

Mobile barcode scanning and bulk import remain planned.

## Reports

Current reports include trial balance, profit and loss, balance sheet and aged
receivables. Financial/statutory outputs may require qualified review.

## Billing

**Billing & Plan** shows the subscription and platform invoices. Suspended
companies retain their data with controlled read, billing and export access.

## Branding, languages and mobile

The data model supports company logo and brand colours, but managed logo upload
and consistent branded documents are not complete.

English is the current interface language. Shona and Ndebele are required but
not yet fully available. The website is responsive; dedicated downloadable iOS
and Android applications remain planned.

## Imports and document capture

The approved import direction includes CSV/XLSX, bank formats, APIs, email,
mobile camera capture, invoices, receipts, statements, business cards,
barcodes/QR codes and assisted migration.

These features are not yet live. See
`docs/02-product/SELF-SERVICE-IMPORTS-AND-DOCUMENT-CAPTURE.md`.

## Platform administration

The current platform console shows tenant, lifecycle status, plan, registered
user count and dates, with a controlled billing-cycle action.

It cannot yet report reliable users currently logged on and does not yet have
the full management analytics suite. See `PLATFORM-ADMIN-GUIDE.md` and
`docs/02-product/PLATFORM-ADMIN-ANALYTICS-SPEC.md`.

## Security

- Use a unique strong password.
- Sign out on shared devices.
- Do not share owner or administrator credentials.
- Verify company, currency, tax and customer data before issuing records.
- Report suspected unauthorised access immediately.

