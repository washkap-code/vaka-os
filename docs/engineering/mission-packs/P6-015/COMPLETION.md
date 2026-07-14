# P6-015 Completion Report

**Date:** 2026-07-14
**Status:** Released (PR #77); local, remote, production and live-bundle gates passed

## Delivered

- Extracted a typed, presentation-independent homepage model for supported
  locale resolution, stable navigation targets and module-tab key selection.
- Reused that model in the live landing component without changing rendered
  output, auth callbacks, routes, content, prices, trial duration or status claims.
- Added a focused homepage regression gate with a built-in negative self-test.
- Protected sign-in/signup entry, mobile-menu semantics, tabs and panels, native
  FAQ disclosure, language fallback, representative-data labels, VAKA AI and
  payroll availability, 30-day trial wording, package values and responsive CSS.
- Added the homepage gate to web/root scripts and the normal GitHub quality workflow.
- Captured desktop, tablet and mobile browser baselines for the next visual Mission Pack.

## Verification evidence

- Homepage regression gate and negative fixture: 4/4 tests passed.
- Web TypeScript: passed.
- Design-token conformance: passed with 236 governed tokens.
- Accessibility conformance and negative fixture: passed.
- Shell/navigation permission tests: 13/13 passed.
- Invoice PDF regression tests: 3/3 passed.
- Web production build: 46 modules; 460.23 kB main JavaScript / 123.73 kB
  gzip; 103.30 kB CSS / 18.98 kB gzip; no size warning.
- Browser access: Sign in reached the sign-in form and Open your free VAKA
  workspace reached Create your company.
- Browser interaction: Arrow Right selected CRM from the Overview module tab;
  the first FAQ disclosure opened; the mobile menu exposed one named navigation
  and `aria-expanded="true"`.
- Language fallback: selecting ChiShona retained document language `en`, stored
  the `sn` preference and announced that verified ChiShona and isiNdebele
  translations remain in review.
- Accuracy: one visible illustrative-product label and one explicit VAKA AI
  not-live notice were found.
- Reflow: document width equalled viewport width at 320, 640 and 1440 CSS pixels.
  The primary workspace CTA measured 50px high at every viewport.
- Browser runtime: body content present; no Vite overlay, console error or page error.
- Visual baselines reviewed at desktop and mobile; existing long-form composition
  is usable but is not the final VAKA homepage design.
- `git diff --check`: passed.
- No server, API, schema, auth, billing, accounting, inventory or data files changed.

## Product invariants preserved

No tenant, permission, credential, audit, plan, price, trial, entitlement,
accounting, tax, currency, stock, document, analytics-provider or production-data
behaviour changed. The page remains public; sign-in and signup continue through
the existing application callbacks. VAKA AI and payroll remain clearly not live.

## Baseline handoff to P6-016

P6-016 may modernise the hero, hierarchy, product composition, module/status
treatment, spacing, responsive navigation and section rhythm only while these
contracts remain green. The design-system skill reinforced using existing
semantic tokens and documenting variants/states instead of creating one-off
marketing styles. P6-016 must preserve the working access callbacks, honest
availability labels, English fallback, 44px minimum actions, reduced motion and
zero page-level overflow.

## Remaining limits

This mission is regression protection, not a visual redesign, accessibility
certification, Core Web Vitals field study or approved ChiShona/isiNdebele
translation. Browser screenshots remain local release evidence and are not
shipped in the application bundle.

## Release evidence

P6-015 was squash-merged through [PR #77](https://github.com/washkap-code/vaka-os/pull/77)
at commit `2411581166056ff4eb50d58b15e6e32c7c28796b` after the GitHub quality gate,
Vercel preview and preview-comment checks passed. The post-merge `main` quality
gate [run 29315248738](https://github.com/washkap-code/vaka-os/actions/runs/29315248738)
passed in 2m59s. GitHub deployment `5437031106` recorded the exact commit in
the Production environment with state `success`. The public site served the
matching `/assets/index-DbTt0hsz.js` and `/assets/index-DZGhws9Y.css` bundle.

Rollback requires reverting only the helper, test, script, CI and documentation
commits; no database rollback is required.
