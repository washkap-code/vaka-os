# P6-003 — Universal Workbench

**Status:** Approved by the product owner for implementation  
**Programme:** 6 — Application shell, navigation and workbench  
**Type:** Permission-aware, responsive workspace dashboard  
**Depends on:** P6-001 design tokens; P6-002 responsive shell; existing tenant dashboard read model

## Outcome

Authenticated tenant users with reporting access receive one calm, action-oriented
workbench that helps them identify what needs attention and move into the permitted
CRM, invoicing, stock or sales workflow. Existing figures remain read-only evidence;
the workbench does not calculate, post or mutate accounting, stock or CRM records.

## Current behaviour

- The Dashboard presents month-to-date finance cards, receivables ageing, low-stock
  rows and open pipeline rows from `GET /reports/dashboard`.
- Useful exceptions are separated into panels, but there is no prioritised summary,
  no direct next-action navigation and no role-aware quick-action area.
- Several dashboard strings remain embedded in `App.tsx`, and table layouts are not
  deliberately adapted into workbench cards at small widths.
- P6-002 provides permission-aware in-memory navigation. URL/deep-link routing is a
  later mission, so this mission may navigate only to permitted module destinations.

## Target behaviour

1. Extract the dashboard presentation into a named `UniversalWorkbench` component.
2. Keep `GET /reports/dashboard` and all existing financial, receivables, stock and
   pipeline calculations unchanged.
3. Present a priority summary derived only from the existing response: overdue
   invoice count, low/out-of-stock count and open pipeline deal count.
4. Add accessible visual performance views using the same existing response:
   month-to-date income/expenses/profit comparison, receivables ageing by currency,
   and open-pipeline stage/value distribution. Every chart includes a title, unit,
   period/as-at context and a table or text equivalent; honest zero/negative states
   remain visible and chart geometry never becomes the authoritative calculation.
5. Show role-aware next actions only when the user has the corresponding visible
   destination: Contacts, Invoices, Products & Stock and Sales Pipeline.
6. Add explicit module links from each evidence panel, again only when permitted.
   A link opens the existing module list; it does not imply a record deep link.
7. Move all newly touched workbench copy into the typed English catalogue. Shona and
   Ndebele enablement remains gated on P6-006 through P6-009 and qualified review.
8. Use semantic sections, headings, lists and native buttons with visible focus.
9. At 320 CSS pixels, prioritise evidence into cards and avoid shell-level overflow;
   wide evidence tables retain a controlled scrolling fallback.
10. Preserve loading, empty and negative/positive financial states without inventing
   data, recommendations or AI behaviour.

## User and measurable business result

- **User:** Owner-managers and authorised finance, sales and stock users.
- **Problem:** The current dashboard reports facts but does not clearly organise the
  next operational action.
- **Result:** A user can identify the three principal exception categories and enter
  an authorised workflow from one screen.
- **Measure:** Pure workbench tests cover priority derivation and permission-filtered
  actions; component tests cover navigation, empty states and accessible labels;
  the production build and existing server suite remain green.

## Trust, permissions and audit

- Existing server permissions remain authoritative. The workbench receives only the
  already verified visible navigation model and cannot create access.
- No tenant/user identifier is accepted by the component or added to the dashboard
  request. Existing authenticated server tenant derivation remains unchanged.
- No write, posting, approval, deletion or communication occurs, so no new audit
  event is created. Source workflows continue to own their audit evidence.
- Financial values are rendered exactly as returned by the existing report contract;
  no client-side accounting calculation is introduced.

## Scope

- Universal Workbench component, typed view model, accessible chart primitives and
  pure priority/action helpers.
- Dashboard call-site wiring to permission-filtered navigation.
- Typed English copy, responsive/token-governed styles and focused frontend tests.
- Mission/completion documentation and roadmap status reconciliation.

## Out of scope

- Backend report/schema/calculation changes; journal or stock writes.
- URL routing, record deep links, saved/personalised layouts or draggable widgets.
- A product-wide shell/admin redesign; that follows as a separate governed visual
  modernisation mission using the same design language established here.
- Approvals engine, tasks/deadlines, payables, cash forecasting or recommendations.
- AI summaries/actions, push/polling, analytics tracking or new dependencies.
- P6-004 universal search/command palette and P6-005 full WCAG core-flow audit.

## Acceptance criteria

- This Mission Pack is committed before implementation.
- Dashboard data and finance/inventory behaviour remain unchanged.
- Priority counts are deterministic and never fabricate unavailable data.
- Quick actions and panel links are filtered through the P6-002 visible-navigation
  model and cannot reveal an unpermitted destination.
- Keyboard users can activate every action; landmarks and headings are coherent.
- Representative 320/768/1280-width layout checks show no workbench-level overflow.
- Focused tests, web typecheck/build, design-token conformance, server typecheck and
  relevant full verification pass, with any environment block reported explicitly.

## Rollback

Revert the workbench component, catalogue, styles, tests and Dashboard call-site.
Restore the prior inline Dashboard presentation. No migration, data correction,
session revocation or production database rollback is required.
