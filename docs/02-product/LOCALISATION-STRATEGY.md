# VAKA Localisation Strategy

**Status:** Product and technical direction
**Owner:** Product, Design, Engineering, and Market Operations
**Last reviewed:** 2026-07-04

## 1. Purpose

VAKA is designed in Zimbabwe and built for Africa.

Localisation is not translation alone. It covers:

- language;
- currency;
- tax;
- payroll;
- dates and numbers;
- addresses and phone numbers;
- business terminology;
- documents;
- payments and banking;
- compliance;
- connectivity;
- support; and
- market-specific workflows.

## 2. First-market principle

Zimbabwe is VAKA’s first launch market.

VAKA should solve Zimbabwean requirements deeply while preventing Zimbabwe-specific assumptions from becoming permanent core architecture.

Use:

- country-neutral core domain rules where possible;
- explicit country packs;
- provider adapters;
- typed locale catalogues;
- effective-dated tax/payroll rules; and
- professional market validation.

## 3. Launch languages

VAKA must support:

- English;
- ChiShona; and
- isiNdebele.

English may be the initial verified interface while translations are reviewed, but unavailable languages must not be presented as complete.

## 4. Language architecture

Requirements:

- all visible copy stored outside components;
- typed translation keys;
- stable machine values separate from translated labels;
- locale fallback to English;
- browser-language awareness;
- user preference;
- optional tenant default;
- translated navigation, forms, validation, errors, metadata, reports, notifications, and accessibility labels;
- interpolation and pluralisation;
- missing-key monitoring; and
- versioned translation catalogues.

Recommended locale structure:

```text
locales/
  en/
  sn/
  nd/
```

Locale codes must be confirmed against product and standards requirements.

## 5. Translation governance

- English source copy requires product/brand approval.
- ChiShona and isiNdebele require native or professionally qualified reviewers.
- Financial, legal, payroll, tax, security, and AI terminology requires specialist review.
- Machine translation may assist drafting but is not final approval.
- Translators need product context, screenshots, variables, character limits, and tone guidance.
- Every release should identify changed keys.
- Urgent corrections require an owned escalation path.

## 6. Formats

Use locale-aware handling for:

- dates;
- time and time zones;
- numbers;
- decimal/grouping separators;
- currencies;
- percentages;
- names;
- addresses;
- phone numbers;
- sorting and searching; and
- plural forms.

Store canonical values. Format at the presentation boundary.

## 7. Currency

Zimbabwe launch must support USD and ZiG/ZWG business workflows.

- Preserve ISO/technical codes in storage.
- Use approved customer-facing terminology.
- Store exchange rates with effective time and source.
- Snapshot rates on transactions.
- Never revalue historical postings silently.
- State transaction and base currency in reports.
- Make additional currencies configurable for future markets.

## 8. Country packs

A country pack should define:

- country and supported regions;
- languages and terminology;
- currencies;
- taxes and rates;
- statutory identifiers;
- chart-of-accounts template;
- document requirements;
- invoice numbering;
- payroll rules;
- fiscalisation/e-invoicing adapters;
- payment methods;
- bank import formats;
- address and phone rules;
- retention requirements;
- legal links; and
- effective dates.

Core code must not use scattered country-condition checks where configuration or an adapter is appropriate.

## 9. Mobile and offline localisation

Localisation must work on modest mobile devices and variable connectivity.

- Allow translated text to expand.
- Do not shrink copy to force it into English-sized controls.
- Cache essential catalogues.
- Define fallback when a catalogue cannot load.
- Keep offline records in stable machine values.
- Resolve sync conflicts without changing translated meaning.
- Test fonts, keyboards, autocorrect, and text input.

## 10. Content localisation

Localise:

- product interface;
- onboarding;
- help and support;
- legal/privacy content;
- emails, SMS, and WhatsApp templates;
- invoices and reports where required;
- customer/supplier portals;
- payroll documents;
- public website and metadata; and
- VAKA AI.

Some business documents may require bilingual output. This must be configurable and professionally reviewed.

## 11. VAKA AI localisation

AI must be evaluated independently in each supported language.

Test:

- factual accuracy;
- tone;
- business terminology;
- financial and payroll meaning;
- code-switching;
- dates and currencies;
- safety/refusal behavior;
- permission consistency; and
- hallucination.

English quality is not evidence of ChiShona or isiNdebele quality.

## 12. Expansion into Africa

Before entering a country:

1. conduct market and workflow research;
2. identify legal, tax, payroll, privacy, and data-residency requirements;
3. recruit qualified local reviewers;
4. build/validate the country pack;
5. add payment, banking, fiscalisation, and communication adapters;
6. translate and review content;
7. run a controlled pilot;
8. validate support operations; and
9. approve a country go-live checklist.

Avoid treating Africa as one homogeneous market.

## 13. Testing

Automate:

- missing/unused keys;
- fallback behavior;
- variable interpolation;
- date, number, and currency formatting;
- translated metadata;
- text overflow at key breakpoints;
- keyboard and screen-reader labels;
- locale persistence;
- country-pack selection; and
- access/permission equivalence across languages.

Manual review includes:

- native-language QA;
- 200%/400% zoom;
- mobile devices;
- documents and reports;
- business terminology;
- legal and financial meaning; and
- cultural appropriateness.

## 14. Rollout

1. Extract and approve English source content.
2. Implement locale infrastructure and fallback.
3. Add native-reviewed ChiShona.
4. Add native-reviewed isiNdebele.
5. Extend to notifications, documents, and support.
6. Extend to VAKA AI after language-specific evaluation.
7. Add new languages through country expansion programmes.

## 15. Success measures

- percentage of interface keys translated and approved;
- missing-key rate;
- localisation defect rate;
- task completion by language;
- support requests related to language;
- translated layout/accessibility failures;
- country-pack configuration coverage; and
- user-selected language adoption.
