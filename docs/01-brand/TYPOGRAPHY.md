# VAKA Typography

**Status:** Directional system pending font and licence approval
**Owner:** Brand and Design
**Last reviewed:** 2026-07-04

## 1. Purpose

VAKA typography should feel modern, precise, confident, highly readable, enterprise-ready, and simple.

Typography carries most of the brand’s intelligence. It should create hierarchy without decoration and remain clear across mobile devices, desktop applications, reports, invoices, dashboards, and translated content.

## 2. Typeface direction

Use a high-quality sans-serif family with:

- excellent screen rendering;
- a broad weight range;
- clear numerals;
- tabular figures;
- strong currency and punctuation support;
- complete characters required for English, ChiShona, and isiNdebele;
- reliable web performance; and
- an appropriate commercial or open-source licence.

Until an approved family is selected, use:

```css
font-family:
  Inter,
  "Avenir Next",
  "Segoe UI",
  system-ui,
  -apple-system,
  sans-serif;
```

The final choice must be tested with native-language content and financial data before approval.

## 3. Typographic character

VAKA type should feel:

- assured rather than loud;
- contemporary rather than fashionable;
- human rather than playful;
- executive rather than bureaucratic; and
- spacious rather than sparse.

Avoid decorative display fonts, compressed enterprise fonts, novelty African type treatments, and excessive font-family combinations.

## 4. Recommended scale

Use fluid sizing for marketing pages and stable role-based tokens inside the application.

| Role | Working size | Weight | Line height |
|---|---:|---:|---:|
| Display XL | `clamp(3.5rem, 8vw, 7.5rem)` | 700–800 | 0.92–1.00 |
| Display L | `clamp(2.75rem, 6vw, 5rem)` | 700–800 | 0.98–1.05 |
| Heading 1 | `clamp(2.25rem, 4vw, 3.5rem)` | 700 | 1.05–1.12 |
| Heading 2 | `clamp(1.75rem, 3vw, 2.5rem)` | 650–700 | 1.10–1.18 |
| Heading 3 | `1.25rem` | 650–700 | 1.25 |
| Lead | `clamp(1.05rem, 1.6vw, 1.3rem)` | 400–500 | 1.55–1.70 |
| Body | `1rem` | 400 | 1.55–1.70 |
| Small | `0.875rem` | 400–600 | 1.45–1.60 |
| Label | `0.75rem` | 650–750 | 1.30–1.45 |

Text below `0.75rem` should be exceptional, tested, and never required to understand a workflow.

## 5. Display typography

Display headings should:

- contain one clear idea;
- use tight but readable tracking;
- avoid manual line breaks that fail at other widths;
- remain stable rather than rotating messages;
- use sentence or title case according to context; and
- stay readable at 200% zoom.

Do not use long centred paragraphs beneath large display headings.

## 6. Product typography

Product interfaces prioritise scanning and precision.

- Use tabular numerals for money, quantities, dates, and reports.
- Align comparable financial values consistently.
- Do not use weight alone to communicate status.
- Keep labels close to the values they describe.
- Use sentence case for buttons, labels, and navigation.
- Reserve uppercase for short eyebrows, codes, and compact metadata.
- Ensure table text remains readable on modest mobile devices.

## 7. Numbers and currencies

Financial typography is a core VAKA requirement.

- Use locale-aware grouping and decimal separators.
- Use exact currency labels where ambiguity is possible.
- Distinguish USD and ZiG clearly.
- Use tabular numerals in ledgers and comparisons.
- Preserve minus signs, parentheses, decimal precision, and exchange rates accurately.
- Never abbreviate a value in a way that changes financial meaning.

## 8. Localisation

Typography must support English, ChiShona, and isiNdebele without a visual quality hierarchy.

Test:

- diacritics and special characters;
- translated text expansion;
- line breaking;
- buttons and navigation;
- long business and legal terms;
- financial tables;
- small screens; and
- screen-reader pronunciation where relevant.

Do not shrink translated text to force it into an English-sized container. Adapt the layout.

## 9. Accessibility

- Body text should normally be at least 16 CSS pixels.
- Do not disable browser zoom.
- Maintain readable line length, generally 45–80 characters.
- Preserve visible focus indicators.
- Use semantic heading levels.
- Avoid all-uppercase paragraphs.
- Ensure link styling is not dependent on colour alone.
- Test at 200% and 400% zoom.
- Respect user font-size preferences where possible.

## 10. Performance

- Prefer system fonts until an approved web font provides clear brand value.
- If using a web font, subset only after language coverage is verified.
- Preload only critical font files.
- Use `font-display: swap`.
- Avoid loading unnecessary weights.
- Set fallback metrics to minimise layout shift.

## 11. Implementation tokens

Recommended semantic tokens:

```css
--type-display-xl
--type-display-lg
--type-heading-1
--type-heading-2
--type-heading-3
--type-lead
--type-body
--type-small
--type-label
--leading-tight
--leading-body
--tracking-display
--tracking-label
```

Components should consume semantic roles rather than one-off sizes.

## 12. Review checklist

1. Is the hierarchy obvious without relying on colour?
2. Is body copy comfortable to read?
3. Are financial figures aligned and unambiguous?
4. Does the layout survive translated text?
5. Are labels large enough on mobile?
6. Does the page work at 200% zoom?
7. Are font files licensed and performant?
8. Does the result feel calm, intelligent, and enterprise-grade?
