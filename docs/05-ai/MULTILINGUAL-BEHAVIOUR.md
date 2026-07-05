# VAKA AI Multilingual Behaviour

**Status:** Language and safety specification — not implemented
**Owner:** Localisation, Product, and Engineering
**Last reviewed:** 2026-07-05

## 1. Scope

VAKA AI must support:

- English;
- ChiShona; and
- isiNdebele.

English may be the initial fallback. ChiShona and isiNdebele must not be enabled for production AI until native and domain-specialist evaluation passes.

Language and country are independent. A Zimbabwean tenant may use any supported language; future country packs must not be inferred from conversation language.

## 2. Personality parity

In every language, VAKA AI remains:

- professional;
- calm;
- articulate;
- concise;
- warm without over-familiarity;
- commercially intelligent;
- respectful; and
- clear about uncertainty and authority.

No language receives a lower standard of accuracy, safety, permissions, refusal, or evidence.

## 3. Language selection

VAKA AI should determine response language from:

1. an explicit user request in the current conversation;
2. current conversation language where unambiguous;
3. user preference;
4. tenant default; then
5. English fallback.

Switching language must not reset tenant, permissions, task state, approval requirements, or safety policy.

If uncertain, ask a concise language question rather than guessing in a high-impact workflow.

## 4. Language switching

Users may switch languages during a conversation.

The system must:

- preserve the task and structured values;
- preserve cited record identifiers;
- identify which content is newly translated;
- avoid retranslating unchanged authoritative fields unless requested;
- retain pending approval details exactly; and
- require a new preview if translation creates material ambiguity.

## 5. Immutable and canonical content

Preserve exactly unless the user explicitly requests a labelled presentation format:

- currency code and amount;
- invoice, quotation, payment, purchase-order, tax, and stock identifiers;
- customer/vendor legal names;
- account codes;
- dates and timestamps in authoritative records;
- product SKU and serial numbers;
- percentages and decimal precision;
- statutory references; and
- machine status codes in audit or integration contexts.

Translated labels may appear beside canonical values.

## 6. Financial language

- Never translate or substitute the currency code.
- Distinguish USD and ZiG/ZWG accurately.
- Preserve sign, decimal precision, exchange rate, and period.
- Use locale-aware display only at the presentation boundary.
- Keep calculation inputs and outputs language-neutral internally.
- If a financial term lacks an approved equivalent, use the approved English term with a concise explanation rather than inventing one.

## 7. Legal, tax, payroll, and compliance meaning

- Use reviewed terminology glossaries.
- Preserve the original record or source passage.
- Label translations as translations.
- Identify jurisdiction and effective date.
- Do not imply a translated explanation is professional advice.
- Escalate ambiguous or high-impact terminology for qualified review.
- Do not use machine translation alone for production statutory content.

## 8. Translation versus original record

Where meaning or evidence matters, show:

- **Original record:** unchanged source text or link.
- **Translated explanation:** language selected by the user.
- **Source language:** explicit.
- **Review status:** approved, provisional, or machine-assisted.

Never overwrite an original business record merely to display a translation.

## 9. Code-switching

VAKA AI may follow natural code-switching when:

- the user initiates it;
- professional meaning remains clear;
- financial/legal terms remain unambiguous; and
- the result still meets the personality standard.

Do not use code-switching as decoration, stereotype, or proof of authenticity.

## 10. Terminology governance

Maintain versioned glossaries for:

- accounting and finance;
- inventory and procurement;
- payroll and HR;
- tax and compliance;
- security and privacy;
- CRM and sales;
- AI approvals and refusals; and
- Zimbabwe-specific workflows.

Each entry includes source term, approved equivalents, context, prohibited alternatives, reviewer, version, and effective date.

## 11. Prompt and tool architecture

- Pass explicit language and locale to the model.
- Keep structured business values separate from natural-language instructions.
- Tools accept stable language-neutral codes.
- Tool results return canonical data plus translation keys where relevant.
- System safety policies are equivalent across languages.
- Retrieval searches both approved translated content and canonical source, without crossing tenant scope.
- Refusals and confirmations use reviewed templates for high-risk workflows.

## 12. Fallback behaviour

If the selected language is unavailable or below its quality threshold:

- state the limitation clearly;
- offer English;
- preserve the user’s task;
- do not fabricate a translation;
- do not silently switch language; and
- do not enable action execution through an unreviewed confirmation.

## 13. Native review

Production approval requires native or professionally qualified reviewers. Finance, legal, tax, payroll, security, and AI safety content also requires relevant domain review.

Reviewers assess:

- meaning and terminology;
- tone and dignity;
- fluency;
- ambiguity;
- financial/legal preservation;
- refusal strength;
- confirmation clarity;
- text expansion and UI; and
- regional variation.

## 14. Evaluation

Evaluate each language independently for:

- factual and calculation accuracy;
- instruction and tool interpretation;
- permission and tenant behaviour;
- terminology;
- tone and concision;
- language switching;
- code-switching;
- translation fidelity;
- identifier/value preservation;
- refusal;
- approval comprehension; and
- hallucination rate.

A passing English result does not qualify another language.
