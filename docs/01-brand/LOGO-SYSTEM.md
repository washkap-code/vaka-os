# Logo System

**Status:** Approved v1
**Owner:** Brand
**Last reviewed:** 2026-07-11

## Purpose

Define the approved VAKA logos and the rules for using them.

## The mark

The VAKA mark is a **gold V over a foundation line on an ink tile**. The V is the initial and the builder's gable; the foundation line beneath it expresses the brand meaning — VAKA, from *kuvaka*, "to build". Nothing is built without a foundation.

- Source asset: `web/public/icons/vaka-mark.svg`
- Component: `web/src/design-system/Logo.tsx` (`VakaMark`, `VakaLogo`)

### Colours

| Element | Colour | Token |
|---|---|---|
| Tile | `#14171F` ink | near `--vaka-ink-900` |
| V | `#C9A227` gold | gold family |
| Foundation line | `#F6F6F3` warm white, 90% | paper family |

## Lockups

1. **Primary lockup** (`VakaLogo`): tile mark + "VAKA OS" wordmark. Used in the homepage navigation and footer.
2. **Mark only** (`VakaMark variant="tile"`): app icons, favicons, avatars, small spaces.
3. **Bare mark** (`VakaMark variant="bare"`): V + foundation line without the tile, for placement directly on ink surfaces.

## Rules

- Clear space: at least 25% of the mark's width on all sides.
- Minimum size: 20px mark; below that use the wordmark alone.
- Never recolour the V, stretch the mark, add effects, or place the tile version on busy imagery.
- The wordmark is set in the brand's heavy weight with `.06em` tracking; "OS" is gold at ~55% size.
- On light surfaces the wordmark is ink; on dark surfaces it is warm white. The mark itself is identical on both.

## Usage in code

```tsx
import { VakaLogo, VakaMark } from "./design-system";

<VakaLogo size={30} />                 // nav / footer lockup
<VakaMark size={24} variant="bare" />  // on ink surfaces
```

Favicon and PWA icons reference `/icons/vaka-mark.svg` from `web/index.html` and `manifest.webmanifest`.
