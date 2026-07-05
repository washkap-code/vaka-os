# VAKA Localisation Architecture

**Status:** Technical standard
**Owner:** Engineering, Product, and Design
**Last reviewed:** 2026-07-04

## 1. Scope

Localisation covers language, formats, currency, country rules, documents, payroll, tax, integrations, support, mobile, and AI.

Launch languages:

- English;
- ChiShona; and
- isiNdebele.

## 2. UI architecture

- No visible copy permanently embedded in components.
- Typed translation keys.
- Independent locale catalogues.
- English fallback.
- Missing-key detection.
- Interpolation/pluralisation.
- Browser preference and user selection.
- Optional tenant default.
- Translated accessibility labels, metadata, validation, errors, notifications, and documents.

Suggested structure:

```text
src/locales/
  en/
  sn/
  nd/
```

Codes and naming require product/standards approval.

## 3. Canonical values

Store language-neutral values:

- statuses;
- permission codes;
- country/currency codes;
- dates/timestamps;
- exact amounts;
- quantities;
- tax/payroll rule identifiers; and
- event types.

Translate and format at presentation boundaries.

## 4. Formatting

Use locale-aware:

- date/time;
- time zone;
- numbers;
- currencies;
- percentages;
- pluralisation;
- names;
- addresses;
- phones;
- sort/search; and
- documents.

Historical financial meaning must not change with display locale.

## 5. Translation workflow

1. Approve English source.
2. Provide context/screenshots/variables.
3. Native/professional translation.
4. Specialist review for finance, payroll, legal, security, and AI.
5. In-product QA.
6. Accessibility/mobile review.
7. Versioned approval.

Machine-generated translations are not final approval.

## 6. Country configuration

Separate country packs from language.

A user may choose a language independently from the business’s:

- country;
- currencies;
- tax;
- payroll;
- documents;
- payment providers; and
- regulatory configuration.

Zimbabwe is the first country pack.

## 7. API

- Accept locale preference through an approved mechanism.
- Return stable codes and canonical values.
- Translate server messages via keys or client catalogues.
- Do not encode permissions in translated labels.
- Events/webhooks use stable machine values.
- Exports/documents specify locale and country configuration.

## 8. Database

Persist:

- user locale preference;
- tenant default locale;
- country;
- time zone;
- document-language preference where required; and
- catalogue/configuration version where audit matters.

Do not create a database column for every translated UI string.

## 9. Mobile and offline

- Bundle/cache essential catalogues.
- English fallback when catalogue unavailable.
- Queue stable values, not translated labels.
- Allow text expansion.
- Support relevant keyboards.
- Test modest devices and variable networks.

## 10. AI

- Pass explicit requested language.
- Keep structured business values separate.
- Evaluate each language independently.
- Review terminology natively.
- Preserve safety/refusal/permission behavior.
- State fallback clearly.

## 11. SEO and public content

If public pages are localised:

- crawlable language URLs;
- translated title/description;
- canonical and `hreflang`;
- translated structured data where appropriate;
- approved social metadata; and
- no duplicate/fallback ambiguity.

## 12. Testing

Automate:

- missing keys;
- fallback;
- interpolation;
- formatting;
- persistence;
- overflow;
- accessibility labels;
- locale-independent permissions; and
- metadata.

Manually review:

- native language;
- mobile/tablet/desktop;
- zoom;
- reports/documents;
- financial/payroll meaning;
- AI output; and
- cultural appropriateness.

## 13. Expansion

Adding a language should require a catalogue and review, not component rewrites.

Adding a country should require a country pack and adapters, not scattered conditional logic.
