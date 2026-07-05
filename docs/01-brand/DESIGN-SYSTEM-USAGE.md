# VAKA Design System Usage

**Status:** Implemented foundation; staged adoption
**Owner:** Brand, Design, and Frontend Engineering
**Last reviewed:** 2026-07-04

## 1. Purpose

This document describes the first implementation of the VAKA design-system foundation. It provides semantic tokens and reusable, accessible primitives without redesigning or replacing working application modules.

The implementation lives in `web/src/design-system/`.

## 2. Compatibility decision

Three styling scopes currently coexist:

1. The authenticated application continues to use tenant-controlled `--brand` and `--accent` variables.
2. The public homepage continues to use its isolated `--v-*` working variables.
3. New design-system work uses `--vaka-*` tokens and `vds-` component classes.

Do not alias or remove the first two scopes until a separate, tested migration is approved. This separation protects tenant white-label behaviour and limits visual regression risk.

## 3. Token categories

`tokens.css` defines:

- working VAKA palette values and semantic colour aliases;
- light and dark themes;
- functional success, warning, danger, and information colours;
- typography roles, weights, leading, and tracking;
- a four-point spacing scale;
- radius and elevation scales;
- motion durations and easing;
- responsive breakpoint reference values;
- container and reading widths;
- control sizing and layer order; and
- focus-indicator dimensions.

Components must use semantic aliases such as `--vaka-color-text` and `--vaka-color-surface`. Palette values such as `--vaka-gold-500` should normally be referenced only by semantic tokens.

The breakpoint variables are reference values only because standard CSS does not allow custom properties in media-query conditions. Media queries must use their documented equivalents:

| Name | Width |
|---|---:|
| Small | `30rem` |
| Medium | `48rem` |
| Large | `64rem` |
| Extra large | `80rem` |

## 4. Themes

Light is the default theme. Apply a theme to the smallest practical application boundary:

```tsx
<div data-vaka-theme="light">{children}</div>
<div data-vaka-theme="dark">{children}</div>
```

Do not use dark mode as a decorative inversion. Every state, border, focus indicator, and data visualisation must remain legible.

Tenant colours must not replace governed functional colours. Before a tenant brand colour is used for text, controls, or focus, validate its contrast and define a safe fallback.

## 5. Primitives

The initial exports are:

- `Button` and `ButtonGroup`;
- `Input`, `Textarea`, and `Select`;
- `Checkbox` and `Radio`;
- `Badge`, `Card`, and `Alert`;
- `Tooltip`;
- `Dialog` and its `Modal` alias;
- `Dropdown`;
- `Tabs`;
- `Skeleton`;
- `EmptyState`;
- `PageContainer`, `Section`, and `Heading`; and
- `Logo`.

Import from the design-system entry point:

```tsx
import { Button, Input, PageContainer } from "./design-system";

export function WorkspaceForm() {
  return (
    <PageContainer>
      <Input
        label={messages.companyName}
        hint={messages.companyNameHint}
        name="companyName"
      />
      <Button type="submit">{messages.save}</Button>
    </PageContainer>
  );
}
```

The example intentionally receives user-facing language through a `messages` object. Production components must not introduce literal user-facing strings.

## 6. Accessibility contract

The foundation targets WCAG 2.2 AA:

- normal text contrast: at least `4.5:1`;
- large text contrast: at least `3:1`;
- interactive boundaries and focus indicators: at least `3:1` against adjacent colours;
- visible keyboard focus with both width and offset;
- semantic labels and descriptions for form controls;
- error state communicated with text and `aria-invalid`, not colour alone;
- reduced-motion preferences respected;
- increased-contrast and forced-colour modes supported;
- modal behaviour built on the native `dialog` element; and
- tab semantics and arrow-key navigation included.

Contrast values remain working values until automated contrast checks and design approval are added. Every future token change must re-test light, dark, hover, focus, disabled, error, and selected states.

## 7. Component constraints

- `Input`, `Textarea`, and `Select` require a `label`; hide it visually only with `hideLabel`.
- `Dialog` requires `closeLabel` because the visible close symbol has no reliable spoken name.
- `Tabs` requires `ariaLabel`.
- `Logo` requires an accessible `ariaLabel`; the current logo is a text treatment pending approved vector assets.
- `Tooltip` must wrap an already interactive or keyboard-focusable child. Never hide essential instructions only in a tooltip.
- Functional badges and alerts must include meaningful text; colour is supplementary.
- Loading skeletons are decorative and hidden from assistive technology. Provide a nearby live status when loading information is important.

## 8. Preview

From `web/`, run:

```bash
npm run dev
```

Then open:

```text
http://localhost:5173/design-system-preview.html
```

The preview is a development-only page and includes light/dark switching, controls, feedback states, dialog behaviour, responsive examples, and loading/empty states. It is not linked from the product and does not change application routing.

## 9. Adoption sequence

1. Approve the working tokens and run formal contrast checks.
2. Add component-level interaction and accessibility tests.
3. Add visual regression baselines for light, dark, mobile, and increased-contrast states.
4. Select one low-risk public or authentication surface as the first migration.
5. Map legacy aliases to semantic tokens gradually.
6. Migrate module surfaces only through scoped tasks with screenshots, rollback, localisation, and regression evidence.

Do not replace legacy components in bulk. Preserve behaviour first, then migrate component by component.

## 10. Known limits

- Brand palette and typography remain directional pending approval.
- No approved vector logo asset exists; `Logo` is a restrained text treatment.
- The repository does not yet include frontend unit, accessibility, or visual-regression test infrastructure.
- Dropdown uses native `details`; advanced menu focus management may be needed for complex actions.
- Dialog support depends on modern browser native `dialog` behaviour.
- The existing product and homepage have not yet been migrated to these tokens or primitives.
