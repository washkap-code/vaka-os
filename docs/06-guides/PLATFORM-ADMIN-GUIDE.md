# VAKA Platform Administrator Guide

**Audience:** Authorised VAKA platform administrators
**Last reviewed:** 2026-07-05

## Sign in

1. Open [https://www.vakaos.com/](https://www.vakaos.com/).
2. Select **Sign in**.
3. Enter your named platform-admin email and password.
4. VAKA identifies the account server-side and opens the platform console.

There is no separate `/admin` login route.

The initial legacy platform-admin password comes from protected deployment
configuration and cannot be retrieved from source code. Never publish or share
it. Replace shared/legacy access with named administrators and MFA.

## Current console

The console currently lists company, subdomain, lifecycle status, subscription
plan, registered-user count, trial end and creation date.

It also provides a manual billing-cycle action. Use this only under an approved
procedure because it can issue subscription invoices and change tenant status.

## User counts

The current user count means registered users, not people online.

`lastLoginAt` cannot prove whether someone still has a valid session or is
actively using VAKA. Do not report it as “logged on now.”

Reliable presence requires server-side sessions, expiry/revocation, client
last-seen evidence, active-now/recently-active windows and separate unique-user
and multiple-session counts.

## Planned management analytics

The approved suite covers:

- company growth, activation and retention;
- subscriptions, collections and revenue;
- plan mix and package pressure;
- proper current/recent session aggregates;
- product/module adoption;
- imports and document-processing quality;
- customer-health indicators;
- referral and partner performance;
- reliability, integrations and security; and
- scheduled management reports and exports.

See `docs/02-product/PLATFORM-ADMIN-ANALYTICS-SPEC.md`. These capabilities are
not yet live.

## Data boundary

Platform administration does not grant routine access to customer invoices,
contacts, payroll, messages, files or detailed ledgers.

Exceptional support/security access requires a valid purpose, minimum scope,
approval, time limit, named actor and immutable audit evidence.

## Safe operating rules

- Use a named account and never share credentials.
- Require MFA when available.
- Confirm environment and date before billing actions.
- Do not edit production database records as ordinary support.
- Do not disclose tenant/user data without authorisation.
- Record and escalate errors and security events.

