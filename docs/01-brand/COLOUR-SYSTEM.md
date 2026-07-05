# VAKA Colour System

**Status:** Directional tokens pending formal design approval
**Owner:** Brand and Design
**Last reviewed:** 2026-07-04

## 1. Purpose

The VAKA colour system should make the brand feel premium, African, modern, intelligent, trustworthy, enterprise-grade, and simple.

Colour supports hierarchy and meaning. It must never compensate for weak information architecture or communicate status without text or an additional visual cue.

## 2. Core palette

The following values are recommended working tokens. Final production values must be approved through the VAKA Brand Book and tested for WCAG 2.2 AA contrast.

### Primary dark

| Token | Working value | Use |
|---|---:|---|
| `--vaka-ink-950` | `#0C0E0B` | Footer and deepest backgrounds |
| `--vaka-ink-900` | `#11130F` | Hero, navigation, premium sections |
| `--vaka-ink-800` | `#1A1D18` | Elevated dark surfaces |
| `--vaka-ink-700` | `#292D25` | Secondary dark controls |

The primary dark is deep graphite rather than flat black. It should feel composed and substantial.

### Warm light

| Token | Working value | Use |
|---|---:|---|
| `--vaka-paper-50` | `#FFFEF9` | Cards and primary light surfaces |
| `--vaka-paper-100` | `#F6F4ED` | Main light background |
| `--vaka-paper-200` | `#F0EDE4` | Secondary panels |
| `--vaka-paper-300` | `#DED9CC` | Borders and dividers |

Use warm light instead of clinical pure white for large content areas.

### VAKA gold

| Token | Working value | Use |
|---|---:|---|
| `--vaka-gold-300` | `#E1C87D` | Primary accent on dark backgrounds |
| `--vaka-gold-500` | `#C4A661` | Icons, highlights, active states |
| `--vaka-gold-700` | `#846C34` | Accessible text accent on light backgrounds |

Gold is an accent, not a dominant field colour. Use it for important actions and intelligence moments, not every decorative element.

### Neutral text

| Token | Working value | Use |
|---|---:|---|
| `--vaka-text-primary` | `#171914` | Primary text on light |
| `--vaka-text-secondary` | `#5F6359` | Secondary text on light |
| `--vaka-text-on-dark` | `#FFFEF9` | Primary text on dark |
| `--vaka-text-muted-dark` | `#B6B9AF` | Secondary text on dark |

## 3. Functional colours

Functional colours remain distinct from the brand gold.

| Meaning | Working token | Working value |
|---|---|---:|
| Success | `--vaka-success-600` | `#2F7648` |
| Warning | `--vaka-warning-600` | `#9A6227` |
| Error | `--vaka-error-600` | `#A43B3F` |
| Information | `--vaka-info-600` | `#356B8C` |

Each functional state must include:

- a text label;
- an icon, pattern, or shape where useful;
- accessible foreground/background contrast; and
- a non-colour method of communicating meaning.

## 4. Usage hierarchy

### Dark

Use for:

- hero;
- primary navigation;
- footer;
- VAKA AI;
- trust and security;
- final CTA; and
- focused executive moments.

### Warm light

Use for:

- product explanation;
- outcome cards;
- pricing;
- FAQs;
- reading-heavy content; and
- operational product surfaces.

### Gold

Use for:

- primary marketing CTA;
- active navigation state;
- important numeric emphasis;
- VAKA AI markers;
- selected tabs;
- small icons; and
- meaningful focus points.

Do not use gold for:

- large body-text areas;
- every button;
- warning states;
- decorative gradients across the page; or
- low-contrast text.

## 5. White-label separation

VAKA’s public brand palette and tenant white-label palettes serve different purposes.

- Public VAKA surfaces use approved VAKA tokens.
- Authenticated tenant workspaces may use tenant brand colours.
- Security, error, warning, and success semantics must remain governed and must not be replaced by tenant colours.
- Tenant-selected colours require contrast validation before use.

## 6. Accessibility

Minimum target: **WCAG 2.2 AA**.

- Normal text requires at least 4.5:1 contrast.
- Large text requires at least 3:1 contrast.
- Interactive boundaries and focus indicators require at least 3:1 against adjacent colours.
- Do not place small gold text on warm-white backgrounds without testing.
- Test all states, including hover, focus, disabled, selected, error, and high-contrast preferences.
- Validate approved tenant branding combinations.

## 7. Motion and gradients

Use gradients only to create quiet depth. They must not become the brand.

Avoid:

- neon glow;
- multicolour startup gradients;
- glassmorphism;
- decorative particles;
- constant shimmer; and
- colour animation that distracts from business content.

## 8. Photography and colour

Photography should feel natural, specific, and credible. Do not force heavy colour grading to make imagery appear “African.”

Prefer:

- real working environments;
- authentic Zimbabwean and African businesses;
- natural skin tones;
- restrained backgrounds; and
- product colour that remains legible beside imagery.

Avoid overused stock photos, staged handshake imagery, and generic corporate scenes.

## 9. Implementation rules

- Define tokens centrally rather than repeating hex values.
- Use semantic aliases in components.
- Keep marketing and authenticated-product token namespaces clear.
- Add automated contrast checks where practical.
- Document every token change.
- Do not promote these working values to final brand status without design approval.
